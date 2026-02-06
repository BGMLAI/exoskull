# IORS — Plan Wdrożenia

> **Wersja:** 1.0
> **Data:** 2026-02-06
> **Stack:** Next.js 14, TypeScript 5, Supabase, Vercel, Cloudflare R2

---

## 1. Obecny Stan (Baseline)

### Co mamy (fundament — ZACHOWAĆ)

| Komponent | Status | Pliki kluczowe |
|---|---|---|
| Gateway 12 kanałów | ✅ Live | `lib/gateway/`, adaptery per channel |
| processUserMessage() + 28 tools | ✅ Live | `lib/conversation-handler.ts` |
| Mod system (JSONB, IModExecutor) | ✅ Live | `lib/mods/`, `exo_mod_data`, `exo_mod_registry` |
| Skill generator pipeline | ✅ Live | `lib/skills/` |
| Async task queue | ✅ Live | `exo_async_tasks`, `lib/async-tasks/` |
| Data lake (Bronze/Silver/Gold) | ✅ Live | R2 + Postgres + Materialized Views |
| Auth + multi-tenant RLS | ✅ Live | Supabase Auth, middleware |
| AI model router (4-tier) | ✅ Live | `lib/ai/model-router.ts` |
| Emotional intelligence | ✅ Live | Crisis detection, sentiment, style matrix |
| Voice pipeline | ✅ Live | Twilio + ElevenLabs + Claude |
| LOOPCODE | ✅ Live | System prompts |
| 25 CRON jobs | ✅ Live | `api/cron/` |

### Co usuwamy

| Komponent | Powód | Strategia |
|---|---|---|
| 20 hardcoded dashboard pages | Zastąpione Canvas | Delete pages, keep shared components |
| Predictive health engine (4 modele) | Hardcoded → generic mods | Delete, recreate as optional mods |
| ~10 domain-specific CRONs | Zastąpione Pętlą | Refactor into generic loop system |
| Hardcoded onboarding (10-exchange) | Continuous discovery loop | Refactor onboarding-handler.ts |
| Subscription billing tiers | Pay-per-usage | Replace Stripe subscription with metered |
| **14+ custom OAuth rigs** | **Composio** | **Replace with Composio SDK (400+ apps)** |
| Knowledge page (Tyrolka) | Usunięta | Wiedza przez rozmowę + mody |

### Co dodajemy (nowe)

| Komponent | Priority | Faza |
|---|---|---|
| **Composio integration (400+ apps)** | **P0** | **Phase 1** |
| **Lead management (pre-birth memory)** | **P0** | **Phase 1** |
| **Emergency contact verification** | **P0** | **Phase 1** |
| Canvas widget system | P0 | Phase 1 |
| Pętla 15-min (event-driven + adaptive) | P0 | Phase 1 |
| Autonomy permissions system | P0 | Phase 1 |
| Personality parameters (LOOPCODE) | P0 | Phase 1 |
| IORS birth flow (continuous discovery) | P0 | Phase 1 |
| **Emotional intelligence (Tau matrix)** | **P0** | **Phase 1** |
| **Email sending (Composio send-as)** | **P1** | **Phase 1** |
| Feedback capture (👍/👎 + implicit) | P1 | Phase 1 |
| ValidationGate middleware | P1 | Phase 1 |
| Pay-per-usage billing (Stripe metered) | P1 | Phase 1 |
| Mod composition (natural language) | P1 | Phase 2 |
| **Browser actions (Playwright sandbox)** | **P1** | **Phase 2** |
| **Affiliate system (referral tracking)** | **P1** | **Phase 2** |
| Instance hierarchy (IORS + Bizzon = same product) | P2 | Phase 2 |
| Async Q&A ("let me think") | P2 | Phase 2 |
| Data Abstraction Layer | P2 | Phase 2 |
| Marketplace v1 (open licensing) | P2 | Phase 2 |
| Gamification (XP, phases, transparency) | P2 | Phase 3 |
| BYOK billing | P2 | Phase 3 |
| Voice biomarkers (Hume AI) | P3 | Phase 3 |
| Digital phenotyping | P3 | Phase 4 |
| Camera emotion recognition | P3 | Phase 4 |
| Cross-user IORS communication | P3 | Phase 3 |
| Federated learning prep | P3 | Phase 4 |

