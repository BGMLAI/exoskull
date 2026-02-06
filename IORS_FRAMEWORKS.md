# IORS — Wewnętrzne Frameworki

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Zależności:** [IORS_ARCHITECTURE.md](./IORS_ARCHITECTURE.md), [IORS_VISION.md](./IORS_VISION.md)

---

## 1. ATLAS — Framework Budowania

### Build Process (od funkcji po pełny system)

ATLAS to framework używany za każdym razem gdy IORS (lub developer) buduje coś nowego: feature, mod, integrację, workflow.

```
A — ARCHITECT:  Zdefiniuj problem, użytkowników, metryki sukcesu
T — TRACE:      Schema danych, integracje (Composio), tech stack
L — LINK:       Waliduj WSZYSTKIE połączenia PRZED budowaniem
A — ASSEMBLE:   Buduj: baza danych → backend → frontend
S — STRESS-TEST: Testuj funkcjonalność, edge cases, user acceptance
```

### Kiedy używać ATLAS

| Sytuacja | Używaj ATLAS? |
|---|---|
| Nowy feature | TAK |
| Nowy mod (tworzony przez IORS) | TAK (automatycznie przez Meta-GOTCHA) |
| Nowa integracja (Composio connector) | TAK |
| Bug fix | NIE (za ciężki) |
| Zmiana konfiguracji | NIE |

### ATLAS vs GOTCHA

- **ATLAS** = process BUDOWANIA (jak powstaje)
- **GOTCHA** = architektura RUNTIME (jak działa po zbudowaniu)

ATLAS zawiera GOTCHA — krok "Assemble" generuje strukturę GOTCHA (Goals, Orchestration, Tools, Context, Hard Prompts, Args).

### ATLAS Step Details

**A — Architect:**
```
1. Problem statement (co rozwiązujemy?)
2. User stories (kto i po co?)
3. Success metrics (jak mierzymy sukces?)
4. Constraints (czas, budżet, tech stack)
5. Dependencies (jakie inne systemy?)
```

**T — Trace:**
```
1. Data schema (jakie tabele/modele?)
2. API endpoints (jakie endpointy?)
3. Integrations (Composio: jakie apps? Auth flow?)
4. Tech stack decisions (Tier AI, tools, storage)
5. Cost estimate (ile będzie kosztować per-use?)
```

**L — Link:**
```
1. Validate DB connections
2. Validate API responses (mock tests)
3. Validate Composio auth (can we reach the external service?)
4. Validate data flow (input → processing → output)
5. IF ANY LINK FAILS → STOP. Fix before building.
```

**A — Assemble:**
```
1. Database: migrations, RLS policies
2. Backend: API routes, tools, handlers
3. Frontend: widgets, components, pages
4. Tests: unit + integration
```

**S — Stress-test:**
```
1. Happy path (działa normalnie?)
2. Edge cases (co jeśli null? co jeśli timeout?)
3. Load (co jeśli 1000 userów naraz?)
4. Security (injection? XSS? IDOR?)
5. User acceptance (czy user to rozumie?)
```

---

## 2. Meta-GOTCHA: Auto-Framework przy Tworzeniu

### Istniejący GOTCHA (zachować)

```
GOT (Engine):
  Goals → Orchestration → Tools

CHA (Context):
  Context → HardPrompts → Args
```

### Meta-GOTCHA: IORS stosuje GOTCHA automatycznie

Gdy IORS tworzy nowy mod, skill, workflow, agenta — automatycznie przechodzi przez GOTCHA:

```
1. GOAL: Co ten mod ma osiągnąć?
   → "Sleep tracker: monitoruj jakość snu i dostarczaj insighty"

2. ORCHESTRATION: Jak to zorganizować?
   → "Dane z urządzenia/serwisu (via Composio) + daily check-in (conversation) + weekly analysis (Pętla)"

3. TOOLS: Jakie deterministic tools potrzebne?
   → "oura_fetch_sleep(), calculate_sleep_score(), generate_insight()"

4. CONTEXT: Jaki kontekst potrzebny?
   → "User timezone, sleep goals (if set), historical patterns"

5. HARD PROMPTS: Jakie instrukcje dla LLM?
   → "Analyze sleep data. Focus on: duration, deep sleep %, HRV trend."

6. ARGS: Jakie parametry zachowania?
   → "frequency: daily, detail_level: based on user preference, proactivity: based on permission"
```

IORS robi to AUTOMATYCZNIE — user nie widzi frameworka. User mówi "chcę trackować sen" → IORS przechodzi przez Meta-GOTCHA → mod gotowy.

### Auto-validation checklist

Po przejściu Meta-GOTCHA, auto-check:

```
□ Goal jest SMART (Specific, Measurable, Achievable, Relevant, Time-bound)?
□ Orchestration nie wymaga tools które nie istnieją?
□ Tools są deterministyczne (no raw LLM calls w execution)?
□ Context jest dostępny (nie wymaga danych których nie mamy)?
□ Hard prompts przetestowane (nie halucynują)?
□ Args mają sensowne defaults?
□ Pipeline ma ValidationGate?
□ Pipeline ma FeedbackCapture?
□ Mod ma widget definition (opcjonalny)?
□ Mod respektuje autonomy permissions?
```

---

## 2. Protokół Tworzenia Modów

### Lifecycle moda: od pomysłu do produkcji

```
┌─ DETECT ─────────────────────────────────────────┐
│                                                    │
│  Źródło:                                           │
│  1. User prosi ("chcę trackować sen")             │
│  2. IORS wykrywa potrzebę (gap detection, pattern) │
│  3. Marketplace suggestion                         │
│  4. Mod composition wymaga sub-moda               │
│  5. Composio connector: nowa integracja detected   │
│                                                    │
│  Output: ModRequest { goal, source, priority }     │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ DESIGN (Meta-GOTCHA) ──────────────────────────┐
│                                                    │
│  IORS przechodzi przez 6 kroków GOTCHA             │
│  Output: ModSpec {                                 │
│    goal, orchestration, tools, context,            │
│    hard_prompts, args, widget_def, validation      │
│  }                                                 │
│                                                    │
│  Proposal to user: "Chcę stworzyć mod X.           │
│  Będzie robił Y. Potrzebuje danych Z. OK?"         │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ GENERATE ───────────────────────────────────────┐
│                                                    │
│  AI generates IModExecutor code (TypeScript)       │
│  Using: Claude Sonnet 4.5 (code generation tier)   │
│                                                    │
│  Output: ModCode {                                 │
│    executor: IModExecutor implementation,           │
│    schema: Zod validation schema,                  │
│    widget: WidgetDefinition (optional),             │
│    tests: basic test suite                          │
│  }                                                 │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ VALIDATE ───────────────────────────────────────┐
│                                                    │
│  1. AST security scan (no eval, no network abuse)  │
│  2. Zod schema validation (inputs/outputs typed)   │
│  3. Sandbox execution test (isolated-vm, 128MB, 5s)│
│  4. Auto-generated unit tests pass?                │
│  5. Autonomy check: requires permissions?          │
│                                                    │
│  PASS → Deploy | FAIL → iterate (max 3 retries)   │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ DEPLOY ─────────────────────────────────────────┐
│                                                    │
│  1. Register in exo_mod_registry                   │
│  2. Create exo_mod_data entry for tenant           │
│  3. Create Canvas widget (if widget_def exists)    │
│  4. Notify user: "Mod X jest aktywny!"            │
│  5. Start data collection (if applicable)          │
│                                                    │
│  Mod is LIVE                                       │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ MONITOR (continuous) ───────────────────────────┐
│                                                    │
│  Track: usage frequency, error rate, user feedback │
│  If unused 30 days → suggest archive to user       │
│  If error rate >10% → auto-disable + notify user   │
│  If positive feedback → suggest publishing to       │
│  marketplace                                       │
└──────────────────────────────────────────────────┘
```

### Mod API Standard

Każdy mod implementuje:

```typescript
interface IModExecutor {
  // Required
  slug: string;                           // unique identifier
  name: string;                           // display name
  description: string;                    // what it does

  // Lifecycle
  init(config: ModConfig): Promise<void>;  // setup
  execute(input: any): Promise<ModOutput>; // main logic
  cleanup(): Promise<void>;                // teardown

  // Optional
  widget?: WidgetDefinition;               // Canvas widget
  schedule?: string;                       // cron schedule for recurring
  dependencies?: string[];                 // other mods required
  composio_connectors?: string[];          // Composio integrations needed
  permissions?: string[];                  // autonomy permissions needed
  composable?: {                           // for mod composition
    inputs: Record<string, ZodSchema>;     // what it accepts
    outputs: Record<string, ZodSchema>;    // what it produces
  };
}
```

---

## 3. Protokół Kompozycji Modów

### Natural Language → Pipeline

```
User: "Kiedy śpię źle, zablokuj mi poranne spotkania"

IORS processing:
1. Parse intent: sleep_quality → calendar_action
2. Identify mods: sleep_tracker (source) + calendar_manager (target)
3. Generate pipeline:
   {
     trigger: "on_data",
     source: "sleep_tracker",
     source_output: "sleep_quality",
     condition: "< 70",
     target: "calendar_manager",
     target_action: "block_morning_meetings",
     params: { until: "12:00", reason: "Poor sleep recovery" }
   }
4. Validate: both mods exist? user has permissions? pipeline safe?
5. Propose: "Kiedy twój sleep score < 70, zablokuję spotkania do 12:00. OK?"
6. User confirms → composition active
```

### Composition rules

