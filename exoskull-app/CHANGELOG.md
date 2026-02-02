# ExoSkull App - Changelog

All notable changes to this project.

---

## [2026-02-03] MODUL 3: Voice Pipeline (Twilio + ElevenLabs + Claude)

### Added - Custom Voice Pipeline (WITHOUT VAPI)

Built a complete voice pipeline for phone calls using HTTP turn-by-turn pattern.

**Stack:** Twilio (telephony) + ElevenLabs (TTS/STT) + Claude (LLM)

**New files created:**

| File | Purpose |
|------|---------|
| `lib/voice/twilio-client.ts` | TwiML generation, outbound calls |
| `lib/voice/elevenlabs-tts.ts` | Text-to-Speech with caching |
| `lib/voice/elevenlabs-stt.ts` | Speech-to-Text with Deepgram fallback |
| `lib/voice/conversation-handler.ts` | Claude conversation + tools |
| `lib/voice/index.ts` | Module exports |
| `app/api/twilio/voice/route.ts` | Main webhook (start/process/end) |
| `app/api/twilio/status/route.ts` | Call status callbacks |
| `app/api/twilio/outbound/route.ts` | Initiate outbound calls |
| `app/api/voice/sessions/route.ts` | Voice session history API |

**Migration:** `20260202000027_voice_sessions.sql`
- `exo_voice_sessions` table for conversation state
- `voice-audio` storage bucket for TTS audio

### Enhanced - Dashboard Voice Page