---

## 2. Fazy Wdrożenia

### Phase 1: Core IORS (4-6 tygodni)

**Cel:** Zamienić ExoSkull z "chatbota z dashboardem" na "żywą instancję IORS".

#### Sprint 1 (tydzień 1-2): Fundament

**1.1 IORS Birth Flow** (zastąpi hardcoded onboarding)

Obecny `onboarding-handler.ts` → refactor na continuous discovery:

```
// NOWY FLOW:
1. User rejestruje się → creates tenant
2. "Narodziny IORS" — nie onboarding, ale pierwsze spotkanie
3. Wybór podstawowych preferencji:
   - Imię IORS (opcjonalnie — domyślnie "IORS")
   - Preferowany kanał (voice/text/WhatsApp/etc.)
   - Język
4. Pierwsza rozmowa — otwarta, bez structured discovery
   "Cześć, jestem [imię]. Opowiedz mi o sobie — co jest dla ciebie ważne?"
5. IORS organicznie poznaje usera — NIE wymuszony 10-exchange flow
6. Brak autoInstallMods — IORS proponuje mody KIEDY widzi potrzebę
```

Pliki do zmiany:
- `lib/gateway/onboarding-handler.ts` → refactor
- Nowy: `lib/iors/birth-flow.ts`
- DB: `exo_tenants` → add `iors_name`, `iors_personality JSONB`, `birth_date`

**1.2 Personality Parameters**

```typescript
interface IORSPersonality {
  name: string;                    // "IORS", "Aria", "Max", etc.
  voice_id: string;                // ElevenLabs voice ID
  language: string;                // 'pl', 'en', 'auto'
  style: {
    formality: number;             // 0-100 (casual → formal)
    humor: number;                 // 0-100 (serious → funny)
    directness: number;            // 0-100 (gentle → blunt)
    empathy: number;               // 0-100 (factual → emotional)
    detail_level: number;          // 0-100 (brief → verbose)
  };
  proactivity: number;             // 0-100 (passive → autonomous)
  communication_hours: {
    start: string;                 // "07:00"
    end: string;                   // "23:00"
  };
}
```

Wpływ na system prompt: personality parameters → dynamicznie generowany fragment system promptu.

Pliki do zmiany:
- `lib/conversation-handler.ts` → inject personality into system prompt
- Nowy: `lib/iors/personality.ts`
- DB: `exo_tenants.iors_personality JSONB`
- UI: `/settings` → sekcja "Twój IORS" z suwakami

**1.3 Composio Integration (od dnia 1)**

Zastąpienie 14+ custom OAuth rigs jednym SDK:

```typescript
// lib/integrations/composio-adapter.ts
import { Composio } from 'composio-core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// User łączy konto:
const authUrl = await composio.getAuthUrl('gmail', { userId: tenantId });
// → redirect user → callback → tokens managed by Composio

// IORS wysyła email w imieniu usera:
await composio.executeAction('gmail', 'send_email', {
  userId: tenantId,
  to: 'doctor@clinic.com',
  subject: 'Rezerwacja wizyty',
  body: 'Chciałbym zarezerwować wizytę...'
});
```

Pliki:
- Nowy: `lib/integrations/composio-adapter.ts`
- Delete: `lib/rigs/in-chat-connector.ts` (magic-link OAuth)
- Refactor: `lib/rigs/` → thin wrappers over Composio
- DB: `exo_composio_connections` — per-tenant connected apps

**1.4 Lead Management (od dnia 1)**

