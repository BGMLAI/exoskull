# IORS — Architektura Techniczna

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Zależności:** [IORS_VISION.md](./IORS_VISION.md), [IORS_FRAMEWORKS.md](./IORS_FRAMEWORKS.md)

---

## 1. Topologia: Centralized-First z Federated Roadmap

### Decyzja: Centralized z privacy-by-design, federated jako Phase 3+

**Rozważone alternatywy:**

| Opcja | Za | Przeciw | Werdykt |
|---|---|---|---|
| **Fully Federated** | Max prywatność, brak single point of failure | Wymaga specjalistycznej infry (nie Vercel/Supabase), wolniejsze uczenie, 10x complexity | ❌ Za wcześnie |
| **Fully Centralized** | Proste, szybkie, nasz stack | Single point of failure, trust issue, ograniczone skalowanie | ❌ Za uproszczone |
| **Hybrid: Central + Privacy-by-Design** | Istniejący stack, strong privacy, migration path do federated | Wymaga dobrego designu od dnia 1 | ✅ **Wybrany** |

**Uzasadnienie:** Federated learning wymaga specjalistycznej infrastruktury (TensorFlow Federated, PySyft, Flower framework) — nie działa z Next.js/Vercel. Ale architektura MUSI być od dnia 1 zaprojektowana tak, żeby federated był możliwy w Phase 3. Dlatego: centralized z per-tenant isolation + differential privacy na agregatach + abstrakcja dostępu do danych.

### Warstwy prywatności (od dnia 1)

