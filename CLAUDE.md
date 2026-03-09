# ExoSkull — Autonomous Life Operating System

> **Global instructions:** `~/.claude/CLAUDE.md` (planning vs execution, agents, protocols)
> **Home instructions:** `~/CLAUDE.md` (GOTCHA framework)
> **Full architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)

## ⚠️ OBOWIĄZKOWE DO PRZECZYTANIA NA STARCIE SESJI
1. **`PRODUCT_DECISIONS_v1.md`** — 74 decyzje produktowe (zatwierdzone przez usera, 446 pytań)
2. **`MVP_EXECUTION_PLAN.md`** — 10-fazowy plan wykonawczy
3. **`ARCHITECTURE.md`** — Pełny status implementacji (co działa, co nie)
4. **`LEARNINGS.md`** — Gotchas i wzorce z poprzednich sesji

**NIE MÓW "nie wiem co ustaliliśmy".** Odpowiedzi na WSZYSTKIE pytania są w tych plikach.

---

## WHAT IS EXOSKULL — READ THIS FIRST

ExoSkull is a **SaaS platform** where every user gets a **fully autonomous AI agent (IORS)** that actively pursues their goals, builds apps, generates skills, self-modifies its own code, and runs continuously without supervision. It takes **outbound actions in the real world** — calls people, sends messages, operates user's accounts, negotiates, delegates tasks to third parties, and (in future) negotiates with other users' AI agents.

**This is NOT a chatbot. This is NOT an assistant. This is an autonomous operating system for the user's life.**

**This must become a better version of OpenClaw — the next evolution of autonomous AI agents.**

### Core Model
- **1 IORS instance = 1 device/VPS = 1 user account**
- User can have MULTIPLE devices/VPS instances that may cooperate

### Core Capabilities (NON-NEGOTIABLE)
1. **AUTONOMY** — agent acts continuously 24/7, pursues goals without being asked, takes initiative
2. **BUILDS COMPLEX APPS** — agent autonomously generates full applications (DB schema + API + UI) when a goal requires them. Not templates — real, custom, functional apps tailored to the user's needs
3. **SELF-MODIFYING CODE** — agent can read, modify, and extend its OWN source code. It evolves itself — adds new capabilities, fixes its own bugs, optimizes its own behavior
4. **GENERATES SUB-AGENTS & SKILLS** — spawns specialized sub-agents and skills on demand. Each IORS is a factory that builds whatever it needs to achieve the user's goals
5. **OUTBOUND REAL-WORLD ACTIONS** — calls strangers, sends emails/SMS, schedules appointments, pays bills, negotiates, operates on user's accounts and services — full delegation with permission system
6. **SUPERINTEGRATOR** — agent auto-discovers and auto-connects to ALL user's apps and services. Supports OAuth2, API keys, and webhooks. Encrypted credentials (AES-256). The agent proactively integrates itself with whatever the user uses — not the user configuring connections, the AGENT doing it. DB: `exo_integrations` table. Migration: `20260328000001_superintegrator.sql`
7. **SELF-BUILDS FROM CONVERSATIONS** — MVP ships minimal. The rest emerges organically from user-AI dialogue. The system grows itself

### The #1 Priority: AUTONOMY
Every feature, every design decision, every architectural choice serves one goal: **the agent autonomously realizes the user's goals using all available tools and strategies.** Everything else is secondary.

---

## PHASES