```sql
CREATE TABLE exo_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  phone TEXT,
  conversations JSONB DEFAULT '[]',
  referral_source TEXT,
  converted_tenant_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_leads_email ON exo_leads(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_phone ON exo_leads(phone) WHERE phone IS NOT NULL;
```

IORS rozmawia z leadami PRZED rejestracją. Identyfikacja: email + phone. Po rejestracji → dane merge do `exo_tenants`.

Pliki:
- Nowy: `lib/iors/lead-manager.ts`
- Extend: `lib/gateway/` → handle unregistered senders as leads

**1.5 Emergency Contact**

```sql
CREATE TABLE exo_emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Przy IORS birth: obowiązkowy numer + auto-call verification.

Pliki:
- Nowy: `lib/iors/emergency-contact.ts`
- Extend: `lib/iors/birth-flow.ts` → mandatory step

**1.6 Emotional Intelligence (Tau Matrix) — wrzucamy od razu**

Istniejące: crisis detection (3 layers), sentiment analysis, style matrix.
Dodajemy: Tau emotion matrix (4 kwadranty + podkrytyczność).

```typescript
interface EmotionSignal {
  quadrant: 'known_want' | 'known_unwant' | 'unknown_want' | 'unknown_unwant';
  subcriticality: number;  // 0-1
  valence: number;         // -1 to 1
  arousal: number;         // 0 to 1
  label: string;
  confidence: number;
}
```

Pliki:
- Extend: `lib/conversation-handler.ts` → emotion classification
- Nowy: `lib/iors/emotion-matrix.ts`
- DB: `exo_emotion_signals` tabela

**1.7 Autonomy Permissions System**

```sql
CREATE TABLE exo_autonomy_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  action_type TEXT NOT NULL,           -- 'call', 'message', 'schedule', 'purchase', 'log', 'create_mod'
  domain TEXT NOT NULL DEFAULT '*',    -- 'health', 'finance', 'work', '*'
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  threshold_amount NUMERIC,            -- max cost in PLN
  threshold_frequency INTEGER,         -- max times per day
  requires_confirmation BOOLEAN DEFAULT TRUE,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE exo_autonomy_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exo_autonomy_permissions
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
```

Pliki:
- Nowy: `lib/iors/autonomy.ts` — checkPermission(), proposePermission(), grantPermission()
- Nowy: `api/autonomy/` — CRUD endpoints
- Nowy tool: `propose_autonomy` w conversation-handler

#### Sprint 2 (tydzień 3-4): Canvas + Pętla

**2.1 Canvas Widget System** (zastąpi 20 dashboard pages)

```sql
CREATE TABLE exo_canvas_widgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  mod_slug TEXT,                        -- which mod provides data
  widget_type TEXT NOT NULL,             -- 'metric', 'chart', 'list', 'text', 'action'
  title TEXT NOT NULL,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  size_w INTEGER DEFAULT 1,
  size_h INTEGER DEFAULT 1,
  config JSONB DEFAULT '{}',
  visible BOOLEAN DEFAULT TRUE,
  created_by TEXT DEFAULT 'iors_proposed', -- 'iors_proposed', 'user_added', 'mod_default'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exo_canvas_widgets ENABLE ROW LEVEL SECURITY;
