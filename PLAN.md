# Plan: Autonomiczna Pętla ExoSkull

## Diagnoza

System ma **70% kodu gotowego** — 41 CRONów, Ralph Loop, Conductor, MAPE-K, App Builder, Skill System — ale **pętla nigdy się nie zamyka** z 3 powodów:

### Root Causes:

1. **BRAK PERMISSIONS** — tabela `user_autonomy_grants` jest PUSTA. Każda autonomiczna akcja (SMS, task, email) trafia na `isActionPermitted()` → `{ granted: false }` → akcja blokowana po cichu. System pracuje (interwencje tworzone, strategie generowane) ale **NIGDY nie wykonuje**.

2. **MAPE-K nie podłączone** — pełna implementacja Monitor→Analyze→Plan→Execute→Knowledge istnieje w `lib/autonomy/mape-k-loop.ts`, ale **żaden CRON go nie wywołuje**. Jedyny trigger to manual/event — który nigdy nie przychodzi.

3. **Skill detection → generation gap** — Detector wykrywa potrzeby (post-conversation CRON), zapisuje do `exo_skill_suggestions`, ale **żaden scheduler nie wywołuje generatora**. Sugestie gniją w bazie.

### Konsekwencje:
- User nie widzi żadnej autonomicznej aktywności
- System "myśli" ale nie "działa"
- Apki budowane tylko na explicite request w chacie
- Optymalizacja = dead code

---

## Architektura Rozwiązania

### Warstwa 1: UNBLOCK — Odblokowanie autonomii (krytyczne)

#### 1.1 Default Permissions na onboarding
**Plik:** `lib/autonomy/default-grants.ts` (NOWY)
**Plik:** `lib/autonomy/permission-model.ts` (MODIFY)

Przy tworzeniu tenanta → insert default grants:
```
send_sms:wellness     → granted (check-iny, wellness)
send_sms:goal         → granted (goal progress)
send_email:summary    → granted (daily/weekly summary)
create_task:*         → granted (tworzenie tasków)
log_health:*          → granted (auto-logowanie zdrowia)
send_notification:*   → granted (notyfikacje in-app)
trigger_checkin:*     → granted (inicjowanie check-inów)
```

HIGH-RISK (require explicit opt-in):
```
send_sms:stranger     → denied (dzwonienie do obcych)
spend_money:*         → denied (wydatki)
delete_data:*         → denied (usuwanie)
modify_source:*       → denied (self-modification)
```

+ Migracja DB: insert grants dla istniejących tenantów
+ Fallback: jeśli brak grantów → użyj defaults (nie fail silently)

#### 1.2 Wire MAPE-K do CRON
**Plik:** `app/api/cron/loop-15/route.ts` (MODIFY)

Dodaj wywołanie `runAutonomyCycle(tenantId, "cron")` w loop-15 (co 15 min, po Ralph).
MAPE-K będzie:
- Monitor: zbiera dane z ostatnich 15min
- Analyze: AI klasyfikuje sytuację
- Plan: generuje plan interwencji
- Execute: wykonuje (teraz z permissions!)
- Knowledge: zapisuje co zadziałało

#### 1.3 Skill Auto-Generator
**Plik:** `app/api/cron/skill-auto-generator/route.ts` (NOWY)
**Plik:** `lib/skills/auto-generator.ts` (NOWY)

CRON (daily @ 4 AM):
1. Fetch `exo_skill_suggestions` WHERE status = 'pending' AND confidence > 0.8
2. Dla każdego: `generateSkill()` → validate → smoke test
3. Low-risk + smoke test passed → auto-approve → register as dynamic tool
4. Medium/high-risk → send SMS approval request
5. Mark suggestion as processed

---

### Warstwa 2: CLOSE THE LOOP — Zamknięcie pętli feedback

#### 2.1 Goal → Daily Actions Pipeline
**Plik:** `lib/goals/daily-action-planner.ts` (NOWY)
**Hook:** CRON morning-briefing (MODIFY)

Każdego ranka:
1. Load active goals z trajectory != 'completed'
2. Dla każdego off_track/at_risk goalu:
   - AI generuje 1-3 concrete actions na dzisiaj
   - Actions → `create_task` (z permission check, teraz granted!)
   - Morning briefing zawiera: "Dziś dla celu X: zrób Y, Z"
3. Wieczorem (evening-reflection):
   - Check czy daily actions wykonane
   - Update goal progress
   - Adjust strategy jeśli 3 dni z rzędu fail

#### 2.2 Outcome Tracking
**Plik:** `lib/autonomy/outcome-tracker.ts` (NOWY)
**Tabela:** `exo_intervention_outcomes` (NOWA migracja)

Po każdej interwencji:
1. Track: czy user odpowiedział? (SMS reply, app interaction)
2. Track: czy zachowanie się zmieniło? (metrics before/after)
3. Score: effectiveness 0-1
4. Feed back do MAPE-K Knowledge phase

