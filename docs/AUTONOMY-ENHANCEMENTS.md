# ExoSkull — Propozycje Zwiększenia Autonomii

> Analiza oparta na przeglądzie kodu: `lib/autonomy/`, `lib/goals/`, `lib/signals/`, `lib/self-modification/`, CRON handlers, MAPE-K loop.

---

## Podsumowanie

System ma solidne fundamenty autonomii (MAPE-K, Guardian, Permission Model, Learning Engine, Strategy Engine, Signal Triage, Ralph Loop), ale **zamknięte pętle zwrotne (closed loops) są niekompletne**. Dane są zbierane masowo, ale rzadko wracają do systemu decyzyjnego. Poniżej 10 konkretnych zmian, uporządkowanych od najwyższego wpływu.

---

## 1. Zamknięcie pętli Goal → Data Source (Measurable Proxies)

**Problem:** `MeasurableProxy` jest zdefiniowany w `lib/goals/goal-types.ts`, ale nigdy nie jest wypełniany. Użytkownik musi ręcznie logować postępy, mimo że dane istnieją w połączonych Rigach (Oura → sen, Google Fit → aktywność, Todoist → zadania).

**Pliki:**
- `lib/goals/goal-service.ts` — `logProgress()` wymaga ręcznego wywołania
- `lib/goals/goal-types.ts` — `MeasurableProxy` interfejs pusty
- `app/api/cron/goal-progress/route.ts` — brak auto-pozyskiwania danych

**Propozycja:**
```
Goal "Śpij 8h dziennie"
  → proxy: { source: "oura", metric: "sleep_duration_hours", aggregation: "daily_avg" }
  → CRON goal-progress:
      1. Sprawdź proxy.source → zapytaj exo_health_metrics WHERE metric_type = proxy.metric
      2. Jeśli dane istnieją → auto-logProgress() bez pytania użytkownika
      3. Jeśli brak danych → trigger rig-sync dla brakującego źródła
```

**Wpływ:** Eliminuje 90% manualnego logowania. Cel śledzi się sam.

---

## 2. Adaptacyjne Progi MAPE-K (zamiast hardcoded)

**Problem:** `mape-k-analyze.ts` używa sztywnych progów (`sleep < 6h = issue`, `activity < 30min = issue`, `overdue > 5 = overload`). Dla sportowca 30 min aktywności to mało, dla osoby z depresją to sukces.

**Pliki:**
- `lib/autonomy/mape-k-analyze.ts:45-120` — hardcoded thresholds
- `lib/autonomy/learning-engine.ts` — uczy się kanałów/godzin, ale nie progów

**Propozycja:**
```typescript
// Zamiast:
if (avgSleep < 6) issues.push({ type: "sleep_debt", severity: "medium" });

// Powinno być:
const threshold = await getPersonalizedThreshold(tenantId, "sleep_hours", {
  default: 6,
  source: "goal_target",       // Jeśli cel = "8h snu" → próg = 7h
  fallback: "population_avg",  // Jeśli brak celu → 6h
  adaptation: "30d_personal",  // Po 30 dniach danych → użyj percentyla użytkownika
});
```

**Nowa tabela:** `exo_personalized_thresholds` (tenant_id, metric, threshold_value, source, confidence, updated_at)

**Wpływ:** System dostosowuje wrażliwość do indywidualnego użytkownika zamiast zakładać "jedną normę dla wszystkich".

---

## 3. Wielokrokowe Autonomiczne Workflow (Multi-Step Executor)

**Problem:** Każda interwencja to pojedyncza akcja. Ale realne cele wymagają sekwencji: "Umów wizytę u lekarza" = znajdź lekarza → sprawdź dostępność → zarezerwuj → dodaj do kalendarza → ustaw reminder.

**Pliki:**
- `lib/autonomy/executor.ts` — `dispatchAction()` obsługuje tylko atomic actions
- `lib/goals/strategy-engine.ts` — generuje kroki, ale każdy wykonuje niezależnie

