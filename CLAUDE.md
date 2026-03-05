# ExoSkull - Project CLAUDE.md

> **Global instructions:** `~/.claude/CLAUDE.md` (planning vs execution, permissions, agents, protocols)
> **Home instructions:** `~/CLAUDE.md` (GOTCHA framework, file structure)

## ⚠️ OBOWIĄZKOWE DO PRZECZYTANIA NA STARCIE SESJI
1. **`PRODUCT_DECISIONS_v1.md`** — 74 decyzje produktowe (zatwierdzone przez usera, 446 pytań)
2. **`MVP_EXECUTION_PLAN.md`** — 10-fazowy plan wykonawczy
3. **`ARCHITECTURE.md`** — Pełny status implementacji (co działa, co nie)
4. **`LEARNINGS.md`** — Gotchas i wzorce z poprzednich sesji

**NIE MÓW "nie wiem co ustaliliśmy".** Odpowiedzi na WSZYSTKIE pytania są w tych plikach.

---

## What is ExoSkull?

ExoSkull is an **Adaptive Life Operating System** — a second brain whose **główny cel to realizować cele użytkownika**.

Everything else is a means to that end:

- Learns who the user is and what they want to achieve
- Breaks goals into strategies, actions, and daily tasks
- Monitors progress toward active goals
- Builds custom apps and skills when goals require them
- Takes autonomous actions to advance goals (with user permission)
- Remembers EVERYTHING forever (full data lake, never deleted)
- Optimizes itself continuously based on goal outcomes

**Key Principle:** ExoSkull is an extension of the user, not a service they use. Every feature, automation, and intervention exists to **achieve the user's goals**.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for full vision (18 layers).

### Monorepo Structure
```
exoskull/
├── exoskull-app/        # Next.js web app (main product, deployed on Vercel)
│   ├── app/             # Next.js app router (pages, API routes)
│   ├── components/      # React components
│   ├── lib/             # Business logic, system (atlas-pipeline, gotcha-engine)
│   └── middleware.ts     # Auth, routing
├── exoskull-desktop/    # Vite + Tauri desktop app
│   ├── src/             # React frontend
│   └── src-tauri/       # Rust Tauri backend
├── supabase/            # Database migrations
├── local-agent/         # Node.js CLI daemon (file sync → Knowledge Base)
├── vps-executor/        # VPS Code Execution (8 IORS tools)
├── android/             # Android integration (planned)
├── infrastructure/      # Infra config
├── goals/               # GOTCHA: process definitions
├── tools/               # GOTCHA: execution scripts
├── args/                # GOTCHA: behavior settings
├── context/             # GOTCHA: domain knowledge
└── hardprompts/         # GOTCHA: reusable instruction templates
```

---

## Dev Commands

### exoskull-app (Next.js — web app)
```bash
cd exoskull-app
npm install                    # Install dependencies
npm run dev                    # Dev server (Next.js)
npm run build                  # Production build (NODE_OPTIONS='--max-old-space-size=4096')
npm test                       # Vitest run
npm run test:watch             # Vitest watch mode
npm run test:coverage          # Vitest coverage
npm run lint                   # ESLint
npm run test:routes            # Smoke test all routes (requires dev server on :3000)
npm run supabase:gen-types     # Regenerate Supabase types → lib/database.types.ts
```

### exoskull-desktop (Vite + Tauri — desktop app)
```bash
cd exoskull-desktop
npm install                    # Install dependencies
npm run dev                    # Vite dev server
npm run build                  # TypeScript + Vite build
npm run tauri                  # Tauri commands (dev/build/etc)
```

### Supabase
```bash
cd supabase
supabase db push               # Push migrations
supabase gen types typescript --project-id uvupnwvkzreikurymncs > ../exoskull-app/lib/database.types.ts
```

---

## Frameworks (inherited from global — see `~/.claude/CLAUDE.md` §4)

### ATLAS (primary app-building workflow)
`Architect → Trace → Link → Assemble → Stress-test` (+V-Validate +M-Monitor)
- Full spec: [build_app.md](./build_app.md) | Implementation: `exoskull-app/lib/system/atlas-pipeline.ts`
- **Critical:** NEVER build UI for data structures that don't exist yet. Always: DB schema → API routes → UI.
- Model routing: Opus (Architect, Trace) → Sonnet (Assemble) → Haiku (Link, Stress-test)