1. **Max 5 steps** per pipeline (prevent complexity explosion)
2. **No circular dependencies** (A→B→A forbidden)
3. **Timeout per step:** 5s (prevent hanging)
4. **Circuit breaker:** 3 failures in 1h → disable composition + notify user
5. **Permission inheritance:** Composition needs ALL permissions of constituent mods
6. **Data flow typing:** Source output type must match target input type (Zod validation)

### Composition patterns

| Pattern | Example | Implementation |
|---|---|---|
| **Chain** | A → B → C | Sequential pipeline |
| **Branch** | A → (B AND C) | Parallel execution |
| **Conditional** | IF A > X THEN B ELSE C | Condition node |
| **Aggregate** | A + B + C → D | Multi-input merge |
| **Scheduled** | Every Monday: A → B | Cron-triggered pipeline |

---

## 4. QA Pipeline

### Automatyczny QA dla modów i kompozycji

```
┌─ Static Analysis ────────────────────────────────┐
│  - AST scan (no eval, no __proto__, no require)   │
│  - Dependency check (allowlisted packages only)    │
│  - Type check (TypeScript strict)                  │
│  - Complexity check (cyclomatic < 15)              │
│  - Browser action audit (if uses Playwright)       │
└───────────────────────┬──────────────────────────┘
                        ▼
┌─ Sandbox Testing ────────────────────────────────┐
│  - isolated-vm execution (128MB, 5s timeout)      │
│  - Mock inputs → verify outputs match schema      │
│  - Edge cases: null input, empty input, overflow   │
│  - Resource usage: memory, CPU, network calls      │
└───────────────────────┬──────────────────────────┘
                        ▼
┌─ Integration Testing ────────────────────────────┐
│  - Mod + real data (user's data, sandboxed)       │
│  - Widget rendering (if applicable)               │
│  - Composition pipeline end-to-end                │
│  - Autonomy permissions respected?                │
└───────────────────────┬──────────────────────────┘
                        ▼
┌─ User Acceptance ────────────────────────────────┐
│  - IORS asks: "Mod X is ready. Test it?"          │
│  - User interacts → feedback                      │
│  - 3 positive interactions → confirmed            │
│  - Any negative → iterate or remove               │
└──────────────────────────────────────────────────┘
```

### Marketplace QA (dodatkowy dla published mods)

```
Standard QA (above)
  +
Community Review:
  - 2 Reviewer-tier users must approve
  - Code review (AI-assisted + human)
  - Test with 10 diverse user profiles (synthetic)
  - No hardcoded credentials, no PII leaks
  +
Post-publish monitoring:
  - Error rate tracking (auto-delist if >10%)
  - User satisfaction tracking (auto-delist if <3/5 after 50 uses)
  - Monthly security rescan
```

---

## 5. Feedback Optimization

### Feedback → System Improvement Pipeline

```
┌─ Collect ────────────────────────────────────────┐
│                                                    │
│  Explicit: 👍/👎, corrections, ratings            │
│  Implicit: response time, skip rate, engagement,   │
│           session length, mod usage frequency      │
│                                                    │
│  Store: exo_feedback + exo_implicit_signals        │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ Aggregate (Gold layer) ─────────────────────────┐
│                                                    │
│  Daily: gold.feedback_patterns                     │
│  - Per-tool success rate                           │
│  - Per-time-of-day engagement                      │
│  - Per-channel preference                          │
│  - Per-mod satisfaction                            │
│  - Per-personality-setting effectiveness           │
│                                                    │
│  Weekly: gold.optimization_targets                 │
│  - Tools with <70% satisfaction → optimize         │
│  - Mods with <30% usage → suggest archive          │
│  - Time slots with low engagement → adjust timing  │
└───────────────────────┬────────────────────────────┘
                        ▼
┌─ Optimize (Loop-daily) ──────────────────────────┐
│                                                    │
│  Actions:                                          │
│  1. Adjust AI routing (promote models that         │
│     get better feedback for specific tasks)        │
│  2. Adjust proactivity timing (move to high-       │
│     engagement windows)                            │
│  3. Adjust response length (optimize for           │
│     engagement vs brevity)                         │
│  4. Suggest mod archival (low usage)               │
│  5. Adjust personality micro-tuning (within        │
│     user's set range)                              │
│                                                    │
│  All optimizations logged in exo_optimization_log  │
│  User can see & revert any optimization           │
└──────────────────────────────────────────────────┘
```

### A/B Testing (micro)

Nie klasyczny A/B (split users). IORS per-user micro-experiments:

```
Hypothesis: "User responds better to shorter messages in the afternoon"

Test: For 7 days, alternate:
  Day 1: normal length response at 14:00
  Day 2: shorter response at 14:00
  Day 3: normal
  Day 4: shorter
  ...

Measure: response time, engagement, explicit feedback

Result: shorter wins → update afternoon response length for this user
```