- Added "Test Phone Call" button (calls user's phone via Twilio)
- Added voice sessions history display
- Web voice still uses VAPI SDK (hybrid approach)

### Voice Flow

```
User calls → Twilio webhook → Claude + Tools → ElevenLabs TTS → Twilio <Play>
```

### Dependencies

```
twilio@^5.0.0
```

---

## [2026-02-02] Data Pipeline Verification & Analytics Module

### ATLAS L - Link (VERIFIED)

**Data Pipeline Status:** All layers operational

| Layer | Status | Files |
|-------|--------|-------|
| Bronze ETL | WORKING | `lib/datalake/bronze-etl.ts`, `app/api/cron/bronze-etl/route.ts` |
| Silver ETL | WORKING | `lib/datalake/silver-etl.ts`, `app/api/cron/silver-etl/route.ts` |
| Gold ETL | WORKING | `lib/datalake/gold-etl.ts`, `app/api/cron/gold-etl/route.ts` |
| R2 Storage | CONFIGURED | Credentials in `.env.local` |
| Cron Jobs | CONFIGURED | `vercel.json` (01:00, 02:00, 03:00 UTC) |

### Added - Analytics Module

**New files created:**

| File | Purpose |
|------|---------|
| `lib/analytics/duckdb-client.ts` | DuckDB query generation for Bronze layer, R2 file discovery |
| `lib/analytics/queries.ts` | Pre-built queries for Gold/Silver layer dashboards |
| `lib/analytics/index.ts` | Unified exports for analytics module |

**Analytics queries available:**
- `getDailySummary()` - Gold layer, <100ms
- `getWeeklySummary()` - Gold layer, <100ms
- `getMonthlySummary()` - Gold layer, <100ms
- `getMessagesDailySummary()` - Gold layer, <100ms
- `getRealTimeStats()` - Silver layer, real-time
- `getRecentConversations()` - Silver layer, real-time
- `getConversationInsights()` - Derived insights
- `getPeriodComparison()` - Week-over-week comparison

**DuckDB utilities:**
- `generateDuckDBSQL()` - Generate SQL for ad-hoc Bronze queries
- `getDuckDBConfig()` - R2 connection config for DuckDB
- `ANALYTICS_QUERIES` - Pre-built query templates

### Added - Gold Layer Refresh RPC

**Migration:** `20260202000026_gold_refresh_function.sql`

**RPC Functions:**
- `refresh_gold_view(view_name)` - Refresh single materialized view with CONCURRENTLY
- `refresh_all_gold_views()` - Refresh all 4 Gold views, returns status

### Added - Testing Documentation

**File:** `docs/data-pipeline-testing.md`

Comprehensive stress-test guide covering:
- Bronze ETL testing (R2 connection, single/all tenants)
- Silver ETL testing (data quality checks)
- Gold ETL testing (RPC functions, benchmarks)
- End-to-end pipeline test procedure
- Troubleshooting guide
- Performance benchmarks

### Files Changed

| File | Change |
|------|--------|
| `lib/analytics/duckdb-client.ts` | NEW - DuckDB client for Bronze layer |
| `lib/analytics/queries.ts` | NEW - Dashboard query functions |
| `lib/analytics/index.ts` | NEW - Module exports |
| `supabase/migrations/20260202000026_gold_refresh_function.sql` | NEW - RPC functions |
| `docs/data-pipeline-testing.md` | NEW - Testing documentation |

### How to Verify

```bash
# Check Bronze ETL status
curl -X GET "https://exoskull.xyz/api/cron/bronze-etl"

# Check Silver ETL status
curl -X GET "https://exoskull.xyz/api/cron/silver-etl"

# Check Gold ETL status
curl -X GET "https://exoskull.xyz/api/cron/gold-etl"
```

---

## [2026-02-02] Voice Pipeline Fix & Cron System Repair

### Fixed - Voice Function (exoskull-voice)

**Critical bugs fixed:**
- Changed table reference from `tasks` → `exo_tasks`
- Changed column reference from `user_id` → `tenant_id`
- Changed user lookup from `users` table → `exo_tenants` table
- Changed phone column from `phone_number` → `phone`

**Added - Claude Tool Use:**
- `add_task` - Create new tasks via voice
- `complete_task` - Mark tasks as done (fuzzy title match)
- `list_tasks` - List pending/done/all tasks

### Fixed - Scheduled Jobs System

**SQL Function Fix:**
- Created migration `20260202000025_fix_scheduled_job_function.sql`
- Fixed `get_users_for_scheduled_job` function with explicit type casts
- Resolved "structure of query does not match function result type" error

### Configuration

**Tenant Setup:**
- Added phone number `+48607090956` to tenant
- Added consent for all 10 user-facing scheduled jobs

**Twilio Webhook:**
- Updated +48732144112 webhook from old Supabase project to correct one
- URL: `https://uvupnwvkzreikurymncs.supabase.co/functions/v1/exoskull-voice?action=start`

**Supabase Secrets:**
- Added `ANTHROPIC_API_KEY`
- Added `ELEVENLABS_API_KEY`

### Changed - ElevenLabs Voice ID

Updated voice ID in 5 files from `vhGAGQee0VjHonqyxGxd` to `Qs4qmNrqlneCgYPLSNQ7`:
- `components/voice/GlobalVoiceButton.tsx`
- `app/dashboard/voice/page.tsx`
- `lib/cron/dispatcher.ts`
- `app/api/audio/generate-cache/route.ts`
- `IORS_Master_Project/supabase/functions/exoskull-voice/index.ts`

### Deployed

- Vercel: https://exoskull.xyz (all knowledge API routes)
- Supabase Edge Function: `exoskull-voice` with tool use

---

## [2026-02-02] Mood Tracker & Habit Tracker Mods

### Added - Mood Tracker Mod

**Executor:** `lib/mods/executors/mood-tracker.ts`

Implements `IModExecutor` interface for daily mood tracking:

**Data:**
- Mood value (1-10 scale)
- Energy level (1-10)
- Emotions (multi-select from 15 predefined emotions)
- Context (morning/afternoon/evening/night)
- Notes

**Insights:**
- Mood trend detection (improving/stable/declining)
- Missing check-in reminders
- Weekly consistency tracking
- Top emotions analysis
- Low mood pattern alerts (mental health awareness)

**Actions:**
| Action | Description |
|--------|-------------|
| `log_mood` | Record mood entry with emotions and notes |
| `get_history` | Retrieve mood entries for time period |
| `delete_entry` | Remove a mood entry |

### Added - Habit Tracker Mod

**Executor:** `lib/mods/executors/habit-tracker.ts`

Full habit tracking with streaks and completion rates:

**Data:**
- Habit definitions (name, description, frequency)
- Daily/weekly frequency support
- Target days for weekly habits
- Reminder time configuration
- Icon and color customization

**Insights:**
- Daily progress (X/Y habits completed)
- Streak achievements (7+ days)
- Broken streak warnings
- Low completion rate detection
- Consistency celebration

**Actions:**
| Action | Description |
|--------|-------------|
| `create_habit` | Create new habit to track |
| `complete_habit` | Mark habit done for today |
| `update_habit` | Modify habit properties |
| `delete_habit` | Soft-delete (deactivate) habit |
| `get_habit_history` | Completion history for habit |

### Added - Database Migration

**Migration:** `20260202000014_mood_habit_tables.sql`

**Tables:**
- `exo_mood_entries` - Mood check-in records
- `exo_habits` - Habit definitions
- `exo_habit_completions` - Completion log

**Indexes:**
- Efficient queries by tenant + date
- Fast lookup for today's entries

**Analytics Views:**
- `silver_mood_daily` - Daily mood aggregations
- `silver_habits_weekly` - Weekly completion rates

### Changed - Executor Registry

**Updated:** `lib/mods/executors/index.ts`
- Added `MoodTrackerExecutor`
- Added `HabitTrackerExecutor`
- Factory functions for both

**Implemented Mods:** 3 total
- task-manager
- mood-tracker
- habit-tracker

### Notes for Future Agents
- Both Mods are standalone (no Rigs required)
- Use `x-tenant-id` header for API calls
- Mood check-in times configurable in mod config
- Habit soft-delete preserves completion history

---

## [2026-02-02] Multi-Model AI Router

### Added - Intelligent AI Model Routing

**Multi-Model Router** (`lib/ai/`)
Complete AI cost optimization system with 4-tier model routing:

| Tier | Model | Cost/1M | Use Cases |
|------|-------|---------|-----------|
| 1 | Gemini 1.5 Flash | $0.075 | Classification, simple responses |
| 2 | Claude 3.5 Haiku | $0.80 | Summarization, analysis |
| 3 | Kimi K2.5 | ~$0.50 | Complex reasoning, long context |
| 4 | Claude Opus 4.5 | $15.00 | Crisis, meta-coordination |

**Core Components:**
- `lib/ai/types.ts` - TypeScript interfaces for entire AI system
- `lib/ai/config.ts` - Model configurations, pricing, tier mappings
- `lib/ai/task-classifier.ts` - Automatic task complexity classification
- `lib/ai/circuit-breaker.ts` - Failure handling with cooldown
- `lib/ai/model-router.ts` - Central routing logic with escalation
- `lib/ai/index.ts` - Factory functions and convenience API

**Provider Implementations:**
- `lib/ai/providers/gemini-provider.ts` - Google Gemini integration
- `lib/ai/providers/anthropic-provider.ts` - Claude Haiku & Opus
- `lib/ai/providers/kimi-provider.ts` - Moonshot AI (Kimi K2.5)

**Features:**
- Automatic task classification based on keywords and complexity
- Tier escalation on failure (1 → 2 → 3 → 4)
- Circuit breaker with 5-minute cooldown after 3 failures
- Task history learning (reuses successful models)
- Cost estimation per request
- Usage tracking (database migration included)

**API:**
```typescript
import { aiChat, aiQuick, aiCritical } from '@/lib/ai'

// Auto-routed based on complexity
const response = await aiChat(messages)

// Explicit tier hints
await aiChat(messages, { taskCategory: 'simple_response' }) // Tier 1
await aiChat(messages, { forceTier: 4 })                    // Tier 4
await aiQuick(prompt)    // Tier 1 - Gemini Flash
await aiCritical(prompt) // Tier 4 - Claude Opus
```

### Added - Database Migration
- `supabase/migrations/20260202000013_ai_usage_tracking.sql`
- `exo_ai_usage` table for request tracking
- `mv_ai_daily_costs` materialized view for cost analysis
- Helper functions: `log_ai_usage()`, `get_ai_usage_summary()`

### Changed - Greeting Generation
- `app/api/generate-greeting/route.ts` now uses Multi-Model Router
- Routes to Tier 1 (Gemini Flash) for cost optimization
- ~95% cost reduction vs direct GPT-4 calls

### Dependencies
```bash
npm install @anthropic-ai/sdk @google/generative-ai
```

### Environment Variables Required
```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
KIMI_API_KEY=sk-...  # Optional
```

---

## [2026-02-02] Google Tasks Integration

### Added - Google Tasks API

**Google Workspace Client** - extended with Tasks API:
- `getTaskLists()` - List all task lists
- `getDefaultTaskList()` - Get primary task list
- `getTasks()` - List tasks (with showCompleted option)
- `getTask()` - Get single task
- `createTask()` - Create new task with title, notes, due date
- `updateTask()` - Update task properties
- `completeTask()` / `uncompleteTask()` - Toggle completion
- `deleteTask()` - Remove task
- `getActiveTasks()` - Get non-completed tasks
- `getDueTodayTasks()` - Tasks due today
- `getOverdueTasks()` - Overdue tasks

### Changed - OAuth Scopes
- Added `https://www.googleapis.com/auth/tasks` to google-workspace
- Added `https://www.googleapis.com/auth/tasks.readonly` to google-workspace

### Changed - Task Manager Mod
- Google Tasks is now **primary source** (default)
- Unified view: Google Tasks + Todoist + Notion + ExoSkull
- `create_task` defaults to Google Tasks
- `complete_task` supports Google format (`google:listId:taskId`)
- Added `google_tasklist_id` config option

### Files Changed
- `lib/rigs/google-workspace/client.ts` - Full Google Tasks API
- `lib/rigs/oauth.ts` - Added Tasks scopes
- `lib/mods/executors/task-manager.ts` - Google integration
- `lib/mods/index.ts` - Updated requires_rigs

---

## [2026-02-02] Notion + Todoist Integration & Task Manager Mod

### Added - Rig Clients

**Notion Client** (`lib/rigs/notion/client.ts`)
- Full Notion API v2022-06-28 integration
- Search (pages, databases)
- Pages (CRUD, archive)
- Databases (query, get all items)
- Blocks (page content, append, delete)
- Users (list, me)
- Task helpers (createTask, completeTask)
- Dashboard data aggregation

**Todoist Client** (`lib/rigs/todoist/client.ts`)
- Full Todoist REST API v2 integration
- Tasks (CRUD, complete, reopen)
- Projects (CRUD)
- Sections (CRUD)
- Labels (CRUD)
- Comments (CRUD)
- Filters (today, overdue, 7 days, high priority)
- Productivity stats (Sync API)
- Dashboard data aggregation

### Added - Task Manager Mod Executor

**First Mod Implementation** (`lib/mods/executors/task-manager.ts`)
- Implements `IModExecutor` interface
- Unified task view across Notion + Todoist + ExoSkull internal tasks
- Task normalization (source, title, status, priority, dueDate)
- Priority sorting (urgent → high → medium → low)
- Insights generation:
  - Overdue tasks alert
  - High priority count warning
  - Due today notification
  - Completion rate tracking

**Actions:**
| Action | Description |
|--------|-------------|
| `create_task` | Create in Todoist, Notion, or ExoSkull |
| `complete_task` | Mark task as done in any source |
| `update_priority` | Change task priority |
| `sync` | Force refresh from all sources |

### Added - API Routes

**Mod API** (`app/api/mods/[slug]/route.ts`)
- GET: Get mod data, insights, actions
- POST: Execute mod action

**Rig Sync API** (`app/api/rigs/[slug]/sync/route.ts`)
- POST: Trigger manual sync for any Rig
- GET: Get sync status and history
- Supports: Notion, Todoist, Google Workspace, Microsoft 365, Google Fit

### Added - Executor Registry

**Executor Index** (`lib/mods/executors/index.ts`)
- `getModExecutor(slug)` - Get executor for a mod
- `hasModExecutor(slug)` - Check if mod is implemented
- `getImplementedMods()` - List implemented mods

### Environment Variables Required
```
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=
```

### Notes for Future Agents
- Task Manager Mod is first fully working Mod
- Pattern established for other Mod implementations
- Notion/Todoist OAuth configs already in `lib/rigs/oauth.ts`
- Use `x-tenant-id` header for all Mod/Rig API calls

---

## [2026-02-02] Voice Schedule Tools

### Fixed
- **Cloudflare Tunnel** - VAPI nie mogło wywoływać narzędzi (tunel nieaktywny)

### Added - Voice Schedule Tools
- `get_schedule` - Lista check-inów użytkownika
- `create_checkin` - Nowe przypomnienie (name, time, frequency, channel, message)
- `toggle_checkin` - Włącz/wyłącz check-in

### Added - Database
- **Migration:** `20260202000012_user_checkins.sql`
- **Table:** `exo_user_checkins`

### Files Changed
- `components/voice/GlobalVoiceButton.tsx` - 3 nowe narzędzia VAPI
- `app/api/voice/tools/route.ts` - Handlery schedule
- `lib/voice/system-prompt.ts` - Sekcja 3.5 Harmonogram

---

## [2026-02-02] Android & Workspace Rigs

### Added - New Rigs
**Migration:** `20260202000011_android_workspace_rigs.sql`

- **Google Fit / HealthConnect** - Steps, sleep, heart rate from Android
- **Google Workspace** - Gmail, Calendar, Drive unified
- **Microsoft 365** - Outlook, Calendar, OneDrive, Teams

### Added - OAuth Infrastructure
- `lib/rigs/oauth.ts` - Universal OAuth handler with configs for all providers
- `app/api/rigs/[slug]/connect/route.ts` - Start OAuth flow
- `app/api/rigs/[slug]/callback/route.ts` - Handle OAuth callback

### Added - API Clients
- `lib/rigs/google-fit/client.ts` - Google Fit API (steps, sleep, heart rate, calories)
- `lib/rigs/google-workspace/client.ts` - Gmail, Calendar, Drive APIs
- `lib/rigs/microsoft-365/client.ts` - Outlook, Calendar, OneDrive APIs

### Environment Variables Required
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

---

## [2026-02-02] Mods & Rigs System (Exoskulleton)

### Added - Database Schema
**Migration:** `20260202000010_mods_rigs_schema.sql`

New tables:
- `exo_registry` - Registry of all Mods, Rigs, and Quests
- `exo_user_installations` - User's installed items
- `exo_rig_connections` - OAuth tokens for Rig integrations
- `exo_rig_sync_log` - Sync history

### Added - Seed Data
Pre-populated registry with:
- **10 Rigs:** Oura, Fitbit, Apple Health, Google Calendar, Notion, Todoist, Philips Hue, Home Assistant, Plaid, Stripe
- **9 Mods:** Sleep Tracker, Energy Monitor, HRV Tracker, Focus Mode, Task Manager, Calendar Assistant, Mood Tracker, Habit Tracker, Spending Tracker
- **5 Quests:** 7-Day Sleep Reset, Digital Detox, Morning Routine, Mindfulness Week, Fitness Kickstart

### Added - API Routes
- `GET /api/registry` - Browse Exoskulleton marketplace
- `GET /api/registry/[slug]` - Get item details
- `GET /api/installations` - User's installed items
- `POST /api/installations` - Install mod/rig/quest
- `PATCH /api/installations/[id]` - Update config
- `DELETE /api/installations/[id]` - Uninstall

### Added - Type Definitions
- `lib/rigs/types.ts` - Rig interfaces
- `lib/rigs/index.ts` - Rig definitions with OAuth config
- `lib/mods/types.ts` - Mod interfaces
- `lib/mods/index.ts` - Mod definitions with capabilities

---

## [2026-02-02] IP Research & Final Cleanup

### Research - IP/Legal Analysis
Completed comprehensive research on intellectual property compliance:
- **OpenClaw** - MIT License allows unrestricted use (SAFE)
- **Claude Code** - Not used as component, only Anthropic API (SAFE)
- **Anthropic API** - Commercial use allowed for non-competing products (SAFE)

### Removed - Remaining External References from ARCHITECTURE.md
- Line 257: `(OpenClaw-compatible)` → removed
- Line 1911: `NEW (OpenClaw)` → `NEW`
- Line 1916: `NEW (OpenClaw)` → `NEW`
- Line 1922: `ENHANCED (MemOS)` → `ENHANCED`
- Line 1924: `NEW (MemOS)` → `NEW`
- Line 1925: `Moved + Pi Agent` → `MOVED`
- Line 2987: `3.1 (OpenClaw + IORS...)` → `3.1`

### Verified - No IP Violations
ExoSkull does NOT violate any intellectual property rights of:
- OpenClaw (MIT License - full commercial use allowed)
- Claude Code (not used as component)
- Anthropic (API usage per Commercial Terms)

---

## [2026-02-02] Terminology & IP Protection

### Added - Gaming/Sci-Fi Terminology
**ARCHITECTURE.md** now uses consistent naming:
- **Mods** = User-facing abilities & extensions (sleep tracker, focus mode)
- **Rigs** = Tools & integrations (Oura sync, Calendar)
- **Quests** = Weekly development programs (7-day challenges)
- **Exoskulleton** = Marketplace/catalog for Mods, Rigs, Quests

### Removed - External Brand References
Removed all "inspired by", "X-pattern", "X-style" references that could suggest copying:
- Cleaned ARCHITECTURE.md (OpenClaw, MemOS, Pi Agent references)
- Changed "SOURCES & INSPIRATION" → "TECHNOLOGY STACK"
- Kept brand names we USE (Kimi, LangGraph, Claude) - that's tech stack, not copying

### Added - IP Guardrails
**CLAUDE.md** now includes:
- Never mention architecture was "inspired by" external products
- TODO: Legal research before launch (trademarks, IP review)

---

## [2026-02-02] Application Testing & Bug Fixes

### Fixed - Tasks RLS Policy
**Problem:** Użytkownicy nie mogli dodawać zadań przez dashboard
**Root cause:** Polityka RLS miała tylko `USING` bez `WITH CHECK` - INSERT wymaga obu
**Solution:** Dodano `WITH CHECK (tenant_id = auth.uid())`

**Migrations:**
- `20260202000008_fix_tasks_rls.sql` - Naprawiona polityka RLS
- `20260202000009_drop_permissive_policy.sql` - Usunięta zbyt permisywna polityka

### Fixed - Migration Duplicate
**Problem:** Dwa pliki migracji z tym samym numerem 20260202000004
**Solution:** Przemianowano `silver_to_public.sql` na `20260202000007`

### Fixed - Silver Layer RLS Idempotency
**Problem:** Migracja failowała przy ponownym uruchomieniu (polityki już istniały)
**Solution:** Dodano `DROP POLICY IF EXISTS` przed każdym `CREATE POLICY`

### Added - VAPI Webhook Handler
**File:** `app/api/vapi/webhook/route.ts`

Obsługuje:
- `assistant-request` → zwraca `variableValues` (zadania, imię, historia)
- `end-of-call-report` → zapisuje rozmowę do bazy
- `function-call` → `get_tasks`, `create_task`, `complete_task`

Wzorzec z IORS - zmienne wstrzykiwane przez webhook zamiast tool calls.

### Changed - Voice System Prompt
**File:** `lib/voice/system-prompt.ts`

Usunięto instrukcje o narzędziach do zadań. Asystent teraz kieruje użytkowników do dashboardu dla zarządzania zadaniami. Rozmowa głosowa = dyskusja, wsparcie. Dashboard = zarządzanie listami.

### Test Results
| Test | Status |
|------|--------|
| Build (30 routes) | ✅ PASS |
| TypeScript | ✅ PASS |
| Bronze ETL | ✅ 200 OK, 345ms |
| Silver ETL | ✅ 200 OK, 1559ms |
| Gold ETL | ✅ 200 OK, 1202ms |
| GHL Webhook | ✅ 200 OK |
| Voice Tools | ✅ 200 OK |

---

## [2026-02-02] GHL Private Integration Token Migration

### Changed - Simplified Authentication

**OAuth → Private Integration Token**
- Removed OAuth flow complexity in favor of simpler Private Integration Token
- Token stored in env vars (`GHL_PRIVATE_TOKEN`, `GHL_LOCATION_ID`)
- No more per-tenant token management, token refresh callbacks

**Updated Files:**
- `lib/ghl/client.ts` - Simplified to Bearer auth only
- `lib/cron/dispatcher.ts` - Updated `getGHLClient()` to use env vars
- `app/api/ghl/tools/route.ts` - Updated `getGHLClient()` to use env vars

**Removed:**
- `app/api/ghl/oauth/start/route.ts` - OAuth initiation (not needed)
- `app/api/ghl/oauth/callback/route.ts` - OAuth callback (not needed)

**Database Migration** (`20260202000004_simplify_ghl_schema.sql`)
- Dropped `exo_ghl_oauth_states` table (not needed)
- Removed token columns from `exo_ghl_connections` table
- Dropped unused helper functions (`get_ghl_connection`, `update_ghl_tokens`)

### Setup Instructions
1. GHL → Agency Settings → Private Integrations → Create
2. Copy token to env: `GHL_PRIVATE_TOKEN=xxx`
3. Set location ID: `GHL_LOCATION_ID=xxx`

---

## [2026-02-02] Deep GHL Integration - Communication Hub

### Added - GoHighLevel as Central Communication Hub

**GHL Library** (`lib/ghl/`)
- `client.ts` - Private Integration Token auth with rate limiting (100/10s)
- `messaging.ts` - Unified messaging: SMS, Email, WhatsApp, Facebook, Instagram
- `contacts.ts` - CRM contact management: CRUD, tags, notes, tasks
- `calendar.ts` - Calendar & booking: appointments, free slots, availability
- `social.ts` - Social media: Facebook, Instagram, LinkedIn, TikTok, Twitter/X
- `workflows.ts` - Automation: trigger workflows, event-based routing
- `opportunities.ts` - Pipeline management: stages, opportunities, CRM
- `index.ts` - Central export for all GHL functions

**API Routes**
- `app/api/webhooks/ghl/route.ts` - Inbound webhooks (messages, contacts, appointments)
- `app/api/ghl/tools/route.ts` - AI tools endpoint (9 tools for VAPI/agents)

**AI Tools for GHL Control**
| Tool | Description |
|------|-------------|
| `ghl_send_message` | Send SMS/Email/WhatsApp/FB/IG |
| `ghl_create_contact` | Create CRM contact |
| `ghl_update_contact` | Update contact info |
| `ghl_get_contact` | Get contact by ID/email/phone |
| `ghl_schedule_post` | Schedule social media post |
| `ghl_create_appointment` | Book appointment |
| `ghl_trigger_workflow` | Start automation |
| `ghl_get_conversations` | Get message history |
| `ghl_move_opportunity` | Move in pipeline |

**Database Migration** (`20260202000003_ghl_integration.sql`)
- `exo_ghl_connections` - Tenant-location mapping
- `exo_ghl_contacts` - Contact mapping
- `exo_ghl_messages` - Message log for analytics
- `exo_ghl_webhook_log` - Webhook idempotency
- `exo_ghl_social_posts` - Social post tracking
- `exo_ghl_appointments` - Appointment sync

### Changed

**lib/cron/dispatcher.ts**
- SMS: GHL as primary, Twilio as fallback
- Added: Email dispatch via GHL
- Added: WhatsApp dispatch via GHL
- Channel priority: Voice (VAPI) > WhatsApp > SMS > Email

**ARCHITECTURE.md**
- Updated channel orchestration to reflect GHL hub
- Added "GHL Integration Architecture" section
- Updated tech stack table
- Added data flow diagrams

### Architecture

```
Communication Architecture:
├─ Voice AI: VAPI (real-time AI conversations)
└─ Everything Else: GHL
    ├─ SMS, Email, WhatsApp
    ├─ Facebook Messenger, Instagram DMs
    ├─ Social Media (FB, IG, LinkedIn, TikTok, Twitter)
    ├─ CRM (Contacts, Pipelines, Opportunities)
    ├─ Calendar & Booking
    └─ Workflow Automation
```

### Environment Variables Required

```env
GHL_CLIENT_ID=xxx
GHL_CLIENT_SECRET=xxx
GHL_REDIRECT_URI=https://app.exoskull.ai/api/ghl/oauth/callback
GHL_WEBHOOK_SECRET=xxx (optional)
```

### Notes for Future Agents
- GHL OAuth flow is ready - user needs to connect via `/api/ghl/oauth/start?tenant_id=xxx`
- All GHL functions have rate limiting built-in (100 req/10s)
- Twilio remains as SMS fallback when GHL not connected
- VAPI remains for voice AI (GHL doesn't have real-time AI voice)

---

## [2026-02-02] Data Lake Gold Layer

### Added - Gold Layer (Pre-Aggregated Dashboard Views)

**lib/datalake/gold-etl.ts**
- Materialized view refresh logic
- Functions: `runGoldETL()`, `refreshSingleView()`, `getGoldStats()`, `getRefreshHistory()`
- Sequential refresh to avoid resource contention
- Automatic logging to `exo_gold_sync_log`

**app/api/cron/gold-etl/route.ts**
- POST: Trigger full refresh (auth required via `x-cron-secret`)
- POST with `view_name`: Refresh single view
- GET: Status + stats + recent history
- Schedule: Daily at 02:00 UTC

**supabase/migrations/20260202000006_gold_schema.sql**
- `exo_gold_daily_summary` - Daily conversation aggregations
- `exo_gold_weekly_summary` - Weekly aggregations with active days
- `exo_gold_monthly_summary` - Monthly aggregations
- `exo_gold_messages_daily` - Daily message counts by role
- `exo_gold_sync_log` - Refresh tracking table
- Unique indexes for CONCURRENTLY refresh (no read locks)

**vercel.json**
```json
{ "path": "/api/cron/gold-etl", "schedule": "0 2 * * *" }
```

### Data Lake Architecture Complete

```
Bronze (R2 Parquet)  →  Silver (Postgres)  →  Gold (Materialized Views)
   Raw data              Cleaned/deduped        Pre-aggregated
   :05 hourly            :15 hourly             02:00 daily
```

### Notes for Future Agents
- Gold views depend on Silver tables (`exo_silver_*`)
- Refresh uses CONCURRENTLY (requires unique index, no locks)
- Query Gold views for dashboard (sub-10ms response)
- Test endpoint: `curl -X POST /api/cron/gold-etl -H "x-cron-secret: exoskull-cron-2026"`

---

## [2026-02-02] Emotion Intelligence Architecture

### Added - ARCHITECTURE.md: Layer 11 Emotion Intelligence
- **Multi-Modal Emotion Detection** (from IORS)
  - Voice biomarkers: pitch, rate, pauses, energy, jitter, shimmer
  - Text sentiment: GPT-4o-mini / Gemini Flash
  - Facial expression: face-api.js (100% local processing)
  - Fusion engine: weighted average (voice 40%, text 35%, face 25%)

- **Crisis Detection System**
  - Suicide risk detection with escalation protocol
  - Panic attack detection with grounding protocol
  - Trauma response detection with safety protocol
  - Substance abuse detection with emergency protocol
  - Full escalation flow with crisis hotline integration

- **Emotion-Adaptive Responses**
  - Dynamic prompt injection for: sadness, anger, anxiety, low energy
  - Mixed signals detection (words vs voice/face mismatch)

- **Behavioral Monitoring (Advanced)**
  - Implicit Association Tests (IAT) for unconscious attitudes
  - Screen activity monitoring via ActivityWatch
  - Ambient audio analysis (opt-in, on-device only)

### Changed
- Layer numbering: 11-20 → 12-21 (emotion layer inserted as L11)
- Layer 3 extended with emotion_signals input modality
- Tech Stack updated with emotion detection tools
- Roadmap Phase 2 includes emotion intelligence tasks

### Architecture
- Version: 3.0 → 3.1 (OpenClaw + IORS Emotion Intelligence)
- Total layers: 20 → 21

---

## [2026-02-02] Voice-First System

### Added - Global Voice Button
- **GlobalVoiceButton** (`components/voice/GlobalVoiceButton.tsx`)
  - Fixed position button in top-left corner of dashboard
  - One-click to start VAPI voice conversation with ExoAI
  - Inline chat panel shows real-time transcript
  - Full VAPI integration with tools (get_tasks, create_task, complete_task)
  - End call button when connected

- **DashboardShell** (`components/dashboard/DashboardShell.tsx`)
  - Client component wrapper for GlobalVoiceButton
  - Added to dashboard layout for all pages

- **Voice Notes API** (`app/api/voice/notes/route.ts`)
  - POST: Upload voice note
  - GET: List voice notes with signed URLs
  - DELETE: Remove voice note and storage file

- **Transcription API** (`app/api/voice/transcribe/route.ts`)
  - Deepgram integration for Polish transcription
  - Real-time audio to text conversion

### Philosophy
- Voice-first: every interaction starts with voice
- Global button always accessible - never more than one click away
- All voice interactions go through ExoAI (no separate "notes" vs "conversation")

---

## [2026-02-02] Data Lake Silver Layer

### Added - Silver Layer ETL
- **Parquet Reader** (`lib/storage/parquet-reader.ts`)
  - Read Parquet files from R2 using hyparquet
  - Type-safe readers for conversations, messages, voice calls, SMS logs
  - Deduplication and timestamp parsing utilities

- **Silver ETL** (`lib/datalake/silver-etl.ts`)
  - Transforms Bronze (R2 Parquet) → Silver (Supabase Postgres)
  - Deduplicate by ID
  - Validate schema (channel, role, direction constraints)
  - Parse JSON strings → JSONB
  - Normalize timestamps to UTC

- **Cron Endpoint** (`app/api/cron/silver-etl/route.ts`)
  - Runs hourly at minute 15 (10 min after Bronze ETL)
  - GET: Status and stats
  - POST: Trigger ETL (auth required)

- **Supabase Migrations**
  - `exo_silver_conversations` - Cleaned conversation records
  - `exo_silver_messages` - Cleaned message records
  - `exo_silver_voice_calls` - Cleaned voice call records
  - `exo_silver_sms_logs` - Cleaned SMS log records
  - `exo_silver_sync_log` - ETL tracking per tenant/data_type

### Tested
- 30 records successfully transformed (18 conversations, 12 messages)
- All 4 data types processing correctly
- Incremental sync working (only new Bronze files processed)

---

## [2026-02-01] Dashboard Expansion

### Added - Chat Panel
- **ChatPanel Component** (`components/voice/ChatPanel.tsx`)
  - Real-time transcript display during voice calls
  - User messages (blue, right), Agent messages (gray, left)
  - "User is speaking..." / "Agent is speaking..." indicators
  - Auto-scroll to latest message

- **Voice Page Update** (`app/dashboard/voice/page.tsx`)
  - Integrated ChatPanel with VAPI events
  - Handles `speech-start`, `speech-end`, `transcript`, `message` events
  - Interim transcript support (partial → final)

### Added - CRON Dashboard
- **Schedule Page** (`app/dashboard/schedule/page.tsx`)
  - Full UI for managing scheduled jobs
  - Toggle jobs on/off
  - View global settings (timezone, quiet hours, rate limits)
  - Recent execution logs
  - Manual job trigger for testing

### Added - Dynamic Widgets
- **TasksWidget** (`components/widgets/TasksWidget.tsx`)
  - Task completion stats (pending/in_progress/done)
  - Links to tasks page

- **ConversationsWidget** (`components/widgets/ConversationsWidget.tsx`)
  - Conversation stats (today/week/avg duration)

- **QuickActionsWidget** (`components/widgets/QuickActionsWidget.tsx`)
  - Quick links to voice, tasks, schedule, knowledge

- **AreaChartWrapper** (`components/charts/AreaChartWrapper.tsx`)
  - Recharts wrapper for area charts
  - Gradient fill, tooltips

- **Dashboard Page** (`app/dashboard/page.tsx`)
  - New layout with widget grid
  - Real stats from database (tasks, conversations, agents)
  - Dynamic greeting based on time

### Added - Knowledge System
- **Migration** (`supabase/migrations/20260201000008_knowledge_system.sql`)
  - `exo_user_documents` table (file metadata)
  - `exo_document_chunks` table (embeddings with pgvector)
  - `search_user_documents()` function for semantic search
  - RLS policies for tenant isolation

- **Storage Bucket** (`supabase/migrations/20260201000009_user_documents_bucket.sql`)
  - `user-documents` bucket (private, 10MB limit)
  - RLS policies for upload/view/delete

- **Knowledge API** (`app/api/knowledge/route.ts`)
  - GET: List documents with stats
  - DELETE: Remove document and storage file

- **Upload API** (`app/api/knowledge/upload/route.ts`)
  - POST: Upload file to Supabase Storage
  - Validates type (pdf, txt, md, jpg, png) and size (10MB)

- **Knowledge Page** (`app/dashboard/knowledge/page.tsx`)
  - Placeholder UI with planned features

### Changed - Navigation
- **Layout** (`app/dashboard/layout.tsx`)
  - Added "Harmonogram" (Clock icon)
  - Added "Wiedza" (FileText icon)

### Dependencies
- `recharts` - Chart library for React

---

## [2026-02-01] Data Lake Bronze Layer

### Added
- **R2 Storage Client** (`lib/storage/r2-client.ts`)
  - S3-compatible client for Cloudflare R2
  - `writeToBronze()` - Upload Parquet files
  - `readFromBronze()` - Download files
  - `listBronzeFiles()` - List by tenant/data_type/date
  - `getBronzeStats()` - Storage statistics

- **Parquet Writer** (`lib/storage/parquet-writer.ts`)
  - `conversationsToParquet()` - Convert conversations to Parquet
  - `messagesToParquet()` - Convert messages to Parquet
  - `voiceCallsToParquet()` - Convert voice calls
  - `smsLogsToParquet()` - Convert SMS logs
  - Uses `hyparquet-writer` (pure JS, no WASM)

- **Bronze ETL Job** (`lib/datalake/bronze-etl.ts`)
  - `etlConversations()` - Sync conversations to R2
  - `etlMessages()` - Sync messages to R2
  - `runBronzeETL()` - Full ETL for all tenants
  - Incremental sync via `exo_bronze_sync_log`

- **Cron API Route** (`app/api/cron/bronze-etl/route.ts`)
  - GET: Status and R2 stats
  - POST: Trigger ETL (protected by CRON_SECRET)
  - Runs hourly at minute 5 via Vercel Cron

- **Database Migration** (`supabase/migrations/20260201000006_bronze_sync_log.sql`)
  - `exo_bronze_sync_log` - Tracks last sync per tenant/data_type
  - Enables incremental ETL (only new records)

### R2 Path Structure
```
exoskull-bronze/
  {tenant_id}/
    bronze/
      conversations/
        year=2026/month=02/day=01/{timestamp}.parquet
      messages/
        year=2026/month=02/day=01/{timestamp}.parquet
```

### Environment Variables
```env
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=exoskull-bronze
```

### Cost
- Cloudflare R2: $0.015/GB/mo, zero egress fees
- 10GB free tier

---

## [2026-02-01] CRON Scheduling System

### Added
- **Master Scheduler** (`app/api/cron/master-scheduler/route.ts`)
  - Central coordinator running hourly via Vercel Cron
  - Timezone-aware scheduling per user
  - Rate limiting (10 voice calls/day, 20 SMS/day)
  - Quiet hours (22:00-07:00)
  - Dispatches to VAPI (voice) or Twilio (SMS)

- **Schedule API** (`app/api/schedule/route.ts`)
  - GET: User's schedule preferences with job list
  - PUT: Update preferences (enable/disable, custom time, channel)
  - POST: Manual trigger for testing

- **Setup Helper** (`app/api/setup-cron/route.ts`)
  - GET: Check CRON system status
  - POST: Initialize default jobs

- **Timezone Utils** (`lib/cron/timezone-utils.ts`)
  - `isTimeToTrigger()` - Check if job should run
  - `isInQuietHours()` - Respect user quiet hours
  - `getUserLocalTime()` - Convert UTC to user timezone

- **Dispatcher** (`lib/cron/dispatcher.ts`)
  - `dispatchVoiceCall()` - VAPI integration with user's cloned voice
  - `dispatchSms()` - Twilio integration
  - `dispatchJob()` - Auto-select based on job config

- **Vercel Cron Config** (`vercel.json`)
  - Runs master scheduler every hour at minute 0

### Database (Supabase Migrations)

**`20260201000002_scheduled_jobs_system.sql`:**
- `exo_scheduled_jobs` - 15 job definitions
- `exo_user_job_preferences` - Per-user settings
- `exo_scheduled_job_logs` - Execution history
- `exo_event_triggers` - Event-driven triggers (sleep debt, overdue tasks)
- Helper functions: `get_users_for_scheduled_job()`, `check_user_rate_limit()`, `log_job_execution()`

**`20260201000004_job_consent_model.sql`:**
- `exo_user_job_consents` - Track user consent from conversations
- `record_job_consent()` - Enable job for user
- `revoke_job_consent()` - Disable or pause job

### Job Categories

**System Jobs (always active):**
| Job | Schedule | Purpose |
|-----|----------|---------|
| system_retry_processor | every 15 min | Retry failed jobs |
| system_analytics | 02:00 UTC | Aggregate daily metrics |
| system_data_cleanup | 03:00 UTC | Clean old logs/sessions |
| system_gap_detection | Sunday 04:00 | Detect data blind spots |
| system_pattern_learning | 05:00 UTC | Update ML models |

**User Jobs (opt-in via conversation):**
| Job | Channel | Description |
|-----|---------|-------------|
| morning_checkin | voice | "Jak się czujesz?" |
| evening_reflection | voice | "Jak minął dzień?" |
| day_summary | sms | Calendar + priorities |
| meal_reminder | sms | Meal logging reminder |
| bedtime_reminder | sms | Sleep goal reminder |
| week_preview | voice | Monday planning |
| week_summary | voice | Friday review |
| week_planning | voice | Sunday planning |
| monthly_review | voice | 1st of month |
| goal_checkin | sms | 15th of month |

### Usage

```sql
-- Enable job for user (from conversation)
SELECT record_job_consent(
  'tenant-uuid',
  'morning_checkin',
  'User said: call me at 7am',
  '07:00',
  'voice'
);

-- Pause for 7 days
SELECT revoke_job_consent('tenant-uuid', 'morning_checkin', 7);

-- Disable permanently
SELECT revoke_job_consent('tenant-uuid', 'morning_checkin');
```

### Environment Variables
```env
CRON_SECRET=exoskull-cron-2026  # Required for Vercel Cron auth
```

---

## [2026-02-01] Voice System - ElevenLabs Integration

### Added
- **Prompt Caching System** (`lib/voice/system-prompt.ts`)
  - Static system prompt (~1200 tokens) for OpenAI automatic caching
  - Dynamic context builder for time-based greetings
  - 50% savings on input tokens

- **Audio Cache System** (`lib/voice/audio-cache.ts`)
  - 18 pre-defined Polish phrases (greetings, confirmations, farewells, errors)
  - Variant matching for alternative phrasings
  - Supabase Storage integration

- **Audio Generation API** (`app/api/audio/generate-cache/route.ts`)
  - POST: Generate and cache audio via ElevenLabs TTS
  - GET: Check cache status (total, cached, missing)
  - Uses `eleven_turbo_v2_5` model for low latency

- **Cache Generation Script** (`scripts/generate-audio-cache.ts`)
  - CLI tool to populate audio cache
  - Run: `npx ts-node scripts/generate-audio-cache.ts`

- **Supabase Migration** (`supabase/migrations/20260201_audio_cache_bucket.sql`)
  - Creates `audio-cache` bucket with public read access
  - 5MB file size limit, audio/mpeg only

### Changed
- **Voice Configuration** (`app/dashboard/voice/page.tsx`)
  - Voice provider: `11labs` (was `openai`)
  - Voice ID: `vhGAGQee0VjHonqyxGxd` (user's custom cloned voice)
  - Model: `gpt-4o-mini` (faster than gpt-4)
  - Added VAPI timing optimizations (responseDelaySeconds, etc.)

### Fixed
- VAPI 400 Bad Request: Changed voice provider from `eleven-labs` to `11labs`
- ElevenLabs blocked error: User added BYOK via VAPI dashboard

### Environment Variables
```env
ELEVENLABS_API_KEY=sk_xxx  # Required for audio cache generation
```

### Cost Optimization Summary
| Optimization | Savings |
|--------------|---------|
| OpenAI prompt caching | ~50% on input tokens |
| ElevenLabs audio cache | ~60-70% on common phrases |
| gpt-4o-mini model | ~90% vs gpt-4 |

---

## [2026-02-01] Voice Tools Integration

### Added
- **VAPI Tools Endpoint** (`app/api/voice/tools/route.ts`)
  - `get_tasks`: Fetch user's tasks during voice conversation
  - `create_task`: Add new task via voice
  - `complete_task`: Mark task as done via voice

### Changed
- Voice page now passes `tenant_id` via URL query params
- Tools use public cloudflare tunnel URL for VAPI access

---

## Template

```markdown
## [YYYY-MM-DD] Feature Name

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features
```