```
┌─ Per-Tenant Isolation (RLS) ──────────────────────────┐
│                                                        │
│  User A          User B          User C                │
│  ┌──────┐        ┌──────┐        ┌──────┐             │
│  │ Data │        │ Data │        │ Data │             │
│  │ IORS │        │ IORS │        │ IORS │             │
│  │ Mods │        │ Mods │        │ Mods │             │
│  └──────┘        └──────┘        └──────┘             │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │  Aggregate Layer (Differential Privacy)         │   │
│  │  ε-differential privacy na statystykach         │   │
│  │  Żaden insight nie identyfikuje jednostki       │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │  Data Abstraction Layer                         │   │
│  │  Unified interface → ready for federated        │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

**Implementacja:**
- **Per-tenant RLS** — istniejące, `auth.jwt() ->> 'tenant_id' = tenant_id` na KAŻDEJ tabeli
- **Szyfrowanie at rest** — AES-256 (Supabase default)
- **Szyfrowanie in transit** — TLS 1.3
- **Data Abstraction Layer** — nowy `lib/data-access/` interface (nie raw SQL, ale `DataAccessLayer.query(tenantId, ...)`) → gotowy na zamianę backend z Postgres na federated
- **Differential privacy** — na agregatach (np. "70% użytkowników śpi <7h") dodajemy szum Laplace'a. Biblioteka: `opendp` lub custom
- **GDPR** — data export per tenant, right to delete, data portability
- **BYOK encryption** — opcjonalnie user dostarcza własny klucz szyfrujący (Phase 2)

### Federated Roadmap (Phase 3+)

Gdy skala osiągnie 100K+ users:
1. Flower framework do federated learning (Python sidecar)
2. On-device model fine-tuning (mobilne modele, ONNX)
3. Secure aggregation — MPC (multi-party computation)
4. Local-first data z selective cloud sync

---

## 2. Warstwy Systemu jako Pętle Tau

Każda warstwa to NIE statyczny serwis — to pętla z cyklem: **obserwuj → działaj → feedback → adaptuj**.

### Architektura 5 Pętli (zamiast 6 Tierów)

Stara architektura miała 6 tierów (Interface, Orchestration, Intelligence, Memory, Execution, Operations). Nowa ma **5 Pętli** — bo każdy komponent to żywy cykl, nie statyczny tier:

```
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA 1: PERCEPCJA (dawny Interface Layer)                  │
│  Obserwuj → Parsuj → Routuj → Feedback na jakość parsowania │
│                                                              │
│  Gateway 12 kanałów → Unified Message Format → Router        │
│  Voice pipeline: Twilio→ElevenLabs STT→LLM→ElevenLabs TTS  │
│  Multimodal: tekst, głos, obrazy, dokumenty, wideo          │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA 2: ROZUMIENIE (dawny Intelligence Layer)              │
│  Klasyfikuj → Reasoning → Decyzja → Feedback na trafność    │
│                                                              │
│  Intent detection + emotion analysis + Tau (zasoby × tło)   │
│  4-tier AI routing (Flash→Haiku→Sonnet→Opus)                │
│  Crisis detection (3 warstwy) + async Q&A queue             │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA 3: DZIAŁANIE (dawny Execution Layer)                  │
│  Planuj → Wykonaj (deterministic tools) → Weryfikuj → Adapt │
│                                                              │
│  Mod executor + Rig connector + Outbound actions             │
│  Skill generator + Mod composition (natural language)        │
│  Autonomiczne akcje w ramach zgód                            │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA 4: PAMIĘĆ (dawny Memory + Data Layer)                 │
│  Zapisz → Indeksuj → Przypomnij → Feedback na relevance     │
│                                                              │
│  Bronze (R2 Parquet) → Silver (Postgres) → Gold (Views)     │
│  Total recall + pgvector embeddings + keyword search         │
│  User corrections loop (user poprawia → system uczy się)     │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PĘTLA 5: EWOLUCJA (dawny Operations + Self-Optimization)    │
│  Mierz → Analizuj → Optymalizuj → Feedback na efektywność   │
│                                                              │
│  Self-optimization engine + Pętla 15-min (bicie serca)       │
│  Feedback loops (explicit + implicit) + A/B personality      │
│  Mod lifecycle + system health + CRON orchestration          │
└─────────────────────────────────────────────────────────────┘
```

**Kluczowa różnica vs stary system:** Każda warstwa ma FEEDBACK LOOP. Percepcja uczy się lepiej parsować. Rozumienie uczy się lepiej klasyfikować. Działanie uczy się lepiej wykonywać. Pamięć uczy się co jest relevantne. Ewolucja mierzy i optymalizuje resztę.

---

## 3. Pipeline Determinizmu AI

### Zasada: LLM = Reasoning, Tools = Execution

LLM jest probabilistyczny. Biznes logic musi być deterministyczny. Separacja:

```
┌─────────────────────────────────────┐
│  LLM (probabilistyczny)             │
│                                     │
│  - Rozumienie intencji              │
│  - Reasoning o sytuacji             │
│  - Wybór narzędzia / strategii      │
│  - Generowanie tekstu               │
│  - Analiza emocji                   │
│                                     │
│  OUTPUT: structured decision        │
│  (tool_name, params, confidence)    │
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│  VALIDATION GATE (deterministyczny)  │
│                                     │
│  - Schema validation (Zod)          │
│  - Permission check (autonomy)      │
│  - Rate limiting                    │
│  - Safety check (crisis keywords)   │
│  - Budget check (cost threshold)    │
│                                     │
│  PASS → execute | FAIL → escalate   │
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│  TOOL (deterministyczny)             │
│                                     │
│  - API call (Twilio, Google, etc.)  │
│  - Database operation               │
│  - File operation                   │
│  - Calculation                      │
│  - External service call            │
│                                     │
│  OUTPUT: deterministic result       │
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│  FEEDBACK CAPTURE                    │
│                                     │
│  - Log decision + result            │
│  - Track success/failure            │
│  - Update confidence scoring        │
│  - Explicit feedback (👍/👎)       │
│  - Implicit feedback (engagement)   │
└─────────────────────────────────────┘
```

### Implementacja: istniejący `processUserMessage()` pipeline

Istniejący pipeline w `conversation-handler.ts` już realizuje tę separację:
1. `handleInboundMessage()` — routing (deterministyczny)
2. `processUserMessage()` — LLM reasoning + tool selection (probabilistyczny)
3. 28+ tools — execution (deterministyczny)
4. Response → channel adapter → user

**Co dodać:**
- `ValidationGate` przed każdym tool call (Zod schema + autonomy check + budget check)
- `FeedbackCapture` po każdym tool call (log + metrics)
- `ConfidenceScoring` — track which LLM decisions lead to good outcomes

### Nowe narzędzia (do dodania do 28 istniejących)

| Tool | Opis | Kategoria |
|---|---|---|
| `create_mod` | IORS proponuje i tworzy nowy mod | Ewolucja |
| `compose_mods` | Łączy 2+ modów w pipeline | Ewolucja |
| `adjust_personality` | Zmienia parametry osobowości IORS | Personalizacja |
| `schedule_outbound` | Planuje outbound call/message | Autonomia |
| `propose_autonomy` | Proponuje userowi nową zgodę autonomii | Autonomia |
| `tau_assess` | Ocena zasoby × tło (Tau decision framework) | Rozumowanie |
| `async_think` | Odkłada odpowiedź do async queue | Async Q&A |
| `cross_instance_msg` | Wysyła wiadomość do Bizzon/innego IORS | Hierarchia |

---

## 4. Self-Learning, Self-Optimizing, Self-Replicating

### Self-Learning: Feedback Loops na każdym poziomie

**Explicit feedback:**
- 👍/👎 na każdą odpowiedź IORS
- "To nie o to mi chodziło" → korekta intent detection
- "Nie pisz do mnie o 6 rano" → korekta proactivity timing
- "Podoba mi się ten styl" → wzmocnienie stylu

**Implicit feedback:**
- Czas odpowiedzi usera (szybka = good, brak = bad/irrelevant)
- Skip rate (user ignoruje → zmniejsz częstotliwość)
- Engagement patterns (co user czyta, co pomija)
- Mod usage (często = wartościowy, nigdy = do archiwizacji)
- Session length (dłuższe = zaangażowanie)

**Jak to wpływa na system:**

```typescript
interface FeedbackSignal {
  type: 'explicit_positive' | 'explicit_negative' | 'implicit_engagement' | 'implicit_skip';
  context: {
    tool_used: string;
    intent_detected: string;
    time_of_day: string;
    channel: string;
    emotional_state: string;
  };
  outcome: 'success' | 'failure' | 'neutral';
}