**Propozycja:** Nowy `WorkflowExecutor`:
```typescript
interface AutonomousWorkflow {
  id: string;
  tenant_id: string;
  goal_id?: string;
  steps: WorkflowStep[];
  current_step: number;
  status: "running" | "waiting_approval" | "completed" | "failed";
  context: Record<string, unknown>; // Dane przekazywane między krokami
}

interface WorkflowStep {
  action: ActionType;
  params: Record<string, unknown>;
  depends_on?: number[];  // Indeksy kroków, które muszą być gotowe
  condition?: string;     // Warunek wykonania (np. "context.doctor_found === true")
  on_failure: "retry" | "skip" | "abort" | "ask_user";
}
```

**Wpływ:** Umożliwia realizację złożonych celów autonomicznie zamiast tworzenia zadań "zrób X".

---

## 4. Zamknięcie Learning Loop → Strategia

**Problem:** `learning-engine.ts` zbiera 5 typów preferencji, a `learning_events` loguje tysiące zdarzeń, ale **żadna z tych informacji nie wraca do generowania strategii** w `strategy-engine.ts`.

**Pliki:**
- `lib/goals/strategy-engine.ts:190-250` — `collectStrategyContext()` nie czyta preferencji
- `lib/autonomy/learning-engine.ts` — zapisuje preferencje do `exo_tenant_preferences`
- `lib/autonomy/outcome-tracker.ts` — śledzi skuteczność, ale wyniki nie wpływają na planowanie

**Propozycja:**
```typescript
// W collectStrategyContext():
async function collectStrategyContext(tenantId, goalId) {
  // ... istniejący kod ...

  // DODAĆ:
  const preferences = await getAllPreferences(tenantId);
  const bestStepType = preferences.find(p => p.key === `best_goal_step_type:${goal.category}`);
  const worstInterventionType = preferences.find(p => p.key === "worst_intervention_type");
  const bestContactHour = preferences.find(p => p.key === "best_contact_hour");

  // Wstrzyknięcie do prompta AI:
  context.learnings = {
    preferredStepTypes: bestStepType?.value,
    avoidInterventionTypes: worstInterventionType?.value,
    bestContactHour: bestContactHour?.value,
    historicalSuccessRate: await getGoalCategorySuccessRate(tenantId, goal.category),
  };
}
```

**Wpływ:** Strategie stają się mądrzejsze z każdym cyklem. System uczy się co działa dla tego konkretnego użytkownika.

---

## 5. Proaktywne Rig-Sync on Demand

**Problem:** Rigi synchronizują się co 30 min (CRON rig-sync). Ale jeśli użytkownik pyta "jak spałem?" a dane mają 25 min → odpowiedź nieaktualna. Jeśli MAPE-K wykryje brak danych → nie triggeruje sync.

**Pliki:**
- `app/api/cron/rig-sync/route.ts` — tylko CRON, brak on-demand
- `lib/autonomy/mape-k-monitor.ts` — zbiera dane, ale nie triggeruje sync gdy brak

**Propozycja:**
```typescript
// W mape-k-monitor.ts collectMonitorData():
if (sleepData.length === 0 && connectedRigs.includes("oura")) {
  // Trigger natychmiastowy sync zamiast czekać na CRON
  await triggerRigSync(tenantId, "oura", "sleep");
  // Retry po 5s
  sleepData = await fetchSleepData(tenantId);
}

// Nowa funkcja w lib/rigs/rig-sync.ts:
export async function triggerRigSync(tenantId: string, rigName: string, dataType?: string);
```

**Wpływ:** Dane zawsze świeże gdy system ich potrzebuje. Eliminuje "pustą odpowiedź" bo sync jeszcze nie przyszedł.

---

## 6. Signal Triage → Closed-Loop Learning

