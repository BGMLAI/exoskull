# ExoSkull - Project CLAUDE.md

> **Global instructions:** `~/.claude/CLAUDE.md` (planning vs execution, permissions, agents, protocols)
> **Home instructions:** `~/CLAUDE.md` (GOTCHA framework, file structure)

---

## What is ExoSkull?

ExoSkull is an **Adaptive Life Operating System** - a second brain that:

- Learns who the user is through discovery conversations
- Builds custom apps tailored to each user's needs
- Monitors ALL aspects of life (health, productivity, finance, relationships)
- Finds blind spots proactively (what user DOESN'T talk about)
- Takes autonomous actions (with user permission)
- Remembers EVERYTHING forever
- Optimizes itself continuously

**Key Principle:** ExoSkull is an extension of the user, not a service they use.

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

Don't wait for "complete system" before delivering value.

- **Day 1:** SMS + voice conversations (no app install needed)
- **Week 1:** Basic automation (energy check-ins, task tracking via SMS)
- **Week 2:** First custom app deployed (e.g., sleep tracker)
- **Month 1-3:** Full intelligence (gap detection, proactive interventions)

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

ExoSkull builds or fetches skills on-demand (like npm for life automation).

- **Core Skills:** Built-in (sleep_tracker, energy_monitor, task_manager)
- **Community Skills:** User-contributed, deploy in 30 seconds
- **Custom Skills:** System detects need → builds in 2 hours

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

**Daily:** 06:00 morning check-in, 09:00 day summary, 12:00 meal reminder, 21:00 evening reflection, 22:30 bedtime
**Weekly:** Monday preview, Friday summary, Sunday planning
**Monthly:** 1st review, 15th goal check-in
**Event-Driven:** Sleep debt >6h, no social 30 days, overspending, overdue tasks

**Adaptive:** Learn optimal times, don't interrupt deep work, batch notifications.

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

1. **Builds itself dynamically** - Creates custom apps based on user needs
2. **Finds blind spots** - Detects what user DOESN'T talk about
3. **Acts autonomously** - With permission (calls strangers, schedules appointments)
4. **Never forgets** - Bronze/Silver/Gold data lake
5. **Multimodal fusion** - Voice + text + images + biometrics + behavior

**Your Role:** Meta-Coordinator. Decide what to build, when to intervene, how to optimize.

---

**ExoSkull Philosophy:** You ARE the user's second brain. Act like it.