Schema:
```sql
CREATE TABLE exo_intervention_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES exo_interventions(id),
  tenant_id UUID NOT NULL,
  outcome_type TEXT, -- 'user_response', 'behavior_change', 'goal_progress', 'ignored'
  effectiveness FLOAT, -- 0.0 - 1.0
  response_time_minutes INT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2.3 Learning Engine
**Plik:** `lib/autonomy/learning-engine.ts` (NOWY)

MAPE-K Knowledge phase → po zebraniu outcomes:
1. Który typ interwencji działa najlepiej? (SMS vs email vs call)
2. O jakiej porze user najchętniej odpowiada?
3. Jakie framing działa? (direct vs gentle vs humor)
4. Zapisz do `exo_tenant_preferences` (nowa tabela lub extend existing)
5. Następny cykl MAPE-K → użyj tych preferencji w Analyze phase

---

### Warstwa 3: PROACTIVE APP BUILDING — System sam buduje

#### 3.1 Auto-activate IORS-suggested apps
**Plik:** `lib/apps/generator/app-generator.ts` (MODIFY)

Zmiana: jeśli `source === "iors_suggestion"` i:
- Risk level = low (no external APIs, no PII)
- Smoke test passed
- User ma >= 1 aktywną apkę (nie jest zupełnie nowy)
→ Auto-activate (status: "approved", create table, add widget)
→ Notyfikuj usera: "Stworzyłem tracker X — zobacz na dashboardzie"

#### 3.2 Need Detection → Build Pipeline
**Plik:** `lib/apps/auto-builder.ts` (NOWY)
**Hook:** post-conversation CRON (MODIFY)

Po każdej rozmowie:
1. Skill detector already runs → sugestie
2. NOWE: Filtruj sugestie typu "tracker/app" (vs "tool/skill")
3. Jeśli confidence > 0.85 i user mentioned it 3+ times:
   - Trigger `generateApp()` with source: "auto_detection"
   - Auto-activate (low risk)
   - Notify user via preferred channel

#### 3.3 App Optimization Loop
**Plik:** `lib/apps/app-optimizer.ts` (NOWY)
**Hook:** Conductor work catalog (MODIFY — add work type)

Weekly per app:
1. Check usage stats (from `exo_generated_apps.usage_stats`)
2. Low usage (< 3 entries/week) → suggest improvement or archive
3. High usage → analyze patterns → suggest additional columns/views
4. Generate optimization intervention

---

### Warstwa 4: VISIBLE OPTIMIZATION — User widzi że system się uczy

#### 4.1 System Evolution Feed
**Plik:** `lib/stream/evolution-events.ts` (NOWY lub extend existing)

Real-time feed widoczny na dashboardzie:
- "Nauczyłem się, że wolisz SMSy o 9 rano"
- "Zbudowałem tracker wody — 3x wspomniałeś o piciu"
- "Twoja strategia biegania nie działa — zmieniam podejście"
- "Optymalizuję morning briefing — dodaję sekcję goale"

#### 4.2 Optimization Dashboard Widget
**Plik:** Extend existing `OptimizationWidget.tsx`

Pokaż:
- Effectiveness score (interwencje: % successful)
- Learning log (co system odkrył)
- Active strategies (jakie plany realizuje)
- Apps auto-generated (co zbudował)
- Next planned actions

---

## Kolejność Implementacji

```
Phase 1: UNBLOCK (1-2 dni)
├─ 1.1 Default permissions + migracja ← NAJWAŻNIEJSZE, odblokuje cały system
├─ 1.2 Wire MAPE-K do loop-15
└─ 1.3 Skill auto-generator CRON

Phase 2: CLOSE LOOP (2-3 dni)
├─ 2.1 Goal → daily actions pipeline
├─ 2.2 Outcome tracking + migracja
└─ 2.3 Learning engine

Phase 3: AUTO-BUILD (1-2 dni)
├─ 3.1 Auto-activate IORS apps
├─ 3.2 Need detection → build pipeline
└─ 3.3 App optimization loop

Phase 4: VISIBILITY (1 dzień)
├─ 4.1 Evolution feed
└─ 4.2 Dashboard widget update
```

## Pliki do stworzenia/modyfikacji

### NOWE pliki (8):
1. `lib/autonomy/default-grants.ts`
2. `lib/autonomy/outcome-tracker.ts`
3. `lib/autonomy/learning-engine.ts`
4. `lib/goals/daily-action-planner.ts`
5. `lib/skills/auto-generator.ts`
6. `app/api/cron/skill-auto-generator/route.ts`
7. `lib/apps/auto-builder.ts`
8. `lib/apps/app-optimizer.ts`

### MODYFIKACJE (6):
1. `lib/autonomy/permission-model.ts` — fallback na defaults
2. `app/api/cron/loop-15/route.ts` — dodaj MAPE-K call
3. `app/api/cron/morning-briefing/route.ts` — dodaj daily actions
4. `app/api/cron/evening-reflection/route.ts` — check daily actions completion
5. `lib/apps/generator/app-generator.ts` — auto-activate IORS apps
6. `lib/conductor/work-catalog.ts` — dodaj app_optimization work type

### MIGRACJE DB (2):
1. `supabase/migrations/YYYYMMDD_default_autonomy_grants.sql`
2. `supabase/migrations/YYYYMMDD_intervention_outcomes.sql`

## Ryzyko

| Ryzyko | Mitygacja |
|--------|-----------|
| System spamuje usera SMSami | Rate limit 8/dzień already exists + learning engine adjusts |
| Auto-generated app jest zły | Smoke test + notify user (can delete) |
| Permissions zbyt szerokie | Start conservative, widen based on user behavior |
| MAPE-K co 15 min = drogo | Budget gate already in loop-15 (daily AI budget per tenant) |
| Learning engine halucynuje | Base only on measured outcomes, not AI speculation |