**Problem:** `triage-engine.ts` klasyfikuje sygnały (urgent/important/routine/noise) ale **nigdy nie uczy się z wyników**. Jeśli sygnał sklasyfikowany jako "noise" okazał się ważny (użytkownik ręcznie na niego zareagował) — system tego nie widzi.

**Pliki:**
- `lib/signals/triage-engine.ts:400-450` — brak feedback loop
- `lib/autonomy/learning-engine.ts` — nie uczy się z triage

**Propozycja:**
```typescript
// Nowy learner w learning-engine.ts:
async function learnFromTriageOutcomes(tenantId: string, result: LearningResult) {
  const supabase = getServiceSupabase();

  // Znajdź sygnały oznaczone jako "noise" lub "routine",
  // na które użytkownik i tak zareagował (wiadomość w ciągu 2h)
  const { data: missclassified } = await supabase
    .from("exo_signal_triage")
    .select("id, signal_type, classification, source_channel")
    .eq("tenant_id", tenantId)
    .in("classification", ["noise", "routine"])
    .gte("created_at", thirtyDaysAgo);

  // Dla każdego → sprawdź czy użytkownik zareagował
  // Jeśli tak → zapisz preferencję "ten typ sygnału z tego źródła = important"
}
```

**Wpływ:** System przestaje ignorować sygnały, które użytkownik uważa za ważne.

---

## 7. Daily Action Planner → Obsługa On-Track + Acceleration

**Problem:** `daily-action-planner.ts` generuje akcje TYLKO dla celów off-track/at-risk. Cele on_track nie dostają żadnej uwagi — a mogłyby być akcelerowane.

**Pliki:**
- `lib/goals/daily-action-planner.ts:40-60` — filtruje tylko off-track

**Propozycja:**
```typescript
// Zamiast:
const atRiskGoals = goals.filter(g =>
  g.trajectory === "off_track" || g.trajectory === "at_risk"
);

// Powinno być:
const goalsByPriority = [
  ...goals.filter(g => g.trajectory === "off_track").map(g => ({ ...g, actionType: "recovery" })),
  ...goals.filter(g => g.trajectory === "at_risk").map(g => ({ ...g, actionType: "correction" })),
  ...goals.filter(g => g.trajectory === "on_track" && g.progress < 80).map(g => ({ ...g, actionType: "acceleration" })),
];

// Prompt AI z kontekstem:
// "Recovery actions" → intensywne, 2-3 akcje
// "Correction actions" → 1-2 akcje korekcyjne
// "Acceleration actions" → 1 opcjonalna akcja przyspieszająca (np. "podwój wysiłek bo jesteś blisko")
```

**Wpływ:** Cele blisko ukończenia dostają ostatni "push". System nie czeka aż cel zacznie się sypać.

---

## 8. Autonomiczne Wykonywanie Kroków Strategii (nie tylko task creation)

**Problem:** `strategy-engine.ts` generuje kroki typu `research`, `delegate`, `connect_people`, `acquire_tool`, ale prawie wszystkie fallbackują do `createTask()`. System tworzy zadanie "zbadaj X" zamiast faktycznie to zrobić.

**Pliki:**
- `lib/goals/strategy-engine.ts:350-430` — `executeStep()` switch statement
- `lib/autonomy/action-executor.ts` — brak handlerów dla research/delegate

**Propozycja:**
```typescript
// Nowe handlery w strategy-engine.ts executeStep():

case "research":
  // Użyj Tavily web search + knowledge base search
  const { searchWeb } = await import("@/lib/knowledge/web-search");
  const { searchKnowledge } = await import("@/lib/knowledge/search");

  const webResults = await searchWeb(step.params.query);
  const kbResults = await searchKnowledge(tenantId, step.params.query);

  // Zapisz wyniki do knowledge base
  await storeResearchResults(tenantId, goalId, step.id, { webResults, kbResults });

  // Wygeneruj podsumowanie i wyślij użytkownikowi
  const summary = await summarizeResearch(webResults, kbResults, step.params.query);
  await sendProactiveMessage(tenantId, `📊 Research: ${step.title}\n\n${summary}`);
  return { executed: true };

case "delegate":
  // Zadzwoń lub napisz do wskazanej osoby
  const contact = await findContact(tenantId, step.params.person);
  if (contact?.phone) {
    await executeAction({ type: "make_call", tenantId, params: {
      phone: contact.phone,
      purpose: step.params.instruction
    }});
  }
  return { executed: true };
```

