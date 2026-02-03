# ExoSkull Changelog

All notable changes to ExoSkull are documented here.

---

## 2026-02-03

### MVP Complete - GOTCHA + ATLAS (6 Phases)

**FAZA 1: Voice Pipeline + IORS Rebranding**
- Replaced all "Zygfryd" references with dynamic IORS naming from DB
- Removed all VAPI code (6 files deleted, package deps removed, CSP cleaned)
- Created new VoiceInterface using Web Speech API (STT) + ElevenLabs (TTS)
- Created web-speech.ts wrapper for browser-native STT
- Created /api/voice/chat route (Claude + IORS_TOOLS + ElevenLabs)
- Added assistant_name column to exo_tenants (default 'IORS')
- Updated voice.yaml config

**FAZA 2: Unified Chat + Voice**
- Created /dashboard/chat with text + voice toggle
- Created /api/chat/send using same IORS_TOOLS pipeline
- Updated NAV_ITEMS (added Chat, Zdrowie; removed Agenci, Voice)

**FAZA 3: Onboarding Form (15 questions)**
- Created OnboardingForm.tsx - 15 step form with progress bar
- Questions: name, goals, communication style, check-in times, devices, autonomy, language, timezone
- Created /api/onboarding/save-profile route
- Data maps to exo_tenants + discovery_data JSONB