### MVP (Phase 1) — BUILD THIS NOW
1. **Chat** — text input + file upload (paperclip) + /commands (inline interactive widgets in chat stream, like Claude Code artifacts but prettier)
2. **Voice** — dictation (STT), AI message playback (TTS), real-time voice conversation mode
3. **3D Grid + 2D Canvas Overlay** — game HUD paradigm (see UI section below)
4. **Slash commands** — `/mood`, `/tasks`, `/goals`, `/sleep`, `/habits` etc. — access to apps, memory, resources. Open as inline interactive widgets IN the chat
5. **Active intelligence** — system actively collects and analyzes info about user's situation to make increasingly better decisions
6. **Starter skill pack** — pre-built skills and apps available via /commands from day 1
7. **Autonomy engine** — agent acts on its own to advance user goals, takes outbound actions (calls, messages, API operations on user's accounts)

### Phase 2 — Near-term
- Full omnichannel (all messengers, phone, SMS, desktop, mobile apps — everywhere the user is)
- Super-integration (auto-connects to all user's apps and services)
- Feedback system (+/- on every AI action)
- **Gamification**: user gets XP, levels, badges, streaks; agents get efficiency metrics, rankings, performance scores
- **Device competition**: multiple devices compete on performance (which IORS instance works better)
- **Hooked methodology**: dopaminergic UI — attention-grabbing blinks, animations, dynamic screen changes
- 3D model import from external stores
- Outbound actions to third parties at scale

### Phase 3 — Future Vision
- Continuous mic listening, camera/screenshot capture, screen analysis, input monitoring on devices
- Digital phenotyping + implicit attitude research
- Scientific research module preparation
- Small local models on devices (local compute = zero cloud costs on devices)
- **Marketplace**: users buy/sell skills, apps, 3D models with internal credits + royalty/tantiemy system between users
- **Social**: invite users to your grid, share workspaces
- **Multi-agent teams**: agents cooperate for shared user goals
- **Agent-to-agent negotiation**: agents negotiate and delegate between different users (A2A protocol)

---

## UI PARADIGM: GAME HUD

Like in games: **2D HUD overlay in the foreground (map, quests, equipment) + 3D world behind the camera.**

### 2D Canvas Overlay (foreground — the HUD)
- **Chat window**: text input, microphone, send button, paperclip (file upload) — resizable, movable, user-customizable
- **Widgets**: user and AI add widgets to the canvas (drag, resize, pin). Created when user builds skills/apps or AI generates them
- **/commands**: open inline interactive UI widgets INSIDE the chat stream (not redirects — artifacts in chat)
- User fully controls layout — moves, resizes, adds, removes everything

### 3D Grid (background — the world)
- 3D spatial environment where user places **3D models**
- Starter: 10 built-in models to choose from. Future: import from external 3D marketplaces
- On models AND in 3D space: **#hashtag nodes** — spatial information anchors
- **#node = information node in space** — builds trees of: memories, information, tasks, files related to that #
- What each #node represents is negotiated between user and AI
- Nodes form knowledge graphs, task trees, memory trees in explorable 3D space
- Models and nodes are tradeable in the marketplace (like skills and apps)

---

## CURRENT ARCHITECTURE

### AI Pipeline — Claude Agent SDK (SOLE PATH)
- `runExoSkullAgent()` from `lib/agent-sdk/exoskull-agent.ts` — single entry point for ALL channels
- **101 IORS tools** wrapped as in-process MCP server (`lib/agent-sdk/iors-mcp-server.ts`)
- 3 configs: WEB (10 turns, 55s, Sonnet), VOICE (6 turns, 40s, Haiku), ASYNC (15 turns, 50s, Sonnet)
- Emergency fallback: Gemini Flash (no tools, conversation only)
- IORS tools internally use Gemini/Codex for heavy execution (vision, structured output, code gen)
- **DEPRECATED**: `processUserMessage()`, `agent-loop.ts`, old multi-model routing chain

### Data Lake
- **Bronze** (Raw): Cloudflare R2, Parquet, NEVER deleted
- **Silver** (Clean): Supabase Postgres, hourly ETL
- **Gold** (Aggregated): Materialized Views, daily refresh
- Privacy: per-tenant isolation, AES-256, TLS 1.3, GDPR export

### Outbound Actions (LIVE)
- Outbound phone calls (call user + call third parties via delegate system)
- SMS gateway (Twilio, two-way)
- Email sending, calendar operations, account management via integrations
- Permission model: granular (per-action) | category (per-domain) | emergency (upfront consent)

### Scale (current)
- 219 API routes, 43 CRONs, 101 IORS tools, 51 tool files
- Next.js 14.2.35, TypeScript 5, Supabase (Postgres + Auth + Storage)
- Deployed on Railway (web + voice WS) | Desktop: Tauri v2 (Windows/macOS/Linux)
- VPS: OVH Warsaw (57.128.253.15:3500) for sandboxed code execution

---

## MONOREPO STRUCTURE

```
exoskull/
├── exoskull-app/        # Next.js web app (main product, deployed on Vercel)
│   ├── app/             # App router (pages, 219 API routes, 43 CRONs)
│   ├── components/      # React components (cockpit/, stream/, canvas/)
│   ├── lib/             # Business logic (agent-sdk/, iors/, gateway/, voice/)
│   ├── server/          # Voice WebSocket server
│   └── middleware.ts    # Auth, routing
├── exoskull-desktop/    # Tauri v2 desktop app (Rust + React)
├── local-agent/         # Node.js CLI daemon (file sync → Knowledge Base)
├── vps-executor/        # VPS sandboxed code execution (Docker)
├── supabase/            # Database migrations
├── android/             # Android app (planned)
├── goals/               # GOTCHA: process definitions
├── tools/               # GOTCHA: execution scripts
├── context/             # GOTCHA: domain knowledge
└── hardprompts/         # GOTCHA: reusable prompts
```

---

## DEV COMMANDS

### exoskull-app (Next.js)
```bash
cd exoskull-app
npm install                    # Install deps
npm run dev                    # Dev server
npm run build                  # Production build (NODE_OPTIONS='--max-old-space-size=4096')
npm test                       # Vitest
npm run test:watch             # Vitest watch
npm run lint                   # ESLint
npm run test:routes            # Smoke test all routes (needs dev server on :3000)
npm run voice-ws               # Start voice WebSocket server
npm run voice-ws:dev           # Voice WS with hot reload
npm run supabase:gen-types     # Regenerate DB types → lib/database.types.ts
npm run migrate-tyrolka        # Tyrolka migration (--dry-run or --execute)
```

### exoskull-desktop (Tauri v2)
```bash
cd exoskull-desktop
npm install && npm run dev     # Vite dev server
npm run build                  # TypeScript + Vite build
npm run tauri dev              # Tauri dev mode
```

---

## KEY GOTCHAS

### Build Order (CRITICAL)
**NEVER build UI for data that doesn't exist.** Always: DB schema → API routes → UI.

### Supabase
- Factory pattern for `createClient()` (NOT module-level)
- RLS policies need `WITH CHECK` for INSERT
- Migration numbering must be globally unique
- RPC `.catch()` doesn't work — use try/catch
- pgvector: use HNSW index (NOT IVFFlat on empty tables)

### Next.js / API
- New CRON endpoints MUST be added to `isPublicApi` in `lib/supabase/middleware.ts`
- `req.json()` callable only ONCE — parse body once, reuse
- Railway: check timeout limits. Presigned uploads for large files.
- Auth: `createClient` from `@/lib/supabase/server`

### TypeScript
- `unknown && <JSX>` → use ternary `? <JSX> : null`
- Anthropic ContentBlock: use `c.type === "text"` (NOT type predicate)

### Voice
- `buildDynamicContext()` returns `DynamicContextResult` — use `.context` for string
- Buffer → NextResponse: use `new Uint8Array(buffer)`

---

## GUARDRAILS

**NEVER:** edit bez read | commit .env/credentials | delete data without 3x confirmation | spend money without approval | claim "works" without testing | plaintext secrets

**ALWAYS:** test after implementation | error logging | `git add [specific files]` (not -A) | research before suggesting

**Safety:** Never diagnose | never guarantee returns | never manipulate user | circuit breaker after 3 failures | 100 req/hour per user

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

## FRAMEWORKS

Inherited from `~/.claude/CLAUDE.md` §4. Key for this project:
- **ATLAS**: DB schema → API → UI (primary build workflow). Spec: [build_app.md](./build_app.md)
- **CLAWS**: For building new integrations and agent capabilities
- **Build order**: Opus (architect/trace) → Sonnet (assemble) → Haiku (link/stress-test)

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

**ExoSkull = the user's autonomous agent that never sleeps, actively pursues goals, takes real-world actions, builds what it needs, and co-creates an emergent world with the user. Everything else is a tool to that end.**