**Wpływ:** System faktycznie REALIZUJE cele zamiast tworzyć listę TODO dla użytkownika.

---

## 9. Guardian → Proaktywne Wykrywanie Szans (nie tylko blokowanie)

**Problem:** `guardian.ts` działa defensywnie — blokuje złe interwencje, mierzy skuteczność, wykrywa drift. Ale **nigdy nie proponuje nowych akcji** na podstawie pozytywnych wzorców.

**Pliki:**
- `lib/autonomy/guardian.ts` — tylko verify/block/measure
- `lib/autonomy/mape-k-analyze.ts:200-250` — `opportunities` wykrywane ale nie realizowane

**Propozycja:**
```typescript
// Nowa metoda w Guardian:
async suggestOpportunities(tenantId: string): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  // 1. Wzorzec sukcesu: jeśli interwencja typu X ma effectiveness > 8.0 → zaproponuj więcej
  const topPerformers = await this.getTopPerformingTypes(tenantId);
  for (const tp of topPerformers) {
    opportunities.push({
      type: "increase_frequency",
      intervention_type: tp.type,
      reasoning: `${tp.type} ma ${tp.avgScore}/10 skuteczności — warto częściej`,
    });
  }

  // 2. Wykryte korelacje: jeśli sleep_quality + productivity korelują → zaproponuj sleep optimization
  const correlations = await this.detectCrossMetricCorrelations(tenantId);
  for (const corr of correlations) {
    if (corr.strength > 0.7) {
      opportunities.push({
        type: "cross_domain_optimization",
        reasoning: `Poprawa ${corr.metricA} prawdopodobnie poprawi ${corr.metricB}`,
      });
    }
  }

  return opportunities;
}
```

**Wpływ:** Guardian staje się nie tylko "strażnikiem" ale "doradcą" — aktywnie szuka sposobów na poprawę.

---

## 10. Context-Aware Intervention Timing

**Problem:** Interwencje są wysyłane gdy CRON się odpali (co 15-30 min). Nie uwzględniają **kontekstu czasowego użytkownika** — czy jest w deep work, na spotkaniu, śpi, je obiad.

**Pliki:**
- `lib/autonomy/executor.ts` — wykonuje od razu po approval
- `lib/autonomy/mape-k-loop.ts:300` — `scheduled_for` = teraz + 30min (sztywne)

**Propozycja:**
```typescript
// Nowy moduł: lib/autonomy/timing-optimizer.ts

export async function findOptimalDeliveryTime(
  tenantId: string,
  intervention: PlannedIntervention
): Promise<Date> {
  // 1. Sprawdź kalendarz — czy jest meeting/focus time?
  const calendar = await getUpcomingEvents(tenantId, 2); // next 2h
  const inMeeting = calendar.some(e => isOngoing(e));

  // 2. Sprawdź learned best_contact_hour
  const bestHour = await getPreference(tenantId, "best_contact_hour");

  // 3. Sprawdź ostatnią interakcję (jeśli < 5 min temu → dobry moment)
  const lastInteraction = await getLastInteractionTime(tenantId);
  const isActive = Date.now() - lastInteraction < 5 * 60 * 1000;

  // 4. Priorytet critical → natychmiast (ignore timing)
  if (intervention.priority === "critical") return new Date();

  // 5. Jeśli aktywny i nie na spotkaniu → teraz
  if (isActive && !inMeeting) return new Date();

  // 6. Jeśli na spotkaniu → po spotkaniu + 5 min
  if (inMeeting) {
    const meetingEnd = calendar.find(e => isOngoing(e))!.end;
    return new Date(new Date(meetingEnd).getTime() + 5 * 60 * 1000);
  }

  // 7. Default → następny best_contact_hour
  return nextOccurrence(bestHour?.value as number || 9);
}
```