// System uczy się:
// - Które narzędzia działają w jakim kontekście
// - Kiedy user chce proaktywność a kiedy ciszę
// - Jaki styl komunikacji preferuje o jakiej porze
// - Które mody generują wartość
```

**Storage:** `exo_feedback_signals` tabela, agregacja do `gold.feedback_patterns` (materialized view, daily).

### Self-Optimizing: Pętla Ewolucji

```
Mierz (metrics) → Analizuj (patterns) → Generuj hipotezę → Testuj (A/B) → Wdróż / Wycofaj
```

Konkretne optymalizacje:
- **Proactivity timing** — system uczy się kiedy user reaguje najlepiej (CRON → adaptive scheduling)
- **Model selection** — track which AI tier gives best results per task type → route smarter
- **Mod relevance** — auto-archive mody nieużywane 30 dni (z powiadomieniem)
- **Response length** — track engagement vs response length → optimize
- **Channel preference** — learn which channel user prefers for what type of message

### Self-Replicating: Hierarchia Instancji

IORS tworzy pod-instancje:

```
IORS (root)
├── Bizzon A (firma freelance)
│   ├── Agent: Fakturowanie
│   ├── Agent: Obsługa klienta
│   └── Agent: Calendar management
├── Bizzon B (sklep online)
│   ├── Agent: Inventory
│   ├── Agent: Customer support
│   └── Agent: Marketing
├── Personal Agent: Sleep optimizer
├── Personal Agent: Social planner
└── Personal Agent: Finance tracker
```

Każda pod-instancja:
- Ma własny context window (izolowany)
- Dziedziczy LOOPCODE + personalizację od parent IORS
- Komunikuje się z parent przez structured messages (nie shared context)
- Ma ograniczony scope (tylko to co potrzebne)
- Może być wyłączona/usunięta przez usera

**Implementacja:**
- `exo_instances` tabela: `id, parent_id, type (iors|bizzon|agent), config JSONB, status`
- Komunikacja: message queue (istniejący async task queue)
- Izolacja: osobny system prompt per instancja, shared data access przez Data Abstraction Layer

---

## 5. Pętla 15-min — Implementacja

### Problem: 25 CRONów to za mało i za sztywne

Obecny system ma 25 CRON jobs na sztywnych harmonogramach. To nie jest "bicie serca" — to sztywny timer. Potrzebujemy:
- Adaptive scheduling (nie co 15 min sztywno, ale "co 15 min LUB wcześniej jeśli coś się zmieniło")
- Priority-based execution (emergency > proaktywna > obserwacja > utrzymanie)
- Cost-efficient (nie wybudzaj Opus co 15 min jeśli nic się nie dzieje)

### Architektura: Event-Driven + Pętla Hybrid

```
┌─ Event Sources ────────────────────────────────────┐
│                                                     │
│  Inbound message (any channel)     ──┐              │
│  Rig data update (zewnętrzne serwisy, Google)    ──┤              │
│  Calendar event approaching        ──┤   EVENT      │
│  Mod trigger (threshold crossed)   ──┤   BUS        │
│  User feedback (👍/👎)            ──┤   (Postgres   │
│  External webhook                  ──┘   NOTIFY)    │
│                                                     │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─ Pętla (CRON co 15 min) ───────────────────────┐
│                                                     │
│  "Czy jest coś do zrobienia?"                       │
│                                                     │
│  1. Check event queue (pending events)              │
│  2. Check scheduled actions (upcoming)              │
│  3. Check data freshness (stale? fetch new)         │
│  4. Check pending async tasks                       │
│  5. Run health checks                               │
│                                                     │
│  IF nothing → sleep (cheap, Gemini Flash check)     │
│  IF something → process (appropriate tier)          │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─ Priority Router ──────────────────────────────────┐
│                                                     │
│  P0: Emergency (crisis, security)     → IMMEDIATE   │
│  P1: Outbound (scheduled actions)     → NEXT SLOT   │
│  P2: Proactive (insights, reminders)  → WITHIN 15m  │
│  P3: Observation (data collection)    → BATCH        │
│  P4: Optimization (self-improve)      → LOW PRIO    │
│  P5: Maintenance (ETL, cleanup)       → OFF-PEAK    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Implementacja techniczna

**Event bus:** Postgres `LISTEN/NOTIFY` (istniejący, darmowy) + Vercel CRON jako pętla.

**Nie 1 CRON, ale 3:**
1. `api/cron/pętla` — co 1 min, ultra-light (Gemini Flash): "jest coś w event queue?" → jeśli tak, dispatch
2. `api/cron/loop-15` — co 15 min, medium (Haiku): pełna ewaluacja stanu per tenant (batched)
3. `api/cron/loop-daily` — co 24h, heavy (Sonnet): deep analysis, pattern detection, self-optimization

**Event queue:** Reuse istniejący `exo_async_tasks` z nowymi typami:
- `pętla_check` — trigger od event
- `proactive_intervention` — IORS inicjuje
- `outbound_action` — scheduled outbound
- `observation` — data collection
- `optimization` — self-improve