```

UI: Jeden `/dashboard` z grid layout (CSS Grid lub react-grid-layout).
- Drag & drop reorder
- "+" button → add widget (manual lub IORS proposes)
- Widget renders data from mod

Pliki:
- Delete: 15+ page files (health, goals, tasks, schedule, autonomy, business, etc.)
- Keep: `/dashboard` (refactor to Canvas), `/chat`, `/settings`, `/knowledge`
- Nowy: `components/canvas/` — CanvasGrid, Widget, WidgetRenderer
- Nowy: `api/canvas/` — CRUD widget endpoints

**2.2 Email Sending (Composio send-as)**

```
Opcja 1 (preferowane): Composio Gmail/Outlook send-as → user@gmail.com
Opcja 2 (fallback): Per-user email → user@exoskull.io
```

Pliki:
- Extend: `lib/integrations/composio-adapter.ts` → email actions
- Nowy tool: `send_email` w conversation-handler

**2.3 Pętla 15-min (Pętla)**

Refactor obecnych 25 CRONów w 3 nowe:

```
api/cron/pętla    — co 1 min, ultra-light (Gemini Flash)
api/cron/loop-15      — co 15 min, medium (Haiku)
api/cron/loop-daily   — co 24h, heavy (Sonnet)
```

Obecne domain-specific CRONs (predictions, insight-push, gap-detection) → migrated do generic loop system:

```typescript
// lib/iors/loop.ts
interface LoopTask {
  type: 'observation' | 'proactive' | 'outbound' | 'optimization' | 'maintenance' | 'emergency';
  priority: 0 | 1 | 2 | 3 | 4 | 5;  // 0 = emergency, 5 = low
  tenant_id: string;
  handler: string;  // function name
  params: any;
  schedule?: string; // cron expression for recurring
}

// Pętla (1 min): check event queue, dispatch high-priority tasks
// Loop-15 (15 min): per-tenant evaluation (batched, adaptive frequency)
// Loop-daily (24h): deep analysis, self-optimization
```

Pliki:
- Nowy: `lib/iors/loop.ts` — LoopOrchestrator
- Nowy: `lib/iors/loop-tasks/` — per-task-type handlers
- Refactor: `api/cron/` — 25 CRONs → 3 generic + task registry
- DB: `exo_loop_tasks` — task registry with scheduling

#### Sprint 3 (tydzień 5-6): Feedback + Billing + Polish

**3.1 Feedback Capture**

```sql
CREATE TABLE exo_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  message_id UUID,                      -- which message
  type TEXT NOT NULL,                    -- 'explicit_positive', 'explicit_negative', 'correction'
  context JSONB,                         -- tool_used, intent, time_of_day, channel
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

UI: 👍/👎 buttons na każdej odpowiedzi IORS w chat + voice ("was this helpful?" after call).

**3.2 Pay-Per-Usage Billing**

Stripe Metered Billing setup:
- `exo_usage_records` tabela: per-interaction logging
- Stripe meter events: pushed real-time
- Monthly invoice: auto-generated
- Dashboard: cost breakdown widget on Canvas

**3.3 Nowe tools w conversation-handler (łącznie ~35)**

Dodać do istniejących 28:
- `create_mod` — IORS proponuje i tworzy mod
- `adjust_personality` — zmienia parametry IORS
- `propose_autonomy` — proponuje nową zgodę
- `tau_assess` — Tau decision framework
- `async_think` — odkłada do async queue

### Phase 1 Metryki Sukcesu

| Metryka | Target |
|---|---|
| IORS birth flow completion rate | >80% |
| Canvas adoption (users using Canvas) | >60% |
| Pętla 15-min operational | 99.5% uptime |
| Avg cost per user/month | <$5 (infrastructure only) |
| User satisfaction (feedback) | >70% positive |
| Personality customization usage | >40% users change defaults |

---

### Phase 2: Intelligence & Ecosystem (6-8 tygodni)

**Cel:** Mod composition, Bizzon, marketplace, async Q&A.

#### 2.1 Mod Composition (Natural Language)