Per-user, not per-population. Each IORS optimizes for ITS user.

---

## 6. Tau jako Meta-Framework

### Tau jest DNA, nie moduł

Tau nie jest osobnym frameworkiem. Jest wbudowany w KAŻDY element:

| Element | Jak Tau się manifestuje |
|---|---|
| **Mod** | Pętla: data → insight → action → feedback → better insight |
| **Composition** | Przefazowanie: 2 proste mody → emergentny większy system |
| **Canvas** | Nigdy "gotowy" — przefazowuje się z userem |
| **Pętla 15-min** | Bicie serca — dosłowna pętla obserwacja→akcja→feedback |
| **Onboarding** | Ciągłe poznawanie, nie jednorazowy setup |
| **Pricing** | Płacisz za obrót (usage), nie za stan (subscription) |
| **Gamification** | XP = obroty pętli. Level up = przefazowanie |
| **Feedback** | Pętla niewystarczalności — każda odpowiedź niepełna, napędza kolejną |
| **Self-optimization** | Pętla optymalizacji obserwująca inne pętle (strange loop) |
| **Autonomy** | Pętla zaufania: small permission → success → bigger permission |

### Tau Decision Framework (tool: `tau_assess`)

Gdy IORS podejmuje ważną decyzję (swoją lub pomagając userowi):

```
1. ZASOBY (Resources):
   - Jakie dane mam?
   - Jakie narzędzia dostępne?
   - Jaka historia podobnych sytuacji?
   - Jakie mody/rigi mogę użyć?
   - (Dla usera: jakie zasoby MA user — pieniądze, czas, ludzie, skills)

2. TŁO (Environment):
   - Jaka jest aktualna sytuacja?
   - Jakie są ograniczenia?
   - Jaki jest kontekst emocjonalny?
   - Jaki jest kontekst czasowy?
   - (Dla usera: jakie jest REALNE tło — nie zniekształcone)

3. OCENA (Assessment):
   - Zasoby × Tło = jaki jest realny obraz?
   - Czy obraz zasobów jest odkłamany? (nie za mało, nie za dużo)
   - Czy obraz tła jest odkłamany? (nie za groźne, nie za łatwe)
   - Jaka decyzja wynika z prawdziwego obrazu?

4. DZIAŁANIE (Action):
   - Wykonaj decyzję (jeśli w ramach zgód)
   - LUB zaproponuj (jeśli poza zgodami)
   - LUB odkłam obraz (jeśli pomagasz userowi)

5. FEEDBACK:
   - Czy działanie było skuteczne?
   - Co by trzeba zmienić na przyszłość?
   - Update confidence scoring
```

### Tau Insufficiency Loop w praktyce

IORS celowo nie daje "pełnych" odpowiedzi:

```
NIE: "Twój sleep score to 78. To dobrze."
(zamknięte — zero pętli)

TAK: "Twój sleep score to 78. To 5 punktów wyżej niż tydzień temu.
Ale zauważyłem coś ciekawego — twoje deep sleep% rośnie kiedy
nie pijesz kawy po 15:00. Chcesz żebym to monitorował?"
(otwarte — napędza nową pętlę: monitoring → data → insight → ...)
```

Każda odpowiedź IORS otwiera drzwi do kolejnej pętli. Niewystarczalność to nie bug — to feature.

---

## 7. Framework Selection Guide

### Kiedy co stosować

| Sytuacja | Framework | Dlaczego |
|---|---|---|
| Tworzenie nowego moda | Meta-GOTCHA | Structured creation process |
| Łączenie modów | Composition Protocol | Safe pipeline construction |
| Podejmowanie decyzji | Tau Decision Framework | Zasoby × Tło = prawdziwy obraz |
| **Budowanie czegokolwiek nowego** | **ATLAS** | **Architect → Trace → Link → Assemble → Stress-test** |
| Optymalizacja istniejącego | Feedback Pipeline | Data-driven improvement |
| QA/testing | QA Pipeline | Multi-stage validation |
| Ocena etyczna | Ethics Check (5 pytań) | From IORS_GOVERNANCE.md |

### Nesting

Frameworki mogą się zagnieżdżać:

```
ATLAS (budowanie Bizzon feature)
  └── Meta-GOTCHA (tworzenie moda "invoice_generator")
       └── Composition Protocol (łączenie z "calendar_manager")
            └── QA Pipeline (testowanie pipeline)
                 └── Tau Decision (czy to dobre dla usera?)
```

---

*Powiązane: [IORS_ARCHITECTURE.md](./IORS_ARCHITECTURE.md) — jak frameworki łączą się z architekturą*
*Powiązane: [IORS_IMPLEMENTATION_PLAN.md](./IORS_IMPLEMENTATION_PLAN.md) — kiedy co wdrażać*