**Cost control:** Pętla (1 min) to dosłownie 1 SQL query + 1 Gemini Flash call (<$0.001). Loop-15 to ~$0.01-0.05 per tenant per run. Loop-daily to ~$0.10-0.50 per tenant.

### Per-tenant adaptive timing

Nie każdy tenant co 15 min. System uczy się:
- Active user (dużo interakcji) → co 5 min
- Normal user → co 15 min
- Dormant user (brak aktywności 24h) → co 1h
- Sleeping (noc w timezone usera) → co 4h (chyba że emergency)

Tabela: `exo_tenant_loop_config`: `tenant_id, frequency_minutes, last_run, next_run, priority_override`

---

## 6. System Autonomii i Zgód

### Granularny model zgód

```typescript
interface AutonomyPermission {
  id: string;
  tenant_id: string;

  // Co IORS może robić
  action_type: 'call' | 'message' | 'schedule' | 'purchase' | 'cancel' | 'log' | 'create_mod' | 'share_data';

  // W jakim kontekście
  domain: 'health' | 'finance' | 'social' | 'work' | 'home' | 'business' | '*';

  // Z jakim limitem
  threshold?: {
    amount_max?: number;       // max koszt w PLN
    frequency_max?: number;    // max razy dziennie
    requires_confirmation?: boolean;  // zawsze pytaj
  };

  // Status
  granted: boolean;
  granted_at: string;
  revoked_at?: string;

  // Audit trail
  uses: number;
  last_used?: string;
}
```

**Tabela:** `exo_autonomy_permissions` z RLS per tenant.

**Workflow:**
1. IORS wykrywa potrzebę autonomicznej akcji
2. Check: `exo_autonomy_permissions` — czy ma zgodę?
3. Jeśli tak → execute (log to audit)
4. Jeśli nie → propose_autonomy tool: "Chcę umówić Ci wizytę u lekarza. Chcesz żebym mógł to robić bez pytania?"
5. User decyduje (in-chat lub ExoSkull panel)

**Default permissions (narodziny IORS):**
- `log` w `*` domain → granted (IORS może logować dane)
- Wszystko inne → not granted (user musi explicite włączyć)

**Panel ExoSkull:** Sekcja "Autonomia" — grid z toggles per action × domain, slider dla thresholds.

---

## 7. Kompozycja Modów (Natural Language)

### Jak mody się łączą

Mod to nie izolowany tracker. Mody łączą się tworząc większe systemy — przez natural language, nie przez code wiring.

```
User: "Chcę żeby mój sleep tracker wpływał na mój kalendarz"

IORS:
1. Rozpoznaje: sleep_tracker + calendar_manager = composition needed
2. Generuje pipeline:
   sleep_tracker.output.sleep_quality → IF < 70 → calendar_manager.block_morning_meetings
3. Propozycja: "Kiedy śpisz źle (poniżej 70), zablokuję porannych spotkań. OK?"
4. User: "OK"
5. Composition stored + active
```

### Architektura kompozycji

```typescript
interface ModComposition {
  id: string;
  tenant_id: string;
  name: string;  // generated or user-defined

  // Mody źródłowe
  source_mods: string[];  // ['sleep_tracker', 'calendar_manager']

  // Pipeline (deterministyczny)
  pipeline: PipelineStep[];

  // Trigger
  trigger: 'on_data' | 'on_schedule' | 'on_event' | 'on_demand';

  // Metadata
  created_by: 'iors_proposed' | 'user_requested';
  active: boolean;
}

interface PipelineStep {
  source_mod: string;
  source_output: string;   // e.g., 'sleep_quality'
  condition?: string;       // e.g., '< 70'
  target_mod: string;
  target_action: string;    // e.g., 'block_morning_meetings'
  params?: Record<string, any>;
}
```

**Tabela:** `exo_mod_compositions` — JSONB pipeline, RLS per tenant.

**Execution:** W Pętli 15-min, po update danych źródłowego moda → sprawdź compositions → execute pipeline.

### Natural Language → Pipeline

`compose_mods` tool:
1. User mówi co chce (natural language)
2. LLM generuje pipeline definition (structured JSON)
3. Validation gate: czy mody istnieją? czy user ma uprawnienia? czy pipeline jest safe?
4. Propozycja do usera (w ludzkiej formie)
5. User akceptuje → active

**Przykłady kompozycji:**
- Sleep × Calendar → "blokuj poranne spotkania po złym śnie"
- Finance × Notifications → "alert jeśli wydatki przekroczą budżet o 20%"
- Health × Social → "zaproponuj spotkanie z kimś jeśli 0 kontaktów socjalnych 7 dni"
- Mood × Music → "gdy nastrój nisko, włącz uplifting playlista"
- Business × Finance → "auto-generuj fakturę po zakończeniu projektu"

---

## 8. Inteligencja Emocjonalna — Architektura

### Pipeline analizy emocjonalnej