```sql
CREATE TABLE exo_mod_compositions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  name TEXT NOT NULL,
  source_mods TEXT[] NOT NULL,           -- ['sleep_tracker', 'calendar_manager']
  pipeline JSONB NOT NULL,               -- pipeline steps
  trigger TEXT DEFAULT 'on_data',        -- 'on_data', 'on_schedule', 'on_event'
  active BOOLEAN DEFAULT TRUE,
  created_by TEXT DEFAULT 'iors_proposed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Nowy tool: `compose_mods` w conversation-handler.

#### 2.2 Instance Hierarchy (IORS ↔ Bizzon)

```sql
CREATE TABLE exo_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  parent_id UUID REFERENCES exo_instances(id),
  type TEXT NOT NULL,                     -- 'iors', 'bizzon', 'agent'
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exo_instance_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_instance_id UUID REFERENCES exo_instances(id),
  to_instance_id UUID REFERENCES exo_instances(id),
  type TEXT NOT NULL,                     -- 'request', 'response', 'notification'
  payload JSONB NOT NULL,
  urgency TEXT DEFAULT 'medium',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.3 Async Q&A

Reuse `exo_async_tasks` z nowym type `async_think`:
- Nowy tool: `async_think` — discovery IORS says "let me think", queues deep analysis
- Delivery: push to preferred channel when done
- Timeout: 24h max

#### 2.4 Marketplace v1

- `exo_marketplace_listings` tabela
- Stripe Connect for creator payouts
- Mod discovery through IORS recommendations
- Basic search/browse in ExoSkull panel

#### 2.5 Browser Actions (Playwright Sandbox)

- Headless browser w kontenerze (Playwright)
- Nowy tool: `browser_action` w conversation-handler
- Safety: sandbox, per-action consent, screenshot audit trail
- Use cases: form fill, booking, price comparison, admin tasks

#### 2.6 Affiliate System

