# ExoSkull Changelog

All notable changes to ExoSkull are documented here.

---

## 2026-02-02

### Voice Pipeline - Twilio + VAPI + Custom

**VAPI Configuration (działa):**
- Numer: +48 732 143 210 (backup)
- Assistant: `72577c85-81d4-47b4-99b5-0ca8b6ed7a63` (XOSKULL)
- LLM: Claude Opus 4.5 (`claude-opus-4-5-20251101`)
- Voice: ElevenLabs `eleven_turbo_v2_5`
- Transcriber: Deepgram nova-2 (język: pl)
- firstMessage: "Cześć, tu Zygfryd. W czym mogę pomóc?"

**Custom Pipeline (bez VAPI) - deployed:**
- Numer: +48 732 144 112
- Endpoint: `/functions/v1/exoskull-voice`
- Flow: Twilio <Gather> → Claude Opus 4.5 → <Say> TTS
- Plik: `IORS_Master_Project/supabase/functions/exoskull-voice/index.ts`

**Naprawione problemy:**
1. Brak assistant na numerze → przypisano
2. Custom LLM (Moltbot/n8n) offline → zmiana na OpenAI → Anthropic
3. Transcriber multi-language → błędny język → wymuszono polski (Deepgram)
4. Voice Cartesia → zmiana na ElevenLabs

**Numery Twilio w VAPI:**
- +48732143210 - VAPI (główny, assistant przypisany)
- +48732144112 - Custom pipeline (deployed)
- +48732071977, +48732070809, +48732071757 - zapasowe

---

### Conversation-First Onboarding System

**Philosophy:** Onboarding przez naturalną rozmowę głosową, NIE formularze.

**New Files:**
- `app/onboarding/page.tsx` - Main onboarding page (voice or chat)
- `app/onboarding/layout.tsx` - Clean layout without sidebar
- `components/onboarding/DiscoveryVoice.tsx` - VAPI voice discovery
- `components/onboarding/DiscoveryChat.tsx` - Text chat fallback
- `lib/onboarding/discovery-prompt.ts` - Discovery system prompt (~60 topics)
- `lib/onboarding/types.ts` - TypeScript interfaces

**API Routes:**
- `/api/onboarding` - GET status
- `/api/onboarding/chat` - POST chat message, GET AI response
- `/api/onboarding/extract` - POST extract profile from conversation (Gemini Flash)
- `/api/onboarding/complete` - POST mark onboarding as completed
- `/api/onboarding/save-profile` - POST save profile (VAPI tool callback)

**Database Migration (20260202000021):**
- Added to `exo_tenants`:
  - `onboarding_status` (pending/in_progress/completed)
  - `onboarding_step`, `onboarding_completed_at`
  - `preferred_name`, `primary_goal`, `secondary_goals`, `conditions`
  - `communication_style`, `preferred_channel`
  - `morning_checkin_time`, `evening_checkin_time`, `checkin_enabled`
  - `voice_pin_hash`, `discovery_data`
- New tables: `exo_onboarding_sessions`, `exo_discovery_extractions`

**Middleware Update:**
- Redirect to `/onboarding` if `onboarding_status != 'completed'` when accessing `/dashboard`

**Discovery Prompt Features:**
- ~60 topics to naturally discover about user
- Projective techniques ("Imagine your ideal day...")
- Natural conversation style, NOT interrogation
- Auto-extraction of profile data after conversation

**User Journey:**
1. Signup → `/onboarding`
2. Choose: "Porozmawiajmy głosowo" or "Wolę pisać"
3. 10-15 minute natural conversation
4. AI extracts profile data (Gemini Flash)
5. Redirect to `/dashboard`

---

### ARCHITECTURE.md - Rozszerzenie filozofii

**Nowe podsekcje w CORE PHILOSOPHY:**
- **Główny Cel Funkcjonowania**: Pozytywnie zaskakiwać użytkownika przez zdejmowanie obowiązków
- **Hierarchia Wartości**: LUDZIE > PIENIĄDZE (ale elastyczne)
- **Granica Etyczna**: Nie wspiera świadomego krzywdzenia siebie/innych
- **Odpowiedzialność**: ExoSkull ZAWSZE odpowiedzialny za dobrostan i sukces

