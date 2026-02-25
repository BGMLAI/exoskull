# ExoSkull - Project CLAUDE.md

> **Global instructions:** `~/.claude/CLAUDE.md` (planning vs execution, permissions, agents, protocols)
> **Home instructions:** `~/CLAUDE.md` (GOTCHA framework, file structure)

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
├── exoskull-app/        # Next.js web app (main product, deployed on Railway)
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

## Progressive Deployment

Don't wait for "complete system" before delivering value. Start achieving goals from day 1.

- **Day 1:** SMS + voice — capture goals, break into first actions
- **Week 1:** Daily task generation from goals, progress tracking via SMS
- **Week 2:** First custom app deployed for user's top goal
- **Month 1-3:** Full goal intelligence (strategy adjustment, autonomous execution)

**Zero-tech requirement:** SMS + voice first. Web dashboard OPTIONAL.

---

## Multi-Model AI Routing

Use the cheapest model that can handle the task:

| Tier | Model | Use For |
|------|-------|---------|
| 1 | Gemini 1.5 Flash | Simple SMS, classification, routing |
| 2 | Claude Haiku | Pattern detection, summarization |
| 3 | Kimi 2.5 / GPT-4 Codex | Deep reasoning, code generation |
| 4 | Claude Opus | Meta-coordination, gap detection, crisis |

**Routing:** Classify complexity → check history → route to cheapest tier → escalate on failure (max 3 retries).
**Prompt Caching:** Static context cached for 90% savings. Only dynamic context sent fresh.

---

## Skill Library System

ExoSkull builds skills on-demand when a goal requires capabilities the system doesn't have yet.

- **Core Skills:** Built-in (sleep_tracker, energy_monitor, task_manager)
- **Custom Skills:** System detects goal needs skill → auto-generates it

**Standard Skill API:**
```javascript
init(user_config)  // Setup
log(data)          // Store data point
analyze()          // Generate insights
alert(condition)   // Proactive message
export()           // Data download
```

---

## Data Lake Architecture

Implemented from DAY 1. Total Recall requires full data history.

**Bronze (Raw) - Cloudflare R2:**
- Everything as it arrives, NEVER deleted
- Parquet format, `r2://exoskull/{tenant_id}/bronze/{data_type}/year={YYYY}/month={MM}/day={DD}/`

**Silver (Cleaned) - Supabase Postgres:**
- Dedup, validate, normalize timestamps (UTC). Hourly via Edge Function.

**Gold (Aggregated) - Supabase Materialized Views:**
- Daily/weekly/monthly summaries. <100ms query speed. Daily update at 02:00 UTC.

**Query Engine:** DuckDB (embedded in Edge Function) for Parquet on R2.
**Privacy:** Per-tenant isolation, AES-256 at rest, TLS 1.3 in transit, GDPR export.

---

## Autonomous Actions

ExoSkull acts on user's behalf - BUT only with explicit permission.

**Permission Model:** Granular (per-action) | Category (per-domain) | Emergency (upfront consent)

**Examples:** Auto-log sleep, block calendar for deep work, auto-categorize transactions, draft emails, call strangers (schedule doctor, negotiate bills).

---

## CRON & Scheduled Operations

All scheduled operations are **goal-driven** — no hardcoded wellness CRONs. The system creates schedules based on active goals.

**Goal-derived:** System analyzes active goals → generates relevant check-ins, reminders, and reviews automatically.
**Event-driven:** Triggered by goal-relevant conditions (deadline approaching, metric off-track, blocked task).
**Periodic reviews:** Weekly goal progress, monthly strategy adjustment — only for goals that exist.

**Adaptive:** Learn optimal times, don't interrupt deep work, batch notifications. No schedule without a goal behind it.

---

## Android-First Integration

**Key APIs:** Digital Wellbeing, Activity Recognition, Geofencing, HealthConnect, Notification Listener
**Deployment:** <5MB APK, <2% battery/day
**Zero-Install:** SMS-first (no app needed day 1)

---

## ExoSkull-Specific Guardrails

**Hallucination:** Never state facts not in database. If confidence <70% → disclaimer.
**Privacy:** Never share data without consent. Voice recordings auto-delete 90 days.
**Safety:** Never diagnose, never guarantee returns, never manipulate user.
**Actions:** Never delete data without 3x confirmation. Never spend money without approval.
**Technical:** Circuit breaker after 3 failures. 100 req/hour per user. Graceful degradation.
**IP:** Never attribute architecture to competitors. DO mention tools we USE (tech stack).

**TODO (Legal):**
- [ ] IP review of terminology (Mods, Rigs, Quests, Exoskulleton)
- [ ] Trademark search for "ExoSkull" and "Exoskulleton"

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