**FAZA 4: IORS App Builder**
- Created Mod system: exo_mod_registry, exo_tenant_mods, exo_mod_data tables
- Inserted 12 template Mods (sleep-tracker, mood-tracker, habit-tracker, etc.)
- Created proactive-engine.ts: auto-installs Mods based on onboarding goals
- Added 3 IORS_TOOLS: log_mod_data, get_mod_data, install_mod
- Created DynamicModWidget - generic renderer based on Mod config
- Created /api/mods/* routes (list, install, CRUD data)

**FAZA 5: Emotion Recognition + Adaptive UI**
- Created text-analyzer.ts (HuggingFace free API + Polish keyword fallback)
- Created 5 mood-based CSS palettes (positive, calm, stressed, low, focused)
- Created AdaptiveThemeProvider React context
- Created exo_emotion_log table with RLS

**FAZA 6: Landing Page + UX Polish + Cleanup**
- Created landing page (Hero, Features, How it works, CTA) - dark theme
- Redesigned login page to dark theme matching landing
- Dashboard: personalized greeting with user name, installed Mods section
- Added mobile bottom tab navigation (5 tabs)
- Deleted /dashboard/agents and /dashboard/marketplace (not ready)
- Fixed branding: Exoskull -> ExoSkull throughout

**Files changed:** 40+ files created/modified
**Build status:** Clean (only pre-existing gap-detector.ts TS7015 warning)

---

## 2026-02-02

### GOTCHA Framework Implementation

**Cel:** Stworzenie struktury GOTCHA dla ExoSkull zgodnie z architektura.

**Nowe katalogi i pliki:**

**Goals Layer (`goals/`):**
- `manifest.md` - Index wszystkich workflow
- `daily-checkin.md` - Proaktywne check-iny z uzytkownikiem
- `voice-conversation.md` - Glosowa interakcja (glowny interfejs)
- `task-management.md` - Zarzadzanie zadaniami
- `knowledge-capture.md` - Automatyczne wychwytywanie wiedzy

**Tools Layer (`tools/`):**
- `manifest.md` - Master list wszystkich narzedziw z lib/ (~50 modulow)

**Args Layer (`args/`):**
- `models.yaml` - Multi-model AI routing config (Tier 1-4)
- `rigs.yaml` - External API integrations (health, productivity, finance, smart_home)
- `mods.yaml` - User-facing abilities (sleep-tracker, task-manager, mood-tracker, etc.)

**Hardprompts Layer (`hardprompts/`):**
- `discovery-interview.md` - Discovery conversation template
- `gap-detection.md` - Blind spots detection template
- `intervention-design.md` - Intervention design template

**Context Layer (`context/`):**
- `tone.md` - Jak ExoSkull mowi (PSYCODE, style matrix, voice rules)
- `user-archetypes.md` - 7 archetypow uzytkownikow dla gap detection

**Kluczowe elementy:**
- Model tiers: Gemini Flash (T1) → Claude Haiku (T2) → Kimi K2.5 (T3) → Claude Opus (T4)
- Mods: sleep-tracker, energy-monitor, task-manager, mood-tracker, habit-tracker + Quests
- Rigs: Google (unified), Oura, Fitbit, Microsoft 365, Notion, Todoist, Plaid
- User archetypes: Achiever, Overwhelmed, Searcher, Optimizer, Caregiver, Avoider, Perfectionist

**Jak uzywac GOTCHA:**
1. Check `goals/manifest.md` przed rozpoczeciem workflow
2. Check `tools/manifest.md` przed pisaniem nowego kodu
3. Read `args/` dla konfiguracji (models, rigs, mods)
4. Use `hardprompts/` dla szablonow promptow
5. Reference `context/` dla domain knowledge

---

### Earlier 2026-02-02

### Unified Google Integration

**Cel:** Jeden OAuth login → dostęp do wszystkich usług Google

**Nowy unified 'google' rig:**
- Google Fit (steps, sleep, heart rate, calories)
- Gmail (emails, unread count, send)
- Calendar (events, free/busy)
- Drive (files)
- Tasks
- Contacts
- YouTube (channel, videos)
- Photos

**Comprehensive OAuth scopes** w `lib/rigs/oauth.ts`:
- Fitness API (activity, sleep, heart_rate, body, nutrition, location)
- Gmail API (readonly, send, compose, labels)
- Calendar API (full access)
- Drive API (readonly)
- Tasks API
- People API (contacts)
- YouTube Data API
- Photos Library API

**Nowe pliki:**
- `lib/rigs/google/client.ts` - unified GoogleClient
- `components/widgets/IntegrationsWidget.tsx` - UI do łączenia

**Zmodyfikowane:**
- `lib/rigs/oauth.ts` - GOOGLE_COMPREHENSIVE_SCOPES
- `lib/rigs/types.ts` - dodany 'google' slug
- `lib/rigs/index.ts` - google rig definition
- `app/api/rigs/[slug]/sync/route.ts` - google case
- `app/dashboard/page.tsx` - IntegrationsWidget

**Jak użyć:**
1. Dashboard → "Połącz" przy Google
2. Autoryzacja Google (jeden consent dla wszystkich usług)
3. Dane dostępne przez `/api/rigs/google/sync`

---

### Fix Task Creation + Custom Schedules Dashboard

**Problem 1: Zadania nie mogły być tworzone**
- Root cause: Brak rekordu exo_tenants dla użytkownika (FK constraint)
- Fix: Auto-tworzenie tenant przy pierwszym użyciu dashboard

**Problem 2: Brak możliwości tworzenia własnych harmonogramów**
- Dashboard tylko włączał/wyłączał predefiniowane joby
- Brak UI do tworzenia custom cronów

**Rozwiązanie - pełna funkcja custom schedules:**

**Nowa tabela:** `exo_custom_scheduled_jobs`
- Użytkownik tworzy własne harmonogramy
- Częstotliwość: codziennie / co tydzień (wybór dni) / co miesiąc (dzień)
- Kanały: SMS lub połączenie głosowe
- Message template dla custom wiadomości

**Nowe API:** `/api/schedule/custom`
- POST: tworzenie harmonogramu
- GET: lista harmonogramów użytkownika
- PUT: edycja
- DELETE: usuwanie

**Nowy UI:** Dashboard /dashboard/schedule
- Przycisk "Nowy harmonogram"
- Formularz z polami: nazwa, opis, częstotliwość, godzina, dni, kanał, wiadomość
- Lista harmonogramów z edit/delete
- Toggle on/off

**Master scheduler:** Rozszerzony o obsługę custom jobs
- Pobiera custom jobs z bazy
- Sprawdza schedule_type, days_of_week, day_of_month
- Dispatchuje przez GHL/Twilio/VAPI

**Pliki:**
- `app/dashboard/tasks/page.tsx` - ensureTenantExists()
- `app/dashboard/schedule/page.tsx` - nowy UI
- `app/api/schedule/custom/route.ts` - nowe API
- `app/api/cron/master-scheduler/route.ts` - custom jobs dispatch
- `migrations/20260202000020_custom_scheduled_jobs.sql`

**Commit:** 1aa42ff

---

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