**Wpływ:** Interwencje docierają gdy użytkownik jest gotowy je przyjąć — wyższa skuteczność, mniej ignorowanych wiadomości.

---

## Priorytetyzacja Implementacji

| # | Zmiana | Wpływ | Złożoność | Priorytet |
|---|--------|-------|-----------|-----------|
| 1 | Goal → Data Source Auto-Link | 🔴 Krytyczny | Średnia | **P0** |
| 4 | Learning Loop → Strategia | 🔴 Krytyczny | Niska | **P0** |
| 8 | Autonomiczne wykonywanie kroków | 🔴 Krytyczny | Wysoka | **P0** |
| 2 | Adaptacyjne progi MAPE-K | 🟡 Wysoki | Średnia | **P1** |
| 3 | Multi-Step Workflows | 🟡 Wysoki | Wysoka | **P1** |
| 10 | Context-Aware Timing | 🟡 Wysoki | Średnia | **P1** |
| 7 | Daily Planner → Acceleration | 🟢 Średni | Niska | **P2** |
| 5 | Proaktywne Rig-Sync | 🟢 Średni | Niska | **P2** |
| 9 | Guardian → Opportunity Detection | 🟢 Średni | Średnia | **P2** |
| 6 | Triage → Learning | 🟢 Średni | Niska | **P2** |

---

## Architektura Docelowa: Closed-Loop Goal Execution

```
                    ┌─────────────────────────────────────────┐
                    │           USER GOAL                      │
                    │  "Schudnij 5kg w 3 miesiące"            │
                    └──────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────────────────────────┐
                    │     STRATEGY ENGINE (+ Learning)          │
                    │  Plan: 8 kroków, confidence: 0.82         │
                    │  Learned: "research" steps work 85%       │
                    │  Learned: "send_email" steps fail 60%     │
                    └──────────┬──────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
    │  AUTO-EXECUTE   │ │ AUTO-TRACK   │ │ AUTO-ADJUST  │
    │                 │ │              │ │              │
    │ • Web research  │ │ • Oura→sleep │ │ • If off-track│
    │ • Book appt     │ │ • Fit→steps  │ │   → regenerate│
    │ • Create plan   │ │ • Auto-log   │ │ • If on-track │
    │ • Send message  │ │   progress   │ │   → accelerate│
    │ • Build app     │ │ • Zero manual│ │ • Adapt progi │
    └─────────┬──────┘ └──────┬───────┘ └──────┬───────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────▼──────────────────────────────┐
                    │     OUTCOME TRACKER + LEARNING            │
                    │  → Co zadziałało? Co nie?                 │
                    │  → Update preferencji i progów            │
                    │  → Feed back do Strategy Engine           │
                    └──────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────────────────────────┐
                    │     GUARDIAN (verify + suggest)           │
                    │  → Blokuj szkodliwe                      │
                    │  → Proponuj szanse                       │
                    │  → Optymalizuj timing                    │
                    └─────────────────────────────────────────┘
```

---

## Następne Kroki

1. **P0 - Goal Auto-Tracking**: Rozbudować `goal-progress` CRON o auto-fetch z rig data
2. **P0 - Learning → Strategy**: Wstrzyknąć preferencje do `collectStrategyContext()`
3. **P0 - Step Execution**: Dodać prawdziwe handlery `research`, `delegate` w strategy-engine
4. **P1 - Personalized Thresholds**: Nowa tabela + adapter w MAPE-K analyze
5. **P1 - Workflow Executor**: Nowy moduł `lib/autonomy/workflow-executor.ts`
6. **P1 - Timing Optimizer**: Nowy moduł `lib/autonomy/timing-optimizer.ts`