```sql
CREATE TABLE exo_referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  referred_tenant_id UUID,
  referral_code TEXT UNIQUE NOT NULL,
  revenue_share_pct NUMERIC DEFAULT 15,
  active_until TIMESTAMPTZ,
  total_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

X% revenue z poleconego usera przez 3 miesiące → payout do polecającego (Stripe Connect).

#### 2.7 Data Abstraction Layer

`lib/data-access/` — unified interface:
```typescript
interface DataAccessLayer {
  query(tenantId: string, collection: string, filter: any): Promise<any[]>;
  insert(tenantId: string, collection: string, data: any): Promise<any>;
  update(tenantId: string, collection: string, id: string, data: any): Promise<any>;
  delete(tenantId: string, collection: string, id: string): Promise<void>;
  aggregate(tenantId: string, collection: string, pipeline: any): Promise<any>;
}
```

Implementacja: Postgres (current). Interface: ready for federated (future).

### Phase 2 Metryki Sukcesu

| Metryka | Target |
|---|---|
| Mod compositions created | >100 total |
| Bizzon instances active | >50 |
| Async Q&A usage | >200 questions/month |
| Marketplace listings | >20 community mods |
| Data Abstraction Layer coverage | 100% of data access |

---

### Phase 3: Scale & Advanced Features (8-12 tygodni)

**Cel:** Voice biomarkers, BYOK, cross-user, federated prep, native apps.

#### 3.1 Voice Biomarkers (Hume AI integration)
- Hume AI API as new rig
- Emotion classification from audio stream
- Fusion with text sentiment → unified emotional state
- `exo_emotion_signals` tabela

#### 3.2 BYOK Billing
- Encrypted key storage in Supabase Vault
- Routing logic: if BYOK key exists → use user's key
- Billing adjustment: charge only infrastructure, not AI cost

#### 3.3 Cross-User IORS Communication
- `exo_cross_user_permissions` tabela
- Mutual consent required
- Structured messages between instances (not raw data sharing)

#### 3.4 Federated Learning Prep
- Data Abstraction Layer → pluggable backends
- Anonymous aggregate statistics (differential privacy)
- Research: Flower framework, ONNX on-device models

#### 3.5 Mobile App (React Native / Expo)
- Core: chat interface + Canvas (read-only initially)
- Push notifications for proactive IORS
- HealthConnect integration (Android)
- Background service for passive data collection

### Phase 3 Metryki Sukcesu

| Metryka | Target |
|---|---|
| Voice biomarker accuracy | >70% emotion classification |
| BYOK adoption | >10% of paying users |
| Cross-user connections | >50 pairs |
| Mobile app installs | >500 |
| Differential privacy implemented | Yes (aggregate queries) |

---

## 3. Migration Strategy: Zero-Downtime

### Zasada: No Big Bang

Nie robimy "wyłącz stare, włącz nowe". Migration jest INCREMENTAL:

1. **Feature flags** — nowe features za flagami. Włączaj per-tenant.
2. **Parallel running** — stare i nowe działają równolegle. Stare wyłączaj po walidacji nowego.
3. **Data migration** — leniwa (on-read migration). Nie migrujemy wszystkiego naraz.
4. **Rollback plan** — każda zmiana ma rollback. Feature flag off = instant rollback.

### Dashboard → Canvas migration

1. Deploy Canvas jako nowa strona (`/canvas` lub `/dashboard-v2`)
2. Feature flag: `canvas_enabled` per tenant
3. Migrate widgets z istniejących danych (mody → widgety automatycznie)
4. Redirect `/dashboard` → Canvas (dla enabled tenants)
5. Po 2 tygodniach + 0 issues → remove old pages
6. Keep old pages in git history (nie delete branch)

### CRON → Pętla migration

1. Deploy nowe 3 CRONy (pętla, loop-15, loop-daily) OBOK istniejących 25
2. Migrate tasks jeden po jednym: old CRON → loop task
3. Disable old CRON po migrated
4. After all migrated → remove old CRON files

---

## 4. Ryzyko i Mitygacja

| Ryzyko | Prawdopodobieństwo | Impact | Mitygacja |
|---|---|---|---|
| Canvas performance (wiele widgetów) | Medium | High | Lazy loading, virtual scrolling, max 20 widgets |
| Pętla cost explosion (15 min × N users) | High | High | Adaptive frequency, Gemini Flash pętla, budget alerts |
| Mod composition creates infinite loops | Medium | Medium | Max 5 steps per pipeline, timeout per step, circuit breaker |
| BYOK key security | Low | Critical | Encrypted vault, zero-knowledge access, audit log |
| User confusion (pivot from old UI) | High | Medium | Gradual migration, in-app guide, "what's new" modal |
| Stripe metered billing complexity | Medium | Medium | Start simple (3 meters), add granularity later |

---

## 5. Team & Timeline Summary

> **CONSTRAINT:** Max 2 lata na pełną realizację. Potem okno rynkowe się zamyka.

| Phase | Duration | Key Deliverables | Deadline |
|---|---|---|---|
| **Phase 0** | 1-2 tygodnie | Cleanup (remove hardcoded pages, rename LOOPCODE, remove Tyrolka) | Mies. 1 |
| **Phase 1** | 5-7 tygodni | Birth flow, Composio, leads, emergency, emotion matrix, Canvas, Pętla, email, billing | Mies. 3 |
| **Phase 2** | 6-8 tygodni | Mod composition, browser actions, affiliate, Bizzon, async Q&A, marketplace | Mies. 5 |
| **Phase 3** | 6-8 tygodni | Gamification, BYOK, voice biomarkers, cross-user, real-time | Mies. 7 |
| **Phase 4** | ongoing | Digital phenotyping, camera emotions, federated, mobile app | Mies. 8-24 |
| **Total** | ~7 miesięcy do v1.0 | Full IORS v1.0 live | **Max 7 mies.** |

**Solo founder = parallel impossible.** Ale: Composio eliminuje 14 custom rigs = oszczędność 4-6 tygodni. AI-assisted coding (Claude Sonnet 4.5) = 3-5x velocity. Istniejący fundament (gateway, mods, AI router) = 70% infrastruktury gotowe.

---

*Architektura szczegółowa: [IORS_ARCHITECTURE.md](./IORS_ARCHITECTURE.md)*
*Frameworki do budowania: [IORS_FRAMEWORKS.md](./IORS_FRAMEWORKS.md)*