### BMAD (process management)
PRD → Architecture → Sprint → Code → Review. Role-based sub-agents.
- Stack: Next.js + Supabase + Vercel (ograniczony, sprawdzony)
- PRD-driven: dokumentacja wymagań ZANIM kod

### CLAWS (agent building)
Connect → Listen → Archive → Wire → Sense
- Użyj do budowania nowych integracji, modów, rigów, local-agent features

### BGML Optimization (quality)
- DIPPER: 3 agenty równolegle → synteza (ZAWSZE)
- RPI: Generate → Critique → Refine (dla krytycznych decyzji)
- Domain Frameworks: First Principles (arch), 5 Whys (debug), SWOT (decisions)
- Brak agenta? → `Skill(agent-factory)` → wygeneruj, zainstaluj, użyj

### Workflow
```
1. PLANNING: Deep research → dopytaj → plan → "Akceptujesz?"
2. EXECUTION: Agent teams (BGML DIPPER) → Ralph Loop → aż DONE
3. TESTING: Playwright headless → screenshot → PASS/FAIL
```

---

## Deployment Strategy (2026-03-04)

**Web-first, omnichannel from day 1.** All channels available simultaneously.

- **Day 1:** Web chat + voice dictation + file upload. Full tool suite available
- **Week 1:** All channels active (SMS, email, WhatsApp, Telegram, Discord, etc.)
- **Month 1:** SuperIntegrator connects user's services, first custom apps built by AI

**No progressive unlock.** Full capabilities from registration. No SMS-first.

---

## Multi-Model AI Routing (AKTUALNY 2026-03-06)

3-tier classification: simple/medium/complex → odpowiedni model.

| Tier | Model | Use For | Cost |
|------|-------|---------|------|
| Simple | Gemini 2.5 Flash | Chat bez narzędzi, klasyfikacja (<1s) | $0 |
| Medium | DeepSeek V3.2 | Chat z narzędziami, standardowe zadania | $0.002 |
| Complex | DeepSeek V3.2 | build_app, multi-tool, autonomia | $0.002 |
| Fallback 1 | Groq (Llama 3.3 70B) | Gdy DeepSeek padnie | $0 |
| Fallback 2 | Gemini 2.5 Flash | Gdy Groq padnie | $0 |
| Fallback 3 | OpenAI GPT-4o-mini | Gdy Gemini padnie | ~$0.01 |
| LAST RESORT | Anthropic Claude | Gdy WSZYSTKO inne padnie | $$$ |

**Anthropic = LAST RESORT.** User preferuje tanie modele. DeepSeek V3.2 primary.

---

> **Product vision details** (Data Lake, Autonomous Actions, CRONs, Shared Workspace, Graph Knowledge, Tenant Isolation, Channels, Skill Library) → see `ARCHITECTURE.md` and `PRODUCT_DECISIONS_v1.md`

---

## Gotchas (PRZECZYTAJ ZANIM COKOLWIEK ZROBISZ)

### Architektura agentów
- **DWA endpointy chat:** `/api/chat/stream` (UI, runV3Agent) vs `/api/chat/send` (gateway, runExoSkullAgent) — NIE mieszaj
- **DWA rejestry narzędzi:** V3_TOOLS (36) i IORS_EXTENSION_TOOLS (~150+), mostek przez `marketplace-tools`
- **V3 fallback chain (AKTUALNY):** DeepSeek V3.2 → Groq → Gemini → OpenAI → Anthropic (LAST RESORT)
- **ExoSkullAgent fallback:** Anthropic → DeepSeek (tools) → Kimi (tools) → DeepSeek (no tools)
- **Anthropic = LAST RESORT.** User preferuje DeepSeek/Groq. Anthropic tylko gdy wszystko inne padnie
- **maxTurns:** complex=10, medium=8. Jeśli agent wyczerpie turny → "Przekroczono limit kroków agenta". To NIE jest błąd providera API — to nasz kod w `lib/v3/agent.ts`
- **update_task UUID bug:** AI model często przekazuje tekst zamiast UUID. Tool powinien mieć fuzzy name lookup

