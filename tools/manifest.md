# Tools Manifest - ExoSkull GOTCHA Framework

> Master list of all tools (deterministic scripts) in ExoSkull.
> Before writing new code, CHECK THIS MANIFEST FIRST.

---

## Directory Structure

```
exoskull-app/lib/
├── ai/                    # Multi-model AI routing
├── agents/                # Specialized agent system
├── cron/                  # Scheduled jobs
├── datalake/              # Bronze/Silver/Gold ETL
├── dashboard/             # Dashboard types
├── ghl/                   # GoHighLevel CRM integration
├── learning/              # Self-updating system
├── memory/                # Highlights and memory
├── mods/                  # User-facing abilities
├── onboarding/            # Discovery & onboarding
├── rigs/                  # External API integrations
├── security/              # Safety & guardrails
├── storage/               # R2 & Parquet
├── supabase/              # Database clients
├── types/                 # Shared types
└── voice/                 # Voice assistant
```

---

## AI Layer (`lib/ai/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `model-router.ts` | Routes requests to cheapest capable model (Tier 1-4) | `routeRequest()`, `chat()` |
| `task-classifier.ts` | Classifies task complexity for routing | `classifyTask()` |
| `circuit-breaker.ts` | Prevents cascade failures | `execute()`, `getState()` |
| `config.ts` | Model pricing and tier configuration | `MODEL_CONFIGS`, `TIER_MODELS` |
| `types.ts` | AI type definitions | `AIMessage`, `AIResponse`, `ModelTier` |
| `providers/gemini-provider.ts` | Gemini API wrapper (Tier 1) | `chat()` |
| `providers/anthropic-provider.ts` | Anthropic API wrapper (Tier 2, 4) | `chat()` |
| `providers/kimi-provider.ts` | Kimi API wrapper (Tier 3) | `chat()` |

**Usage:**
```typescript
import { ModelRouter } from '@/lib/ai/model-router'

const router = new ModelRouter()
const response = await router.chat({
  messages: [...],
  taskCategory: 'simple_response' // Routes to Tier 1
})
```

---

## Agents Layer (`lib/agents/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `coordinator.ts` | Multi-agent orchestration | `runAgents()`, `delegate()` |
| `registry.ts` | Agent registration and lookup | `getAgent()`, `register()` |
| `types.ts` | Agent type definitions | `AgentTask`, `AgentResult` |
| `core/base-agent.ts` | Base agent class | `execute()`, `think()` |
| `core/agent-context.ts` | Shared context for agents | `AgentContext` |
| `specialized/mit-detector.ts` | Most Important Things detector | `detectMITs()` |
| `specialized/clarifying-agent.ts` | Asks clarifying questions | `clarify()` |
| `specialized/highlight-extractor.ts` | Extracts highlights from conversations | `extract()` |
| `specialized/pattern-learner.ts` | Learns patterns from user behavior | `learn()` |

---

## CRON Layer (`lib/cron/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `dispatcher.ts` | Dispatches scheduled check-ins | `dispatch()`, `getSchedule()` |
| `timezone-utils.ts` | Timezone handling | `toUserTimezone()`, `fromUTC()` |

**Check-in types:**
- `morning` - Daily morning check-in
- `evening` - Daily evening reflection
- `custom` - User-defined schedules

---

## Data Lake Layer (`lib/datalake/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `bronze-etl.ts` | Raw data ingestion to R2 (Parquet) | `ingest()`, `writeBronze()` |
| `silver-etl.ts` | Cleaned data to Supabase | `transform()`, `dedupe()` |
| `gold-etl.ts` | Aggregated insights (materialized views) | `aggregate()`, `refresh()` |

**Pipeline:**
```
Bronze (R2 Parquet) → Silver (Supabase cleaned) → Gold (Materialized views)
```

---

## GHL Layer (`lib/ghl/`) - GoHighLevel CRM

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `client.ts` | GHL API client with auth | `get()`, `post()`, `refreshToken()` |
| `contacts.ts` | Contact management | `createContact()`, `updateContact()`, `getContact()` |
| `messaging.ts` | SMS, Email, WhatsApp | `sendMessage()`, `getConversations()` |
| `calendar.ts` | Appointments and scheduling | `createAppointment()`, `getSlots()` |
| `workflows.ts` | Workflow automation | `triggerWorkflow()` |
| `opportunities.ts` | Pipeline/deals sync | `createOpportunity()` |
| `social.ts` | Social media posting | `schedulePost()` |
| `index.ts` | Unified GHL client | `GHLClient` |

**Usage:**
```typescript
import { GHLClient } from '@/lib/ghl'

const ghl = new GHLClient(accessToken)
await ghl.messaging.sendMessage({
  type: 'SMS',
  contactId: 'xxx',
  message: 'Hello!'
})
```

---

## Learning Layer (`lib/learning/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `self-updater.ts` | Updates system prompts based on patterns | `update()` |
| `highlight-integrator.ts` | Integrates new highlights to user profile | `integrate()` |
| `index.ts` | Learning system exports | - |

---

