# ExoSkull App - Changelog

All notable changes to this project.

---

## [2026-02-02] Deep GHL Integration - Communication Hub

### Added - GoHighLevel as Central Communication Hub

**GHL Library** (`lib/ghl/`)
- `client.ts` - OAuth 2.0 client with automatic token refresh, rate limiting (100/10s)
- `messaging.ts` - Unified messaging: SMS, Email, WhatsApp, Facebook, Instagram
- `contacts.ts` - CRM contact management: CRUD, tags, notes, tasks
- `calendar.ts` - Calendar & booking: appointments, free slots, availability
- `social.ts` - Social media: Facebook, Instagram, LinkedIn, TikTok, Twitter/X
- `workflows.ts` - Automation: trigger workflows, event-based routing
- `opportunities.ts` - Pipeline management: stages, opportunities, CRM
- `index.ts` - Central export for all GHL functions

**API Routes**
- `app/api/ghl/oauth/start/route.ts` - Initiate OAuth flow
- `app/api/ghl/oauth/callback/route.ts` - Handle OAuth callback, store tokens
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
- `exo_ghl_oauth_states` - OAuth security
- `exo_ghl_connections` - Tenant connections with encrypted tokens
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
