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

## Multi-Model AI Routing (2026-03-04)

Smart routing: simple queries → fast/cheap, complex → powerful.

| Tier | Model | Use For |
|------|-------|---------|
| 1 | Gemini 2.5 Flash | Simple chat, classification, routing (<1s) |
| 2 | Claude Haiku 4.5 | Pattern detection, summarization |
| 3 | Claude Sonnet 4.6 | Complex tasks with tools (V3 agent) |
| 4 | Claude Opus 4.6 | Meta-coordination, gap detection, crisis |

**Smart Routing:** Classify query complexity BEFORE calling model. Simple → Gemini Flash (no tools, <1s). Complex → Claude Sonnet (with tools, async if >5s).
**Emergency Fallback:** Gemini 2.5 Flash when Anthropic credits exhausted (conversation-only mode).
**Prompt Caching:** Static context cached for 90% savings. Only dynamic context sent fresh.

---

## Skill Library System (2026-03-04)

ExoSkull builds skills on-demand when a goal requires capabilities the system doesn't have yet.

- **Core Skills:** Built-in (task_manager, memory, knowledge, goals)
- **Dynamic Skills:** AI detects need → generates → validates → USES without asking user
- **Proactive:** AI generates and deploys skills autonomously when goals require them
- **Felix Pattern:** Full automation — AI achieves complex goals (research → plan → build → market → sell → support). AI estimates cost and asks before spending.

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

## Autonomous Actions (2026-03-04)

ExoSkull acts on user's behalf with **fully adaptive autonomy**.

**Permission Model:** User defines rules in chat → AI records and generates workspace view.
- Example: "Emaile do X wysyłaj sam, SMS zawsze pytaj, telefony blokuj"
- AI decides WHEN and WHAT to propose — based on goals, behavior, preferences
- AI generates and USES skills without asking — if goal requires it
- Before large spend: AI estimates cost and asks ("Szacuję ~$30 AI. OK?")

**Outbound:** emails, SMS, calls (user + strangers), negotiations (AI solo or AI+user per situation)
**CRONs:** Must do CONCRETE things (check deadlines, emails, goals, calendar). Not abstract wellness.

---

## CRON & Scheduled Operations

All scheduled operations are **goal-driven** — CRONs must do CONCRETE things.

**Current v3 CRONs:** heartbeat (5min), morning briefing, evening reflection, nightly consolidation
**Goal-derived:** System analyzes active goals → generates relevant check-ins, reminders, and reviews automatically.
**Event-driven:** Triggered by goal-relevant conditions (deadline approaching, metric off-track, blocked task).
**MAPE-K + Ralph Loop = one unified loop.** Signal Triage is part of Monitor phase.

**Adaptive:** Learn optimal times, don't interrupt deep work, batch notifications. No schedule without a goal behind it.

---

## Shared Workspace (2026-03-04)

Split layout: Left = Chat/Unified Stream, Right = Shared Workspace.

**Workspace contains:**
- Virtual browser (Chrome on VPS via CDP + WebRTC live stream) — AI controls, user sees and can take over
- Expanded links/files from unified stream
- AI-generated dashboards/pages (zero precoded pages)
- VPS terminal, code execution output
- Document previews, visualizations

**Mobile:** Chat-first. Workspace auto-opens when agent shows something.
**Tech:** Chrome DevTools Protocol for interaction + WebRTC for live view.

---

## Graph-Based Knowledge (2026-03-04)

**Tyrolka framework REMOVED.** Replaced by graph model in Postgres.

```
nodes (id, tenant_id, type, name, content, metadata JSONB, embedding vector(1536), parent_id, created_at)
  type: 'goal', 'task', 'note', 'memory', 'pattern', 'document', 'tag'

edges (id, source_id, target_id, relation, metadata JSONB)
  relation: 'has_subtask', 'tagged_with', 'related_to', 'blocks', 'depends_on'
```

**#Hashtags** = simultaneously tag + semantic key + knowledge graph node. Multi-nested hierarchy.
**pgvector embeddings** on nodes → semantic search + graph traversal.
**Dashboard** = interactive hashtag tree (not traditional pages).

---

## Tenant Instance Isolation (2026-03-04)

Parent/child model for self-modification:

**Platform core (IMMUTABLE):** auth, billing, middleware, agent engine, security, DB migrations, infrastructure
**Tenant instance (MODIFIABLE by agent):** skills, UI, config, prompts, new API routes (sandbox), generated apps

Each IORS agent can modify EVERYTHING in its user's instance but NOTHING in the platform core.

---

## Channels: Omnichannel (2026-03-04)

ALL channels available from day 1 via separate adapters (NO GoHighLevel):
- Web chat, SMS, Email, WhatsApp, Telegram, Discord, Messenger, Instagram, Slack, iMessage
- Same tools on ALL channels. Output adapted per channel (voice=describes, web=shows, SMS=brief)
- Onboarding: conversational, omnichannel. AI decides what to ask adaptively

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