## Memory Layer (`lib/memory/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `highlights.ts` | Stores and retrieves user highlights | `save()`, `get()`, `search()` |

**Highlight types:**
- `preference` - User preferences
- `pattern` - Behavioral patterns
- `goal` - User goals
- `insight` - AI observations
- `fact` - Objective facts

---

## Mods Layer (`lib/mods/`) - User Abilities

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `types.ts` | Mod type definitions | `ModDefinition`, `ModSlug`, `IModExecutor` |
| `personality.ts` | Personality/role handling | `getPersonality()` |
| `index.ts` | Mod registry and loading | `getMod()`, `installMod()` |
| `executors/task-manager.ts` | Task CRUD operations | `createTask()`, `getTasks()`, `completeTask()` |
| `executors/mood-tracker.ts` | Mood logging | `logMood()`, `getMoodHistory()` |
| `executors/habit-tracker.ts` | Habit tracking | `logHabit()`, `getStreak()` |
| `executors/index.ts` | Executor registry | `getExecutor()` |

**Available Mods:**
- `sleep-tracker` - Sleep tracking and insights
- `energy-monitor` - Energy level monitoring
- `focus-mode` - Focus/deep work sessions
- `task-manager` - Task management
- `mood-tracker` - Mood logging
- `habit-tracker` - Habit streaks

---

## Onboarding Layer (`lib/onboarding/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `discovery-prompt.ts` | Discovery conversation prompts | `DISCOVERY_SYSTEM_PROMPT`, `EXTRACTION_PROMPT` |
| `types.ts` | Onboarding type definitions | `OnboardingProfile` |

---

## Rigs Layer (`lib/rigs/`) - External Integrations

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `types.ts` | Rig type definitions | `RigDefinition`, `RigSlug`, `IRigClient` |
| `oauth.ts` | OAuth flow handling | `startOAuth()`, `exchangeCode()` |
| `index.ts` | Rig registry | `getRig()`, `connectRig()` |
| `google/client.ts` | Unified Google integration | `GoogleClient` |
| `google-fit/client.ts` | Google Fit health data | `getSteps()`, `getSleep()` |
| `google-workspace/client.ts` | Google Calendar, Drive | `getEvents()`, `createEvent()` |
| `microsoft-365/client.ts` | Microsoft 365 integration | `getCalendar()` |
| `notion/client.ts` | Notion integration | `getPages()`, `createPage()` |
| `todoist/client.ts` | Todoist task sync | `getTasks()`, `createTask()` |

**Available Rigs:**
- `google` - Unified Google (Fit + Workspace + YouTube)
- `oura` - Oura Ring health data
- `fitbit` - Fitbit integration
- `microsoft-365` - Microsoft calendar, email
- `notion` - Notion pages and databases
- `todoist` - Todoist tasks

---

## Security Layer (`lib/security/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `ssrf-guard.ts` | SSRF protection for webhooks | `validateUrl()` |
| `safety-guardrails.ts` | Content safety checks | `checkSafety()`, `detectCrisis()` |
| `timestamps.ts` | Secure timestamp handling | `sign()`, `verify()` |
| `embeddings.ts` | Embedding security | `secureEmbed()` |
| `index.ts` | Security exports | - |

---

## Storage Layer (`lib/storage/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `r2-client.ts` | Cloudflare R2 client | `put()`, `get()`, `list()` |
| `parquet-writer.ts` | Parquet file writer | `write()` |
| `parquet-reader.ts` | Parquet file reader | `read()`, `query()` |

**Storage paths:**
```
r2://exoskull/{tenant_id}/bronze/{data_type}/year={YYYY}/month={MM}/day={DD}/
```

---

## Supabase Layer (`lib/supabase/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `client.ts` | Browser Supabase client | `createClient()` |
| `server.ts` | Server Supabase client | `createServerClient()` |
| `middleware.ts` | Auth middleware | `updateSession()` |

---

## Voice Layer (`lib/voice/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `system-prompt.ts` | Voice prompt builder | `buildFullSystemPrompt()`, `buildDynamicContext()` |
| `audio-cache.ts` | TTS audio caching | `cache()`, `get()` |
| `PSYCODE.md` | Personality foundation (source) | - |

**Prompt structure:**
```
PSYCODE (personality) → Static prompt (cached) → Dynamic context (per-call)
```

---

## Utility Layer (`lib/`)

| Tool | Description | Key Functions |
|------|-------------|---------------|
| `utils.ts` | General utilities | `cn()`, `formatDate()` |
| `db-init.ts` | Database initialization | `initDatabase()` |
| `db-direct.ts` | Direct DB queries | `query()` |

---

## Adding New Tools

1. Create file in appropriate `lib/` subdirectory
2. Add entry to this manifest
3. Export from subdirectory `index.ts`
4. Document key functions and usage

**Template:**
```typescript
/**
 * [Tool Name] - [One sentence description]
 *
 * Part of: [Layer name]
 * Used by: [Goals that use this]
 */

export async function mainFunction() {
  // Implementation
}
```

---

**Last updated:** 2026-02-02
**Version:** 1.0