```
┌─ Input (multimodal) ─────────────────────────────┐
│                                                    │
│  Text: "jest ok" ──────────────┐                  │
│  Voice: pitch↑ 20%, tempo↑ ──┤  Fusion Engine   │
│  Biometrics: HRV 35 ─────────┤  (weighted avg)   │
│  Behavioral: typos↑ 40% ─────┘                   │
│                                                    │
│  Weights: voice 0.40, text 0.35, bio 0.15,        │
│          behavioral 0.10                           │
│  Boost: +20% if ≥2 sources agree                  │
│                                                    │
│  Output: emotional_state {                         │
│    valence: -0.6 (negative),                       │
│    arousal: 0.7 (high),                            │
│    label: 'anxious',                               │
│    confidence: 0.82                                │
│  }                                                 │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ Intent Detection ────────────────────────────────┐
│                                                    │
│  Surface: "jest ok" (says fine)                   │
│  Deep intent: needs support (multimodal says NOT   │
│  fine)                                             │
│                                                    │
│  Action: switch to supportive mode,                │
│  DON'T say "you seem stressed" (patronizing)       │
│  DO say "Masz dużo na głowie. Chcesz pogadać?"    │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ Crisis Detection (3 layers) ─────────────────────┐
│                                                    │
│  L1: Keyword scan (deterministic, instant)         │
│  L2: Pattern detection (behavioral change)         │
│  L3: AI reasoning (contextual analysis)            │
│                                                    │
│  IF crisis detected:                               │
│  → Immediate escalation (Opus-tier)                │
│  → Offer crisis hotline                            │
│  → Contact emergency person (if pre-authorized)    │
│  → Log for professional follow-up                  │
└────────────────────────────────────────────────────┘
```

### Async Q&A — "IORS myśli"

Nie wszystkie pytania wymagają natychmiastowej odpowiedzi. Dla złożonych tematów:

```
User: "Zastanawiam się czy powinienem zmienić pracę"

IORS (immediate): "To ważna decyzja. Daj mi chwilę — przeanalizuję twoje dane
i wrócę z przemyślaną odpowiedzią."

[async task queue → Opus-tier analysis]
[Sprawdza: finanse, satysfakcja z pracy (z rozmów), stres levels, career goals,
risk tolerance, rynek pracy]

IORS (po 2-30 min, push notification):
"Przeanalizowałem twoje dane za ostatnie 3 miesiące. Oto co widzę:
- Twój stress level rośnie od 6 tygodni
- Wspominałeś 4 razy o frustracji z projektem X
- Finansowo masz 8 miesięcy runway
- Ale: twoje zaangażowanie w work wciąż jest high na deep work sessions

Moja perspektywa: problem może nie być w pracy samej, ale w projekcie X.
Zanim zmienisz pracę — rozważ rozmowę z szefem o zmianie projektu.

Chcesz pogadać o tym więcej?"
```

**Implementacja:** Reuse `exo_async_tasks` z typem `async_think`:
- Priority: P2 (after emergency, before observation)
- Execution: Opus-tier (complex reasoning)
- Delivery: push via preferred channel (SMS/WhatsApp/Telegram/etc.)
- TTL: max 24h (jeśli nie przetworzone — odpowiedz "nie udało mi się to przemyśleć, porozmawiajmy")

### Voice Biomarkers

**Stan techniki 2026:**
- Hume AI — emotion detection API z voice (commercial, dobrze działa)
- Deepgram — prosody extraction (pitch, energy, speaking rate) — już zintegrowany
- ElevenLabs STT — transcription z metadanymi audio

**Implementacja:**
1. Deepgram prosody (istniejący) → extract pitch, energy, rate, pauses
2. Hume AI API (nowy rig) → emotion classification z audio
3. Fusion z text sentiment → unified emotional state
4. Store w `exo_emotion_signals`: `tenant_id, timestamp, source, emotional_state JSONB`
5. Gold view: `gold.emotion_trends` (daily/weekly averages)

---

## 9. Model Instancji — IORS + Bizzon = Ten Sam Produkt

### Jeden produkt, dwa tryby

IORS i Bizzon to **TEN SAM produkt**. Różnica:
- **IORS** — osobista instancja (Twoja)
- **Bizzon** — nieosobista instancja z osobowością prawną (firmy)

NIE promujemy dwóch produktów. User zakłada IORS → gdy potrzebuje business features, tworzy Bizzon jako pod-instancję.

### Komunikacja między instancjami

```typescript
interface InstanceMessage {
  from_instance_id: string;
  to_instance_id: string;
  type: 'request' | 'response' | 'notification' | 'escalation';

  // Structured payload (nie raw text — deterministic)
  payload: {
    action: string;          // e.g., 'check_calendar', 'create_invoice'
    params: Record<string, any>;
    urgency: 'low' | 'medium' | 'high' | 'emergency';
  };

  // Audit
  created_at: string;
  processed_at?: string;
  result?: any;
}
```

**Scenariusze:**