**Kluczowa zasada:** ExoSkull wspiera użytkownika we WSZYSTKIM (zdrowie, rozwój, majątek), z jednym wyjątkiem - nie wspiera krzywdzenia.

---

### ARCHITECTURE.md - Wellbeing First Philosophy

**Philosophy Change:**
- Added new section "CORE PHILOSOPHY: WELLBEING FIRST" after Vision Statement
- ExoSkull's primary purpose is now explicitly USER WELLBEING, not productivity
- Clear priority hierarchy: #1 Mental wellbeing, #2 Everything else as tools

**What ExoSkull is NOT (now explicit):**
- NOT a task manager
- NOT a productivity app
- NOT a system for "pilnowanie" (surveillance)
- NOT a rigid framework

**What ExoSkull IS:**
- Guardian of user's wellbeing
- Life partner (not boss, not coach)
- Elastic system adapting to user
- Mirror showing what user wants to see

**Layer Updates:**
- Layer 7 (Discovery): Now starts with wellbeing questions, not goals/tasks
- Layer 8 (Gap Detection): Philosophy changed to wellbeing focus, domains reordered
- Layer 9 (Metrics): Success metrics now tied to wellbeing, not external productivity standards

**Impact:**
- All future features must prioritize user wellbeing
- Gap detection weights wellbeing domains 3x higher
- Discovery conversations ask "how do you feel?" before "what do you want?"

---

### Knowledge Architecture (Teoria Tyrolki)

**New Features:**
- Added complete Knowledge System based on "Teoria Tyrolki" philosophy
- Formula: `Self-Image = (Ja × Nie-Ja) + Main Objective = (Experience × Research) + Objectives`

**Database (6 migrations applied to remote Supabase):**
- `user_loops` - Areas/domains of life (Health, Work, Relationships, etc.)
- `user_campaigns` - Major initiatives linked to objectives
- `user_quests` - Projects grouping multiple Ops
- `user_ops` - Individual tasks/missions
- `user_notes` - Universal notes (text, image, audio, video, url, social, message, document, code)
- `user_memory_highlights` - Curated facts about user
- `user_mits` - Most Important Things (objectives 1-3)

**API Endpoints:**
- `/api/knowledge/loops` - CRUD for life areas
- `/api/knowledge/campaigns` - CRUD for campaigns
- `/api/knowledge/quests` - CRUD for quests
- `/api/knowledge/ops` - CRUD for ops/tasks
- `/api/knowledge/notes` - CRUD for notes
- `/api/knowledge/tyrolka` - Context API (returns synthesized self-image)
- `/api/knowledge/upload` - File upload handler

**Helper Functions:**
- `create_default_loops()` - Initialize default areas for new users
- `get_tyrolka_context()` - Return full Tyrolka context for voice/AI

**Deferred:**
- Full Tyrolka voice integration (user requested delay)
- Note ingestion multi-format parser
- AI processing (embeddings, auto-tagging)
- Research vs Experience classifier

### PSYCODE + PULSE + Autonomy Grants

**Completed in earlier session:**
- `PSYCODE.md` - Agent personality definition
- `/api/pulse` - Batched periodic checks (health, tasks, calendar, social, finance)
- `/api/autonomy` - CRUD for pre-approved actions
- `/api/autonomy/check` - Action permission checking

---

## 2026-02-02 (Earlier)

### Multi-Model AI Router
- 4-tier routing: Gemini Flash → Claude Haiku → Kimi K2.5 → Claude Opus
- Cost optimization with circuit breaker
- Usage tracking in database

### Google Tasks Integration
- Full Google Tasks API in Workspace Rig
- Task Manager Mod with unified view (Google + Todoist + Notion + ExoSkull)

### GHL Integration
- Complete GoHighLevel integration as communication hub
- SMS, Email, WhatsApp, Messenger, Instagram via GHL
- OAuth flow, webhooks, AI tools

### Gold Layer (Data Lake)
- Materialized views for aggregated insights
- daily_health_summary, weekly_productivity, monthly_financial

---

## 2026-02-01

### Initial Implementation
- CRON scheduling system with consent model
- Data Lake Bronze layer (Cloudflare R2 + Parquet)
- Dashboard widgets (Tasks, Conversations, Quick Actions)
- Voice integration with VAPI + ElevenLabs
- Audio caching system

See SESSION_LOG.md for detailed task history.