### Deploy
- **`vercel --prod`** MUSI być z `exoskull/` (monorepo root), NIE z `exoskull/exoskull-app/` — ścieżka się duplikuje
- **`next build` pada lokalnie** ("Array buffer allocation failed") — używaj Vercel build

### Inne
- **CrossDevice folder** (Samsung sync) wymaga uruchomionego cloud providera
- **Allegro OAuth** z lumpx.pro zwraca `invalid_request` — wymaga re-auth
- **Kimi/Moonshot** — kod fallback gotowy, brak API key na Vercel

---

## IORS vs Claude Code — KTO CO ROBI

**Claude Code (ty)** = piszesz KOD platformy. Endpointy, agenta, narzędzia, infrastrukturę.
**IORS (agent w ExoSkull)** = UŻYWA tych narzędzi żeby robić rzeczy dla usera.

Gdy user mówi "IORS ma to zrobić" / "niech zrobi" = user chce żeby PRODUKT (IORS) miał tę zdolność.
- NIE buduj rzeczy ręcznie za usera
- Dodaj NARZĘDZIE do IORS (`V3_TOOLS`) żeby IORS mógł to sam
- Albo ulepsz istniejące narzędzie
- Potem DEPLOYUJ i TESTUJ w Playwright (wyślij komendę w chacie, sprawdź czy IORS to ogarnia)

**Przykład:**
- User: "niech robi rozpoznawanie paragonów" → dodaj `scan_receipt` tool do V3_TOOLS → deploy → testuj w chacie
- User: "niech buduje lepsze apki" → ulepsz `build_app` prompt/model → deploy → testuj
- **NIE:** ręcznie budujesz apkę za usera, ręcznie skanujesz paragon, ręcznie robisz CRUD

---

## KONKRETNE REGUŁY Z SESJI 2026-03-06

1. **Nie kłam o przyczynach błędów.** "Osiągnięto limit DeepSeek" to był NASZ maxTurns=4, nie API rate limit. ZAWSZE czytaj kod zanim przypisujesz winę zewnętrznemu serwisowi.
2. **Nie mów "DeepSeek rate limit" / "provider error" bez sprawdzenia.** Grep po komunikacie → znajdź źródło → napraw.
3. **Deploy z `exoskull/`** (monorepo root), NIE z `exoskull/exoskull-app/`.
4. **Gdy user mówi "IORS ma to zrobić"** → dodaj tool do V3_TOOLS, nie buduj ręcznie.
5. **Nie pytaj 5 razy o to samo.** Jeśli user powiedział co chce, RÓB. Nie pytaj "czy o to chodzi?".
6. **maxTurns** — complex=10, medium=8. Stary limit (4/5) powodował fałszywe errory.

---

## ExoSkull-Specific Guardrails

**Hallucination:** Never state facts not in database. If confidence <70% → disclaimer.
**Privacy:** Never share data without consent. Voice recordings auto-delete 90 days.
**Safety:** Never diagnose, never guarantee returns, never manipulate user.
**Actions:** Never delete data without 3x confirmation. Never spend money without approval.
**Technical:** Circuit breaker after 3 failures. 100 req/hour per user. Graceful degradation.
**IP:** Never attribute architecture to competitors. DO mention tools we USE (tech stack).

**TODO (Legal):**
- [ ] Trademark search for "ExoSkull" and "IORS"

---

## Key Differences from Standard System

1. **Goal-driven everything** - Every feature, CRON, and intervention traces back to a user goal
2. **Builds itself dynamically** - Creates apps and skills when goals demand them
3. **Acts autonomously** - With permission, executes actions to advance goals
4. **Never forgets** - Bronze/Silver/Gold data lake, full history
5. **Multimodal fusion** - Voice + text + images + biometrics + behavior

**Your Role:** Goal Executor. Break goals into actions, execute them, measure results, adapt.

---

**ExoSkull Philosophy:** Your job is to achieve the user's goals. Everything else is a tool.
