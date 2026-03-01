# ExoSkull — Autonomous Life Operating System

> **Global instructions:** `~/.claude/CLAUDE.md` (planning vs execution, agents, protocols)
> **Home instructions:** `~/CLAUDE.md` (GOTCHA framework)
> **Full architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)

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
6. **SELF-BUILDS FROM CONVERSATIONS** — MVP ships minimal. The rest emerges organically from user-AI dialogue. The system grows itself

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
├── exoskull-app/        # Next.js web app (main product, Railway)
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

## FRAMEWORKS

Inherited from `~/.claude/CLAUDE.md` §4. Key for this project:
- **ATLAS**: DB schema → API → UI (primary build workflow). Spec: [build_app.md](./build_app.md)
- **CLAWS**: For building new integrations and agent capabilities
- **Build order**: Opus (architect/trace) → Sonnet (assemble) → Haiku (link/stress-test)

---

**ExoSkull = the user's autonomous agent that never sleeps, actively pursues goals, takes real-world actions, builds what it needs, and co-creates an emergent world with the user. Everything else is a tool to that end.**