1. **IORS → Bizzon:** "Jutro mam spotkanie z klientem X. Bizzon, przygotuj briefing."
2. **Bizzon → IORS:** "Klient Y chce spotkanie w czwartek. IORS, czy user ma czas?"
3. **Bizzon A → Bizzon B:** "Potrzebuję dane z firmy B do raportu dla klienta Z."
4. **IORS A → IORS B:** (za zgodą obu stron) "Organizujemy wspólną kolację. Kiedy pasuje waszemu userowi?"
5. **IORS → Ludzie/Instytucje:** IORS komunikuje się w imieniu usera z ludźmi i instytucjami (dzwoni do lekarza, pisze do urzędu, negocjuje z dostawcą, odpowiada klientom). Pełna reprezentacja usera w świecie.

**Tabela:** `exo_instance_messages` z RLS (obie strony muszą mieć access).

**Cross-user:** Wymaga explicit consent od obu stron. `exo_cross_user_permissions`: `user_a, user_b, scope, granted`.

---

## 10. ExoSkull Dashboard — Canvas Architecture

### Od 20 hardcoded stron do dynamicznego Canvas

**Stary model:** 20 stron (health, goals, tasks, schedule, autonomy, business...) — sztywne, takie same dla wszystkich.

**Nowy model:** Jeden Canvas z dynamicznymi widgetami — unikalne per user, IORS proponuje/tworzy widgety na podstawie modów.

```
┌─────────────────────────────────────────────────────────┐
│  EXOSKULL CANVAS                                         │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Sleep Score   │  │ Today's Cal  │  │ Energy ⚡    │  │
│  │ 78/100       │  │ 3 meetings   │  │ Level: 7/10  │  │
│  │ ████████░░   │  │ Next: 14:00  │  │ ████████░░   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌────────────────────────────┐  ┌──────────────────┐   │
│  │ Bizzon: Revenue This Week  │  │ IORS Insights     │  │
│  │ $2,340 (+12% vs last week) │  │ "Twój HRV spada  │  │
│  │ 3 invoices pending         │  │  od 3 dni. Rozważ│  │
│  └────────────────────────────┘  │  odpoczynek."     │  │
│                                   └──────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ + Dodaj widget (lub powiedz IORS czego potrzebujesz) │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Widget System

```typescript
interface CanvasWidget {
  id: string;
  tenant_id: string;
  mod_slug: string;        // which mod provides data
  widget_type: 'metric' | 'chart' | 'list' | 'text' | 'action' | 'composite';

  // Layout
  position: { x: number; y: number };
  size: { w: number; h: number };

  // Config
  config: {
    title: string;
    data_source: string;     // mod output path
    refresh_interval: number; // seconds
    visualization: 'number' | 'bar' | 'line' | 'sparkline' | 'table' | 'text';
  };

