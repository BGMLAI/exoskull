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

---

## Dev Commands

<!-- TODO: Fill in actual commands when project scaffolding is set up -->
```bash
# Setup
# npm install / pnpm install

# Dev server
# npm run dev

# Tests
# npm test

# Database
# supabase start / supabase db push

# Deploy
# vercel deploy
```

---

## ATLAS Workflow (Building Apps)

**A - Architect:** Define problem, users, success metrics
**T - Trace:** Data schema, integrations, tech stack
**L - Link:** Validate ALL connections before building
**A - Assemble:** Build (database → backend → frontend)
**S - Stress-test:** Test functionality, edge cases, user acceptance

Read [build_app.md](./build_app.md) for detailed workflow.

**Critical:** NEVER build UI for data structures that don't exist yet. Always: DB schema first → API routes second → UI last.

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