  // Lifecycle
  created_by: 'iors_proposed' | 'user_added' | 'mod_default';
  visible: boolean;
}
```

**Tabela:** `exo_canvas_widgets` — per tenant, JSONB config, RLS.

**Tworzenie widgetów:**
1. IORS tworzy mod → automatycznie proponuje widget
2. User mówi "chcę widzieć X na dashboardzie" → IORS tworzy widget
3. User drag & drop na Canvas → rearrange
4. Widgety z modów, które user nie używa → ukryte (ale nie usunięte)

### Voice-First Interface

**Główny interfejs = rozmowa głosowa.** Panel ExoSkull = tło z transkrypcją i widgetami.

Hierarchia interfejsów:
1. **VOICE** (primary) — rozmowa głosowa, outbound/inbound calls
2. **MESSAGING** (secondary) — SMS, WhatsApp, Telegram, Signal, iMessage, email
3. **PANEL EXOSKULL** (tertiary) — Canvas z widgetami, transkrypcja, wizualizacje

Panel ExoSkull jest **personalizowalny przez mody** — każdy user widzi inne widgety, inny layout, inne dane.

### Zachowane strony (nie na Canvas)

- `/settings` — rozszerzony onboarding: osobowość IORS (imię, głos, styl, ton, proaktywność). NIE rozbudowany settings page z 50 opcjami — to ciągły dialog z IORS o tym kim jest.
- `/chat` — pełny interfejs konwersacyjny (z transkrypcją voice w tle)
- Canvas (`/dashboard`) — dynamiczna strona z widgetami

Reszta (health, goals, tasks, schedule, autonomy, business, skills, admin, knowledge) → **usunięta jako osobne strony, zamieniona na widgety Canvas lub obsługiwana przez rozmowę**.

---

## 11. Prywatność i Bezpieczeństwo

### Istniejące (zachować)

- Supabase RLS per tenant — `auth.jwt() ->> 'tenant_id' = tenant_id`
- AES-256 encryption at rest (Supabase)
- TLS 1.3 in transit
- CRON_SECRET for all CRON endpoints
- CSP headers (unsafe-inline for Next.js, unsafe-eval removed)
- Isolated-vm sandbox for AI-generated skills (128MB, 5s timeout)

### Nowe (dodać)

- **Data Abstraction Layer** — `lib/data-access/` — unified interface, ready for federated
- **Audit log** — `exo_audit_log`: every tool call, every data access, every autonomy action
- **Encryption keys per tenant** — (Phase 2) BYOK encryption
- **Data retention policies** — user configurable (default: unlimited, but user can set 30/90/365 days)
- **Export/Delete** — GDPR compliance: full data export (JSON), full delete (cascade)
- **Anomaly detection** — unusual access patterns → alert + lockdown

### Threat Model

| Zagrożenie | Mitygacja |
|---|---|
| Data breach (DB leak) | RLS + encryption at rest + per-tenant keys (Phase 2) |
| Rogue AI action | Autonomy permissions + validation gate + audit log |
| Skill injection (malicious mod) | Sandbox (isolated-vm) + AST analysis + approval flow |
| Cross-tenant data leak | RLS + data abstraction layer + integration tests |
| Privacy of voice data | Auto-delete recordings after processing (configurable retention) |
| GDPR request | Export + delete endpoints, data retention policies |

---

## 12. Platforma Integracji — Composio (od dnia 1)

### Dlaczego Composio zamiast custom rigs

Obecny system ma 14+ custom OAuth rigs (Google, Spotify, zewnętrzne serwisy, itp.). Każdy wymaga:
- Własnego OAuth flow
- Token refresh logic
- Error handling
- Maintenance per-API

**Composio** rozwiązuje to jednym SDK:
- 400+ gotowych integracji (Gmail, Calendar, Slack, CRM, IoT, cokolwiek)
- Unified auth flow (OAuth, API key, custom) — zero custom code per rig
- **Eliminuje problem agentic authentication** — IORS działa w imieniu usera bez zarządzania tokenami
- Composio zarządza tokenami, refresh, rate limits

### Architektura

```
User → Composio Auth UI → grants access →
IORS → Composio SDK → execute action (send email, create event, fetch data) →
Result → IORS processes
```

**Trade-off:** Dependency na Composio vs. custom flexibility.
- Mitygacja: abstrakcja w `lib/integrations/composio-adapter.ts` — łatwa podmiana na custom jeśli Composio padnie.

### Zastąpione komponenty

- `lib/rigs/` (14+ custom OAuth) → Composio connectors
- `lib/rigs/in-chat-connector.ts` (magic-link OAuth) → Composio auth flow
- Custom token refresh → Composio handles

### Nowe możliwości dzięki Composio

- **Browser actions** — Composio browser tool lub custom Playwright sandbox
- **Email send-as** — Gmail/Outlook send w imieniu usera (rozwiązuje problem "jak wysyłać maile w imieniu użytkownika")
- **CRM integration** — immediate access do HubSpot, Salesforce, itp.
- **IoT/Smart Home** — integracje z urządzeniami przez Composio
- **Anything** — 400+ apps, zero custom code

---

## 13. Email — Wysyłanie w Imieniu Użytkownika

### Problem

IORS musi wysyłać maile jako user (nie jako "system@exoskull.io"). User chce żeby IORS odpowiadał na maile, wysyłał oferty, kontaktował instytucje.

### Rozwiązanie (3 opcje, w kolejności preferencji)

1. **Composio send-as (preferowane):** User łączy Gmail/Outlook przez Composio → IORS wysyła z adresu usera. Zero dodatkowej infrastruktury.
2. **Per-user email:** `jan@exoskull.io` — IORS ma własny email per user. Koszt: ~$2/user/mo.
3. **Alias forwarding:** User ustawia alias → maile z IORS wyglądają jak od usera.

**Rekomendacja:** Composio send-as (opcja 1) od dnia 1. Fallback na opcję 2 dla userów bez Gmail/Outlook.

---

## 14. Lead Management (od dnia 1)

### IORS rozmawia z leadami PRZED rejestracją

IORS nie czeka na zarejestrowanego usera. Od pierwszego kontaktu (np. formularz na stronie, cold outreach, referral) IORS:
1. Rozmawia z leadem przez SMS/WhatsApp/email
2. Zapamiętuje WSZYSTKO (Bronze layer)
3. Identyfikuje lead po **unique email + phone**
4. Gdy lead się rejestruje → dane automatycznie importowane do `exo_tenants`

### Pre-birth memory

```sql
CREATE TABLE exo_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  phone TEXT,
  conversations JSONB DEFAULT '[]',  -- pre-registration conversations
  referral_source TEXT,               -- where they came from
  converted_tenant_id UUID,           -- NULL until registered
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE constraint on email OR phone
CREATE UNIQUE INDEX idx_leads_email ON exo_leads(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_phone ON exo_leads(phone) WHERE phone IS NOT NULL;
```

### Merge on registration

Gdy lead rejestruje się → `exo_leads.converted_tenant_id` = new tenant → conversations importowane → IORS zna usera od dnia 0.

---

## 15. Browser Actions (Automatyzacja Przeglądarki)

### Planned capabilities

IORS może wykonywać akcje w przeglądarce w imieniu usera:
- Wypełnianie formularzy (rejestracja, rezerwacja, zamówienie)
- Scraping danych (porównanie cen, monitoring ofert)
- Booking (hotel, lot, restauracja)
- Administracja (urzędy, banki, operatorzy)

### Architektura

- **Composio browser tool** (preferowane) — gotowe browser actions
- **Playwright sandbox** (fallback) — custom headless browser w kontenerze
- **Safety:** sandbox per-action, consent wymagany, screenshot audit trail
- **Budget limit:** per-action cost cap (user ustawia max)

---

## 16. Emergency Contact Verification

### Obowiązkowy kontakt kryzysowy

Przy IORS birth, user MUSI podać numer telefonu osoby do kontaktu kryzysowego.

**Flow:**
1. IORS birth → user podaje numer
2. IORS automatycznie dzwoni do osoby → weryfikuje świadomość roli
3. Re-weryfikacja co 6 miesięcy
4. User może zmienić osobę, ale ZAWSZE ktoś musi być

**Tabela:**
```sql
CREATE TABLE exo_emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  relationship TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  last_reverification TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Trigger:** Crisis detection (3-layer) → check `exo_emergency_contacts` → outbound call.

---

## 17. Inteligencja Emocjonalna — Matryca Tau

### Rozszerzenie o Tau Emotion Matrix

Sekcja 8 (powyżej) opisuje pipeline. Dodajemy klasyfikację wg Tau:

**Matryca: (znane/nieznane) × (chcę/nie chcę)**

|  | Chcę | Nie chcę |
|---|---|---|
| **Znane** | Radość, satysfakcja | Złość, frustracja |
| **Nieznane** | Ciekawość, nadzieja | Lęk, niepokój |

+ **Stopień podkrytyczności:** wysoka = żywiołowa, niska = spokojna.

**Implementacja:** `exo_emotion_signals` rozszerzony o:
```typescript
interface EmotionSignal {
  quadrant: 'known_want' | 'known_unwant' | 'unknown_want' | 'unknown_unwant';
  subcriticality: number;  // 0-1 (0=spokojna, 1=żywiołowa)
  valence: number;         // -1 to 1
  arousal: number;         // 0 to 1
  label: string;           // 'anxious', 'excited', 'angry', etc.
  confidence: number;      // 0 to 1
}
```

### Future: Camera & Digital Phenotyping

- **Camera emotion recognition:** Computer vision na video/zdjęciach (facial expression analysis). Phase 3+.
- **Digital phenotyping:** Analiza wzorców użycia urządzeń (typing speed, app switching, scroll patterns) → inferowanie stanu emocjonalnego i postaw utajonych. Phase 3+.

---

## 18. Komunikacja Real-Time

### Scenariusze wymagające real-time

- IORS↔IORS: live negotiation, collaborative sessions
- IORS↔User: crisis escalation, live assistance
- IORS↔Ludzie/Instytucje: real-time voice calls (już przez Twilio)
- Canvas: live widget updates (nowe dane → instant refresh)

### Architektura

- **WebSocket** (Supabase Realtime) — push updates do Canvas, live status
- **SSE (Server-Sent Events)** — streaming AI responses
- **Twilio** (istniejący) — real-time voice
- **Postgres LISTEN/NOTIFY** (istniejący) — inter-service events

---

## 19. Migracja z Obecnego Systemu

### Co zachowujemy (fundament Exoskullettonu)

- Gateway 12 kanałów + adaptery
- processUserMessage() + 28 tools (+ nowe)
- Mod system (exo_mod_data, IModExecutor, exo_mod_registry)
- Skill generator pipeline
- Async task queue (exo_async_tasks)
- Data lake (Bronze/Silver/Gold)
- Auth + RLS
- AI model router (4-tier)
- Emotional intelligence (crisis detection, sentiment, style matrix)
- LOOPCODE
- Voice pipeline (Twilio + ElevenLabs)

### Co usuwamy

- 20 hardcoded dashboard pages → Canvas z widgetami
- Predictive health engine (4 hardcoded models) → Generic prediction via mods
- Hardcoded onboarding (10-exchange + autoInstallMods) → Continuous discovery loop
- Domain-specific CRONs (predictions, insight-push) → Generic Pętla system
- Subscription billing tiers → Pay-per-usage
- **14+ custom OAuth rigs → Composio** (unified integration platform)
- `/knowledge` (Tyrolka) → usunięta, wiedza obsługiwana przez rozmowę + mody

### Co dodajemy

- Canvas widget system (personalizowalny przez mody)
- Voice-first interface (transkrypcja w tle)
- Pętla 15-min (event-driven + adaptive)
- **Composio integration** (400+ apps, od dnia 1)
- **Lead management** (pre-birth memory, email+phone ID)
- **Email sending** (Composio send-as + fallback)
- **Browser actions** (Playwright sandbox)
- **Emergency contact verification** (auto-call)
- **Tau Emotion Matrix** (4 kwadranty + podkrytyczność)
- Autonomy permissions system
- Mod composition (natural language)
- Instance hierarchy (IORS personal + Bizzon business = ten sam produkt)
- Async Q&A
- Data Abstraction Layer
- Feedback capture system
- Personality parameters (LOOPCODE)
- IORS birth/onboarding flow (continuous loop)
- ValidationGate + FeedbackCapture middleware
- Real-time communication (WebSocket/SSE)

---

*Szczegóły implementacji: [IORS_IMPLEMENTATION_PLAN.md](./IORS_IMPLEMENTATION_PLAN.md)*
*Frameworki wewnętrzne: [IORS_FRAMEWORKS.md](./IORS_FRAMEWORKS.md)*
