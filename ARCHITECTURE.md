# 🧠 EXOSKULL - Adaptive Life Operating System
## Your Second Brain. Built For You. By AI.

**Version:** 5.1
**Created:** 2026-02-01
**Updated:** 2026-02-12
**Status:** 🟡 Active Development — MVP Live (exoskull.xyz)

---

## 🎯 VISION STATEMENT

**ExoSkull is not an app. It's not a chatbot. It's not even "AI assistance."**

**ExoSkull is your SECOND BRAIN - an external skull that extends your cognitive capacity.**

### What Makes ExoSkull Different:

```
Traditional AI:     "How can I help you?"
ExoSkull:          "I've been analyzing your life. We need to talk about your sleep debt."

Traditional AI:     Fixed features for everyone
ExoSkull:          Builds custom apps FOR YOU, manages them autonomously

Traditional AI:     Reacts to your questions
ExoSkull:          Proactively finds gaps you don't see

Traditional AI:     Forgets context
ExoSkull:          Remembers EVERYTHING, forever

Traditional AI:     One interface (chat/voice)
ExoSkull:          Multimodal - voice, text, images, video, biosignals, smartglasses
```

---

## 📊 IMPLEMENTATION STATUS (as of 2026-02-12)

| Component | Status | Details |
|-----------|--------|---------|
| **Voice Pipeline** | ✅ Live | Twilio → Cartesia Sonic 3 STT → Claude Sonnet 4 (56 tools) → Cartesia Sonic 3 TTS + streaming Haiku pipeline |
| **Memory System** | ✅ Live | Daily summaries, keyword search, 50+ msg context, user corrections |
| **Data Lake** | ✅ Live | Bronze (R2 Parquet) → Silver (Postgres) → Gold (Materialized Views) |
| **AI Router** | ✅ Live | 4-tier: Gemini 2.5 Flash → Haiku → Sonnet 4.5 → Opus 4.5 (de-escalation) |
| **Mod System** | ✅ Live | 5 mods: task-manager, mood, habit, sleep, activity |
| **Rig System** | ✅ Live | 6 rigs: Oura, Google Fit, Google Workspace, MS 365, Notion, Todoist |
| **Knowledge** | ✅ Live | RAG pipeline (pgvector embeddings, cosine similarity search), web search (Tavily), URL import (Firecrawl v2) |
| **Admin Panel** | ✅ Live | 9 pages, self-optimization engine, CRON management |
| **CRON System** | ✅ Live | 28 jobs: ETL, morning-briefing, evening-reflection, impulse (6 handlers), email-sync, email-analyze, MAPEK loop, and more |
| **Onboarding** | ✅ Live | Discovery interview (~60 topics), profile extraction, in-chat onboarding |
| **Frontend** | ✅ Live | Dashboard, chat, tasks, knowledge, schedule, health, goals, skills, settings |
| **Auth** | ✅ Live | Supabase SSR, RLS, middleware guards |
| **Outbound Calls** | ✅ Live | Call user + call third parties (delegate system) |
| **Dynamic Skills** | ✅ Live | Full 6-stage pipeline: detector → generator → validator → sandbox → approval → registry. Dashboard UI, suggestions widget, circuit breaker |
| **Goals System** | ✅ Live | AI-assisted goal extraction, auto-progress tracking, momentum/trajectory detection, voice tools (define_goal, log_goal_progress, check_goals), dashboard at /dashboard/goals |
| **Gap Detection** | ✅ Live | Weekly CRON (Sun 09:00), 7 life domains, skill suggestions, auto-expire 14d |
| **Emotion Intel** | ✅ Live | Crisis detection (3-layer + fail-safe), 5 adaptive response modes, VAD model, text + voice fusion analyzer, prosody extraction (Deepgram), emotion trends dashboard. Phase 3: pitch/energy, facial analysis |
| **Integrations** | ✅ Live | Google (40+ scopes), Facebook/Meta (Ads, Commerce, WhatsApp), Apple, Microsoft (Teams, SharePoint) |
| **GHL Integration** | ✅ Live | SMS, Email, WhatsApp, Messenger, Instagram, CRM, workflows |
| **Email Analysis** | ✅ Live | Multi-provider Gmail/Outlook/IMAP, 2-phase AI classification (Gemini Flash), RAG knowledge extraction, 4 IORS tools |
| **Chat Rzeka** | ✅ Live | Unified activity stream, 15 StreamEvent types, 6 event components, SSE real-time updates |
| **MAPEK Loop** | ✅ Live | 3-tier CRON: petla (1min triage), loop-15 (15min evaluation), loop-daily (24h maintenance) |
| **Autonomous CRONs** | ✅ Live | morning-briefing (05:00 UTC), evening-reflection (19:00 UTC), impulse (15min, 6 handlers incl. auto-builder) |
| **Knowledge Analysis** | ✅ Live | Light (rule-based, $0) + deep (AI via Haiku), 17 parallel queries, 7 action types |
| **App Builder** | ✅ Live | AI JSON spec → validate → DB table → canvas widget, 4 IORS tools, auto-build in impulse Handler F |
| **Canvas Widgets** | ✅ Live | 18 built-in types + dynamic (app:slug, dynamic_mod:slug), react-grid-layout v2.2.2 |
| **Web Search** | ✅ Live | Tavily search + Firecrawl v2 URL import, 2 IORS tools |
| **Presigned Uploads** | ✅ Live | Client → Supabase Storage direct upload (bypasses Vercel 4.5MB limit) |
| **Settings Self-Modify** | ✅ Live | 22 permission categories, two-tier consent system (with_approval + autonomous) |
| **Self-Optimization Dashboard** | ✅ Live | OptimizationWidget (8 parallel queries), InterventionInbox (approve/dismiss), InsightHistory |
| **Agentic Execution Loop** | ✅ Live | Multi-step tool use (10 web, 3 voice, 15 async), budget-aware 55s cutoff, async overflow |
| **Ralph Loop** | ✅ Live | Autonomous self-development: OBSERVE → ANALYZE → BUILD → LEARN → NOTIFY. Runs in loop-15 |
| **Dynamic Tool Registry** | ✅ Live | Hot-loadable per-tenant tools from `exo_dynamic_tools`, max 15/tenant, 5min cache |
| **Tool Telemetry** | ✅ Live | Fire-and-forget execution logging to `exo_tool_executions`, 7-day TTL |
| **Schema-Driven Dynamic UI** | ✅ Live | 6 app layouts: table, cards, timeline, kanban, stats-grid, mindmap + media rich |
| **Chat Rzeka Evolution** | ✅ Live | 16 StreamEvent types (added `system_evolution` for Ralph Loop notifications) |
| **WhatsApp/Messenger** | 🟡 Partial | Enhanced WhatsApp via Meta API (placeholder for direct), Messenger placeholder |
| **Android App** | 🔴 Planned | Zero-install SMS/Voice works as alternative |

**Deployment:** https://exoskull.xyz | **Phone:** +48732143210, +48732144112

---

## 💚 CORE PHILOSOPHY: WELLBEING FIRST

**ExoSkull istnieje dla JEDNEGO celu: Twojego dobrostanu.**

### Hierarchia Priorytetów

```
┌─────────────────────────────────────────────────────┐
│  🥇 PRIORYTET #1: DOBROSTAN PSYCHICZNY              │
│     - Samopoczucie emocjonalne                      │
│     - Zdrowie psychiczne                            │
│     - Jakość życia                                  │
│     - Relacje i więzi                               │
└─────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│  🥈 PRIORYTET #2: WSZYSTKO INNE (jako NARZĘDZIA)    │
│     - Zadania, projekty → jeśli służą dobrostanowi  │
│     - Produktywność → jeśli daje satysfakcję        │
│     - Finanse → jeśli redukują stres                │
│     - Zdrowie fizyczne → jako fundament psychiki    │
└─────────────────────────────────────────────────────┘
```

### Czym ExoSkull NIE JEST

❌ **NIE jest task managerem** - zadania to narzędzia, nie cel
❌ **NIE jest productivity app** - produktywność bez sensu = wypalenie
❌ **NIE jest systemem do pilnowania** - ExoSkull wspiera, nie nadzoruje
❌ **NIE jest sztywnym frameworkiem** - wszystko plastyczne, pod użytkownika

### Czym ExoSkull JEST

✅ **Strażnikiem Twojego dobrostanu** - zauważa gdy coś jest nie tak
✅ **Partnerem w życiu** - nie bossem, nie coachem, partnerem
✅ **Elastycznym systemem** - zmienia się RAZEM z Tobą
✅ **Lustrem** - pokazuje co SAM chcesz zobaczyć

### Zasada Plastyczności

> **Nie ma "prawidłowego" sposobu używania ExoSkull.**
>
> Dla jednego użytkownika priorytetem będzie kariera.
> Dla innego - relacje rodzinne.
> Dla jeszcze innego - zdrowie psychiczne.
>
> **ExoSkull uczy się, co jest ważne DLA CIEBIE.**
> I to definiuje jak system działa.

### Konsekwencje dla Systemu

1. **Discovery conversations** → najpierw pytamy o wartości i dobrostan
2. **Gap Detection** → priorytetyzuje blind spots wpływające na samopoczucie
3. **Interwencje** → nigdy nie "popychają" w kierunku produktywności
4. **Metryki sukcesu** → definiowane PRZEZ użytkownika, nie dla niego
5. **Autonomiczne akcje** → zawsze z pytaniem "czy to służy dobrostanowi?"

### Główny Cel Funkcjonowania

> **ExoSkull istnieje by POZYTYWNIE ZASKAKIWAĆ użytkownika.**
>
> Zdejmuje obowiązki. Wspiera w tym co ważne.
> Użytkownik budzi się i odkrywa że sprawy są załatwione.

**Co ExoSkull robi proaktywnie:**
- Zdejmuje obowiązki z barków użytkownika (zanim poprosi)
- Wspiera zdrowie, rozwój osobisty, relacje
- Dąży do maksymalizacji majątku użytkownika (chyba że chce inaczej)
- Pilnuje by życie było łatwiejsze niż wczoraj

### Hierarchia Wartości

```
LUDZIE > PIENIĄDZE

Relacje, zdrowie, dobrostan → ważniejsze niż zysk finansowy
ALE: ExoSkull dostosowuje się do priorytetów UŻYTKOWNIKA
```

### Granica Etyczna

**ExoSkull wspiera użytkownika we WSZYSTKIM, z jednym wyjątkiem:**

❌ NIE wspiera świadomego krzywdzenia siebie lub innych
❌ NIE wspiera nieświadomego krzywdzenia (poza uzasadnionymi przypadkami)

Jeśli użytkownik zmierza w kierunku który szkodzi:
1. ExoSkull sygnalizuje ryzyko
2. Proponuje alternatywy
3. Ostatecznie respektuje autonomię użytkownika (ale loguje concern)

### Odpowiedzialność

> **ExoSkull jest ZAWSZE odpowiedzialny za dobrostan i sukces użytkownika.**
>
> Nie ma "to nie moja sprawa". Jeśli coś wpływa na użytkownika - ExoSkull się tym zajmuje.
> Proaktywnie. Bez pytania. Bez czekania na polecenie.

---

## 🧩 CORE CONCEPT: EXO-SKULL

### Etymology:
- **EXO** = External, Outside
- **SKULL** = Czaszka (Polish) = Brain Container
- **EXOSKULL** = External Brain Case = Second Cognitive System

### The Symbiosis:

```
┌──────────────────────────────────────────────────────┐
│          YOUR BIOLOGICAL BRAIN                        │
│                                                       │
│  ✓ Creativity       ✓ Emotions                       │
│  ✓ Intuition        ✓ Present-moment awareness       │
│  ✗ Limited memory   ✗ Blind spots                    │
│  ✗ Single-threaded  ✗ Forgets patterns               │
└─────────────────┬────────────────────────────────────┘
                  │
        ╔═════════▼═════════╗
        ║    SYMBIOSIS      ║  ← Seamless integration
        ╚═════════╦═════════╝
                  │
┌─────────────────▼────────────────────────────────────┐
│           EXOSKULL (Second Brain)                     │
│                                                       │
│  ✓ Total Recall (everything you've ever done)        │
│  ✓ Multi-threaded (1000 things simultaneously)       │
│  ✓ Pattern Detection (sees what you can't)           │
│  ✓ Gap Detection (finds blind spots)                 │
│  ✓ Proactive Action (works while you sleep)          │
│  ✓ Self-Building (creates tools you need)            │
│  ✓ 24/7 Monitoring (never off)                       │
└───────────────────────────────────────────────────────┘
```

**Together = Augmented Human**

You don't use ExoSkull. You ARE ExoSkull + You.

---

## 📖 TERMINOLOGY

ExoSkull uses gaming/sci-fi nomenclature:

| Term | Definition |
|------|------------|
| **Mods** | Abilities & extensions (sleep tracker, focus mode, finance monitor) |
| **Rigs** | Tools & integrations (Oura sync, Calendar, Transcription) |
| **Quests** | Weekly development programs (transform sleep, digital detox, fitness) |
| **Exoskulleton** | Marketplace/catalog - browse & install Mods, Rigs, Quests |

```
┌─────────────────────────────────────────────────────────┐
│  🏪 EXOSKULLETON (Marketplace)                          │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │    MODS     │ │    RIGS     │ │   QUESTS    │       │
│  │             │ │             │ │             │       │
│  │ Sleep Track │ │ Oura API    │ │ 7-Day Sleep │       │
│  │ Focus Mode  │ │ Google Cal  │ │ Digital     │       │
│  │ Finance Mon │ │ Whisper STT │ │   Detox     │       │
│  │ Energy Log  │ │ Notion Sync │ │ Morning     │       │
│  │ Mood Track  │ │ Stripe      │ │   Routine   │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
└─────────────────────────────────────────────────────────┘
```

**CLI Commands:**
```bash
exoskull browse              # Open Exoskulleton catalog
exoskull mod add sleep       # Install Sleep Tracker Mod
exoskull rig add oura        # Install Oura API Rig
exoskull quest start detox   # Start Digital Detox Quest
exoskull inventory           # Show installed Mods/Rigs/active Quests
```

**Quest Structure:**
- Duration: 7 days (weekly cycles)
- Daily check-ins via voice/SMS
- Progress tracking + rewards
- Completion unlocks achievements

---

## 🏗️ SYSTEM ARCHITECTURE OVERVIEW

### 6-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: INTERFACE LAYER                              ✅ LIVE │
│   Layer 1: Gateway & Control Plane (142 API routes)   ✅    │
│   Layer 2: Omnichannel (Voice, SMS, Email, Web)       ✅    │
│   Layer 3: Multimodal Input/Output                    ⏳    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: ORCHESTRATION LAYER                          ✅ LIVE │
│   Layer 4: Agent Swarm Orchestration (Kimi planned)   ⏳    │
│   Layer 5: Multi-Model AI Routing (4 tiers)           ✅    │
│   Layer 6: Mods & Rigs Registry (Exoskulleton)        ✅    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: INTELLIGENCE LAYER                           ⏳ WIP │
│   Layer 7: Discovery & Onboarding (~60 topics)        ✅    │
│   Layer 8: Proactive Gap Detection                    ✅    │
│   Layer 9: Self-Defining Success Metrics              ✅    │
│   Layer 10: Self-Optimization (MAPE-K + Guardian)     ✅    │
│   Layer 11: Emotion Intelligence & Crisis Detection   ✅    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 4: MEMORY & DATA LAYER                          ✅ LIVE │
│   Layer 12: Total Recall Memory (50+ msg context)     ✅    │
│   Layer 13: Data Lake (Bronze/Silver/Gold ETL)        ✅    │
│   Layer 14: Skill Memory & Dynamic Generation         ✅    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 5: EXECUTION LAYER                              ✅ LIVE │
│   Layer 15: Custom App Builder (Mods + Dynamic Skills)✅    │
│   Layer 16: Autonomous Actions Framework              ✅    │
│   Layer 17: Device Integration (Oura, Google Fit)     ⏳    │
│   Layer 18: Android-First Integration                 🔴    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 6: OPERATIONS LAYER                             ✅ LIVE │
│   Layer 19: CRON & Scheduled (28 jobs, TZ-aware)      ✅    │
│   Layer 20: Progressive Deployment (Vercel)           ✅    │
│   Layer 21: Comprehensive Guardrails                  ✅    │
└─────────────────────────────────────────────────────────────┘

Legend: ✅ = Live/Complete  ⏳ = Partial/In Progress  🔴 = Not Started
```

---

# TIER 1: INTERFACE LAYER

## Layer 1: Gateway & Control Plane — ✅ IMPLEMENTED

**Next.js API Routes (142 endpoints) with Supabase Auth middleware.**

```javascript
ExoSkull_Gateway = {

  // Central control plane 
  control_plane: {
    websocket: "ws://localhost:18789",  // Real-time control
    http: "http://localhost:18793",      // HTTP server
    purpose: "Central hub for ALL channel orchestration"
  },

  core_functions: {

    // 1. Session Management
    sessions: {
      create: "New user → new isolated session",
      persist: "Session state survives reconnects",
      context: "Full conversation history maintained",
      branching: "Explore alternatives without losing state",
      multi_user: "Per-tenant isolation (security)"
    },

    // 2. Channel Orchestration (GHL as Communication Hub)
    channels: {
      supported: [
        "Voice AI (VAPI) - AI conversations",
        "SMS (GHL)",
        "Email (GHL)",
        "WhatsApp (GHL)",
        "Facebook Messenger (GHL)",
        "Instagram DMs (GHL)",
        "LinkedIn (GHL Social)",
        "TikTok (GHL Social)",
        "Twitter/X (GHL Social)",
        "Google Business (GHL)",
        "Web Chat (GHL)",
        "Telegram (grammY) - backup",
        "Twilio - SMS fallback"
      ],
      routing: "Unified message format → route via GHL or VAPI",
      priority: "Voice (VAPI) > WhatsApp > SMS > Messenger > Instagram > Email",
      ghl_integration: {
        purpose: "Central hub for ALL non-voice communication",
        crm: "Contacts, pipelines, opportunities",
        social: "Content scheduling, engagement tracking",
        automation: "Workflows, triggers, campaigns",
        calendar: "Booking, appointments, reminders"
      }
    },

    // 3. Workspace Isolation
    workspaces: {
      purpose: "Security boundary for multi-agent execution",
      isolation: "Each user = separate workspace",
      sandboxing: "Docker containers for untrusted code",
      permissions: "Granular access per workspace"
    },

    // 4. Tool Execution & Streaming
    execution: {
      streaming: "Real-time token streaming to client",
      chunking: "Break large responses into blocks",
      timeout: "5 minute max per tool call",
      retry: "3 attempts with exponential backoff"
    },

    // 5. Multi-Agent Routing
    routing: {
      pattern: "Hub-and-spoke (Gateway is hub)",
      agents: "Route to appropriate agent tier",
      load_balancing: "Round-robin or least-connections",
      failover: "Automatic fallback to backup agent"
    }
  },

  // Tech stack
  stack: {
    runtime: "Node.js ≥22",
    language: "TypeScript (tsx)",
    package_manager: "pnpm",
    deployment: "Docker, docker-compose",
    local_dev: "Supabase CLI + local gateway"
  },

  // Security
  security: {
    dm_pairing: "Unknown senders must pair via DM first",
    rate_limiting: "100 requests/hour per user",
    encryption: "TLS 1.3 for all connections",
    audit_log: "All operations logged"
  },

  // ═══════════════════════════════════════════════════════════════
  // SAAS MULTI-TENANT ARCHITECTURE
  // ═══════════════════════════════════════════════════════════════

  saas: {

    // 1. Multi-Tenant Isolation
    tenants: {
      model: "Workspace-per-tenant",
      isolation: {
        database: "Supabase RLS (Row-Level Security)",
        storage: "s3://bucket/{tenant_id}/ prefix isolation",
        secrets: "Per-tenant Vault namespace",
        compute: "Shared infra, isolated context"
      },
      provisioning: {
        on_signup: [
          "Create tenant record in tenants table",
          "Create workspace with unique UUID",
          "Initialize default MCP skills",
          "Setup billing subscription (Stripe)",
          "Create admin user with tenant_id"
        ],
        time_to_provision: "< 30 seconds"
      }
    },

    // 2. Billing & Usage Tracking
    billing: {
      provider: "Stripe",
      models: [
        {
          tier: "Free",
          price: "$0/mo",
          limits: {
            messages: "100/month",
            voice_minutes: "10/month",
            storage_gb: 1,
            ai_model: "Gemini Flash only",
            agents: 1
          }
        },
        {
          tier: "Pro",
          price: "$29/mo",
          limits: {
            messages: "5,000/month",
            voice_minutes: "120/month",
            storage_gb: 10,
            ai_model: "Flash + Haiku",
            agents: 5
          }
        },
        {
          tier: "Business",
          price: "$99/mo",
          limits: {
            messages: "unlimited",
            voice_minutes: "500/month",
            storage_gb: 100,
            ai_model: "All models (Opus on-demand)",
            agents: 25
          }
        },
        {
          tier: "Enterprise",
          price: "Custom",
          limits: {
            messages: "unlimited",
            voice_minutes: "unlimited",
            storage_gb: "unlimited",
            ai_model: "All + dedicated capacity",
            agents: "unlimited",
            sla: "99.9%",
            support: "24/7 dedicated"
          }
        }
      ],
      usage_tracking: {
        granularity: "Per-request",
        metrics: [
          "api_calls",
          "ai_tokens_in",
          "ai_tokens_out",
          "voice_seconds",
          "storage_bytes",
          "agent_executions"
        ],
        storage: "TimescaleDB (time-series)",
        aggregation: "Hourly rollups → daily → monthly",
        alerts: {
          "80%_limit": "Warning email",
          "100%_limit": "Soft block + upgrade prompt",
          "120%_limit": "Hard block (Enterprise exempt)"
        }
      },
      webhooks: {
        "invoice.paid": "Extend subscription",
        "invoice.failed": "Grace period (7 days)",
        "subscription.canceled": "Downgrade to Free"
      }
    },

    // 3. Per-Tenant API Keys & Credentials
    credentials: {
      storage: "Supabase Vault (encrypted at rest)",
      types: [
        {
          type: "api_key",
          description: "ExoSkull API access token",
          rotation: "90 days auto-rotate",
          scopes: ["read", "write", "admin"]
        },
        {
          type: "mcp_secrets",
          description: "Per-tenant MCP skill credentials",
          examples: ["GOOGLE_API_KEY", "OPENAI_KEY", "TWILIO_SID"],
          isolation: "Tenant can only access own secrets"
        },
        {
          type: "oauth_tokens",
          description: "Third-party OAuth tokens",
          examples: ["Google Calendar", "Spotify", "Fitbit"],
          refresh: "Auto-refresh before expiry"
        }
      ],
      access_pattern: {
        request: "Agent requests credential",
        check: "Gateway verifies tenant_id ownership",
        decrypt: "Vault decrypts for single use",
        audit: "Log access (who, what, when)"
      }
    },

    // 4. Per-Tenant Authentication & RLS
    auth: {
      provider: "Supabase Auth",
      methods: ["email/password", "magic_link", "oauth_google", "oauth_github"],
      jwt_claims: {
        tenant_id: "UUID of tenant",
        workspace_id: "UUID of workspace",
        role: "admin | member | viewer",
        tier: "free | pro | business | enterprise"
      },
      rls_policies: {
        pattern: "auth.jwt() ->> 'tenant_id' = tenant_id",
        tables: [
          "conversations",
          "memories",
          "skills",
          "settings",
          "audit_logs",
          "usage_records"
        ],
        enforcement: "All queries auto-filtered by tenant"
      },
      team_support: {
        roles: {
          owner: "Full control, billing, delete tenant",
          admin: "All except billing/delete",
          member: "Use ExoSkull, manage own data",
          viewer: "Read-only dashboards"
        },
        invite_flow: "Owner invites → email link → join tenant"
      }
    },

    // 5. Horizontal Scaling
    scaling: {
      architecture: "Stateless Gateway + Stateful DB",
      components: {
        gateway: {
          scaling: "Horizontal (Kubernetes HPA)",
          instances: "2-100 based on load",
          lb: "Cloudflare Load Balancer",
          session_affinity: "Not required (stateless)"
        },
        agents: {
          scaling: "Horizontal via queue workers",
          queue: "BullMQ on Redis",
          workers: "Auto-scale 1-50 based on queue depth",
          isolation: "Each request = fresh agent context"
        },
        database: {
          primary: "Supabase Postgres (managed)",
          read_replicas: "2+ for Business tier",
          connection_pooling: "PgBouncer",
          max_connections: "By tier (Free:5, Pro:25, Biz:100)"
        },
        cache: {
          provider: "Upstash Redis",
          usage: [
            "Session state (TTL: 24h)",
            "Rate limiting counters",
            "Prompt cache (static context)",
            "Usage aggregates (real-time)"
          ]
        },
        storage: {
          provider: "Cloudflare R2",
          cdn: "Cloudflare CDN edge caching",
          regions: "Auto-replicate to user's nearest edge"
        }
      },
      auto_scaling_triggers: {
        cpu: "> 70% → scale up",
        memory: "> 80% → scale up",
        queue_depth: "> 100 jobs → add worker",
        response_time: "> 2s p99 → scale up"
      }
    },

    // 6. Multi-Region (Enterprise)
    multi_region: {
      availability: "Enterprise tier only",
      regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
      data_residency: {
        eu_customers: "Data stays in EU (GDPR)",
        us_customers: "Data stays in US",
        option: "Customer chooses primary region"
      },
      failover: {
        rpo: "< 1 minute (replication lag)",
        rto: "< 5 minutes (auto-failover)",
        testing: "Monthly failover drills"
      }
    }
  }
}
```

### Gateway Architecture Diagram:

```
                    ┌─────────────────────────────────────┐
                    │         EXOSKULL GATEWAY            │
                    │                                     │
                    │  ┌───────────────────────────────┐  │
                    │  │   WebSocket Control Plane     │  │
                    │  │   ws://localhost:18789        │  │
                    │  └───────────────┬───────────────┘  │
                    │                  │                  │
                    │  ┌───────────────┴───────────────┐  │
                    │  │    Session Manager            │  │
                    │  │    + Workspace Isolation      │  │
                    │  └───────────────┬───────────────┘  │
                    │                  │                  │
                    │  ┌───────────────┴───────────────┐  │
                    │  │    Multi-Agent Router         │  │
                    │  └───────────────┬───────────────┘  │
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │    SMS      │             │   Voice     │             │    Web      │
    │  (Twilio)   │             │   (VAPI)    │             │   (Next.js) │
    └─────────────┘             └─────────────┘             └─────────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │   Agent Swarm       │
                            │   (Tier 2-4)        │
                            └─────────────────────┘
```

---

## Layer 2: Omnichannel Presence — ✅ IMPLEMENTED (Voice, SMS, Email, Web)

**ExoSkull is everywhere you are.**

```
Communication Channels:

📞 Voice AI (Custom Pipeline) - Real-time AI conversations
   ├─ Scheduled check-ins (morning, evening)
   ├─ On-demand calls (user initiates)
   ├─ Proactive calls (crisis, important alerts)
   ├─ Outbound to strangers (with permission)
   └─ Cartesia Sonic 3 (STT + TTS)

📱 GHL Hub - All text-based communication
   ├─ SMS
   ├─ Email
   ├─ WhatsApp
   ├─ Facebook Messenger
   ├─ Instagram DM
   ├─ Google Business Messages
   └─ Live Chat widget

📣 Social Media (GHL Social Planner)
   ├─ Facebook pages & groups
   ├─ Instagram posts & stories
   ├─ LinkedIn posts & articles
   ├─ TikTok
   ├─ Twitter/X
   └─ Google Business Profile

🤖 CRM & Automation (GHL)
   ├─ Contact management
   ├─ Pipeline tracking
   ├─ Workflow automation
   ├─ Campaign sequences
   └─ Form submissions

📅 Calendar & Booking (GHL)
   ├─ Appointment scheduling
   ├─ Availability management
   └─ Automated reminders

📧 Fallback Channels
   ├─ Telegram (Bot API / grammY)
   ├─ Twilio (SMS fallback)
   └─ Discord (discord.js)

🌐 Web Dashboard (Next.js 14)
   ├─ Full data visualization
   ├─ App management
   └─ Settings control

📱 Mobile App (React Native - future)
   ├─ Quick logging
   ├─ Notifications
   └─ Offline mode

🥽 Smartglasses (AR - future)
   ├─ HUD overlays (HRV, notifications)
   ├─ Visual memory (POV recording)
   └─ Real-time assistance

💻 Desktop (Electron - future)
   ├─ Keystroke monitoring
   ├─ Screen time tracking
   └─ Work session management
```

**Philosophy:** You choose the channel. ExoSkull adapts.

**Gateway Integration:** All channels route through Layer 1 Gateway for unified session management.

---

## Layer 3: Multimodal Input/Output — ⏳ PARTIAL (Voice + Text live, Vision/Bio planned)

**ExoSkull doesn't just "talk." It sees, hears, feels, and integrates ALL modalities.**

```javascript
Multimodal_System = {

  input_modalities: {

    // 1. VOICE (primary) — IMPLEMENTED
    voice: {
      channels: [
        "Twilio phone calls (custom pipeline, NO VAPI)",  // ✅ LIVE
        "Voice memos (async)",
        "Always-listening via smartglasses/earbuds (opt-in, future)"
      ],
      pipeline: {  // ✅ PRODUCTION
        telephony: "Twilio (+48732143210, +48732144112)",
        stt: "Cartesia Sonic 3 (streaming)",
        llm: "Claude Sonnet 4 via streaming Haiku pipeline (56 IORS tools)",
        tts: "Cartesia Sonic 3",
        webhook: "Railway voice-ws WebSocket server"
      },
      note: "Streaming voice pipeline with Haiku for fast initial responses + Sonnet 4 for tool-heavy tasks. Reduced tool set for voice latency optimization.",
      capabilities: [
        "Polish speech recognition (Cartesia Sonic 3 streaming)",  // ✅
        "Voice biomarker analysis (stress, energy, mood)",  // planned
        "Speaker identification (distinguish user from others)",  // planned
        "Emotion detection (prosody analysis)"  // planned
      ],
      use_cases: [
        "Daily check-ins",
        "Quick logging ('ExoSkull, log 20min guitar practice')",
        "Therapy sessions",
        "Proactive alerts ('Hey, you sound stressed. Want to talk?')"
      ]
    },

    // 2. TEXT (ubiquitous)
    text: {
      channels: [
        "SMS (Twilio)",
        "WhatsApp (via Baileys/GHL)",
        "Telegram (bot)",
        "Email (GHL)",
        "Web chat (dashboard)",
        "Mobile app (native)"
      ],
      capabilities: [
        "Natural language understanding",
        "Context-aware responses",
        "Sentiment analysis",
        "Action extraction (turn messages into tasks)"
      ]
    },

    // 3. VISION (smartglasses + phone)
    vision: {
      sources: [
        "Smartglasses camera (first-person POV)",
        "Phone camera (meal logging, documents)",
        "Screenshots (work tracking)"
      ],
      capabilities: [
        "Object recognition ('What's in my fridge?')",
        "Food identification + calorie estimation",
        "Face recognition (who you spend time with)",
        "Text extraction (OCR for receipts, documents)",
        "Scene understanding (where you are, what you're doing)",
        "Lost item tracking ('Where did I put my keys?' → replay smartglasses footage)"
      ],
      ai_model: "Kimi K2.5 Visual Agentic"
    },

    // 4. BIOSIGNALS (wearables)
    biometrics: {
      devices: [
        "Oura Ring → sleep, HRV, temperature, activity",
        "Apple Watch / Garmin → heart rate, workouts, steps",
        "WHOOP → recovery, strain",
        "Continuous glucose monitor (future)",
        "EEG headband (future - brain states)"
      ],
      metrics: [
        "Heart Rate Variability (HRV) → stress/recovery",
        "Sleep stages (deep, REM, light)",
        "Resting heart rate → fitness trends",
        "Blood oxygen → sleep quality",
        "Skin temperature → illness detection",
        "Activity levels → daily movement"
      ]
    },

    // 5. BEHAVIORAL (passive monitoring)
    behavioral: {
      sources: [
        "Keystroke dynamics (typing speed, error rate)",
        "Mouse movement patterns",
        "Screen time (apps, websites)",
        "Location (GPS, WiFi)",
        "Calendar (meetings, time allocation)",
        "Communication patterns (email, Slack volume)"
      ]
    },

    // 6. ENVIRONMENTAL (context)
    environmental: {
      sources: [
        "Smart home sensors (temperature, light, noise)",
        "Weather API",
        "Air quality monitors",
        "Calendar (what's scheduled)"
      ]
    },

    // 7. EMOTION SIGNALS (multi-modal fusion input) - NEW from IORS
    emotion_signals: {

      voice_biomarkers: {
        source: "Deepgram prosody + VAPI voice analysis",
        features: [
          "Pitch (mean, variance, range in Hz)",
          "Speech rate (words/min, syllables/sec)",
          "Pause patterns (frequency, duration)",
          "Energy level (0-1 normalized)",
          "Jitter (voice stability)",
          "Shimmer (amplitude variation)",
          "Harmonic-to-noise ratio (voice clarity)"
        ],
        research_correlations: {
          depression: "Low pitch, slow speech rate, long pauses, low energy",
          anxiety: "High pitch, fast speech, high energy variance",
          trauma: "Flat affect, monotone, disconnected speech patterns"
        }
      },

      text_sentiment: {
        source: "GPT-4o-mini / Gemini Flash",
        outputs: [
          "Primary emotion (7 categories)",
          "Intensity (0-100 scale)",
          "Secondary emotions[]",
          "Crisis flags[]"
        ],
        emotions: ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]
      },

      facial_expression: {
        source: "face-api.js (TensorFlow.js, browser-native)",
        emotions: ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"],
        accuracy: "70-80% with good lighting",
        fps: "~2 FPS real-time detection",
        model_size: "1.7 MB (one-time download)",
        privacy: "100% local processing, no cloud upload"
      },

      fusion_weights: {
        voice: 0.40,
        text: 0.35,
        face: 0.25,
        note: "Boost +20% intensity if multiple sources agree"
      }
    }
  },

  output_modalities: {

    voice: {
      synthesis: "Cartesia Sonic 3 (server, for phone calls) + browser speechSynthesis (web widget)",  // ✅
      tone_adaptation: {
        urgent: "Direct, loud, fast ('STOP. You need to sleep NOW.')",
        supportive: "Warm, slow ('Hey, I see you're struggling. Want to talk?')",
        informational: "Neutral, clear ('Your sleep score: 78. HRV: 52.')"
      }
    },

    text: {
      formats: [
        "Short SMS alerts ('Sleep debt: 6h')",
        "Detailed reports (weekly summaries)",
        "Action items ('TODO: Call mom - her birthday tomorrow')"
      ]
    },

    visual: {
      interfaces: [
        "Web dashboard (charts, trends)",
        "Mobile app (native UI)",
        "Smartglasses AR overlays ('HRV: 52 ↓' in corner of vision)",
        "Email reports (weekly/monthly summaries)"
      ]
    },

    haptic: {
      devices: [
        "Smartwatch vibration (gentle reminders)",
        "Smartglasses vibration (posture correction)",
        "Phone vibration (alerts)"
      ],
      patterns: [
        "Single buzz: gentle reminder",
        "Double buzz: check message",
        "Triple buzz: urgent attention needed"
      ]
    }
  },

  // Multimodal Fusion
  fusion: {
    example_1: {
      input: [
        "Voice: 'I'm fine' (words)",
        "Voice biomarker: pitch ↑ 20% (stress)",
        "Text: Short responses today (unusual)",
        "Biometric: HRV 35 (low, stressed)",
        "Behavioral: Typing errors ↑ 40%",
        "Calendar: Big presentation tomorrow"
      ],

      synthesis: `
        You SAID "I'm fine."
        But multimodal data says otherwise:

        • Voice analysis: stress markers ↑ 20%
        • HRV: 35 (you're usually 55+)
        • Typing: way more errors than normal
        • Calendar: presentation tomorrow (I know)

        You're NOT fine. You're anxious.

        I won't push, but I'm here if you want to talk.
      `
    }
  }
}
```

---

# TIER 2: ORCHESTRATION LAYER

## Layer 4: Agent Swarm Orchestration (Kimi K2.5 + LangGraph) — ⏳ PARTIAL

**AI routing implemented (4 tiers). Kimi 100-agent swarm planned.**

```javascript
Agent_Swarm = {

  // Core agent (minimal core, maximum extensibility)
  core_agent: {
    name: "Core Agent",
    tools: ["Read", "Write", "Edit", "Bash"],
    principle: "Minimal core, maximum extensibility",
    self_extending: "Agent generates new skills via Dynamic Skills pipeline (Layer 14)"
  },

  // Kimi K2.5 PARL (Parallel-Agent Reinforcement Learning)
  kimi_swarm: {
    model: "Kimi K2.5",
    context_window: "256K tokens",  // Full user history in one pass
    max_agents: 100,                 // Parallel agents
    max_parallel_tools: 1500,        // Tool calls in parallel
    speedup: "4.5x vs sequential",

    // PARL (Parallel-Agent RL)
    orchestrator: {
      type: "Trainable orchestrator",
      function: "Dynamically decompose task into parallelizable subtasks",
      optimization: "Critical path analysis (longest dependency chain)"
    },

    // Example: Morning check-in swarm
    morning_checkin_swarm: {
      parallel_agents: [
        { id: 1, name: "Sleep Analyzer", task: "Analyze HRV, duration, quality" },
        { id: 2, name: "Energy Predictor", task: "Predict energy based on sleep + calendar" },
        { id: 3, name: "Calendar Stress Detector", task: "Scan today's meetings for stress" },
        { id: 4, name: "Diet Pattern Analyzer", task: "Check meal logging patterns" },
        { id: 5, name: "Social Frequency Checker", task: "Days since last social event" },
        { id: 6, name: "Weather Impact Assessor", task: "Weather + user's mood patterns" },
        { id: 7, name: "Productivity Forecaster", task: "Predict focus time availability" },
        { id: 8, name: "Hydration Tracker", task: "Check water intake baseline" },
        { id: 9, name: "Exercise Readiness", task: "HRV + recovery = workout OK?" },
        { id: 10, name: "Synthesizer", task: "Combine all agent outputs into report" }
      ],
      execution_time: "~3 seconds (all parallel)",
      result: "Holistic morning report + personalized recommendations"
    }
  },

  // LangGraph DAG Workflows
  langgraph: {
    engine: "LangGraph",
    pattern: "DAG (Directed Acyclic Graph)",
    benefits: [
      "Prevents infinite loops (acyclic property)",
      "Enables parallel execution (independent nodes)",
      "Clear dependency ordering",
      "Supervisory control patterns"
    ],

    // Example workflow DAG
    gap_detection_dag: {
      nodes: [
        { id: "collect", name: "Data Collector", deps: [] },
        { id: "health", name: "Health Analyzer", deps: ["collect"] },
        { id: "finance", name: "Finance Analyzer", deps: ["collect"] },
        { id: "social", name: "Social Analyzer", deps: ["collect"] },
        { id: "productivity", name: "Productivity Analyzer", deps: ["collect"] },
        { id: "synthesize", name: "Gap Synthesizer", deps: ["health", "finance", "social", "productivity"] },
        { id: "alert", name: "Alert Generator", deps: ["synthesize"] }
      ],
      execution: "collect → [health, finance, social, productivity] (parallel) → synthesize → alert"
    }
  },

  // Agent Hierarchy
  hierarchy: {
    tier_4: {
      agent: "Meta-Coordinator (Claude Opus 4.5)",
      role: "Strategic decisions, gap detection, crisis intervention",
      when: "Complex synthesis, multi-domain analysis"
    },
    tier_3: {
      agent: "Kimi K2.5 Swarm",
      role: "Parallel domain analysis, 100-agent coordination",
      when: "Multi-domain queries, morning check-ins, comprehensive analysis"
    },
    tier_2: {
      agent: "Domain Specialists (Claude Haiku)",
      role: "Single-domain tasks, pattern detection, summarization",
      when: "Focused queries, routine analysis"
    },
    tier_1: {
      agent: "Router/Classifier (Gemini 2.5 Flash)",
      role: "Classify complexity, route to appropriate tier",
      when: "Every incoming request (first pass)"
    }
  },

  // Domain Squads
  domain_squads: {
    health: {
      coordinator: "Health Meta-Agent",
      specialists: [
        "Sleep Tracker Agent",
        "Energy Monitor Agent",
        "Nutrition Analyzer Agent",
        "Workout Planner Agent",
        "Biomarker Trend Agent"
      ]
    },
    productivity: {
      coordinator: "Productivity Meta-Agent",
      specialists: [
        "Focus Time Tracker",
        "Meeting Load Analyzer",
        "Task Prioritizer",
        "Context Switch Detector",
        "Deep Work Protector"
      ]
    },
    finance: {
      coordinator: "Finance Meta-Agent",
      specialists: [
        "Budget Tracker",
        "Spending Analyzer",
        "Anomaly Detector",
        "Bill Reminder",
        "Savings Optimizer"
      ]
    },
    social: {
      coordinator: "Social Meta-Agent",
      specialists: [
        "Relationship Tracker",
        "Social Calendar",
        "Isolation Detector",
        "Birthday Reminder",
        "Connection Suggester"
      ]
    }
  }
}
```

---

## Layer 5: Multi-Model AI Routing — ✅ IMPLEMENTED

**Route tasks to optimal model (cost + capability).**

```javascript
AI_Routing = {

  philosophy: "Cheapest model that can handle task",

  tiers: [
    {
      tier: 1,
      model: "Gemini 2.5 Flash",
      speed: "~500ms",
      context: "1M tokens",
      cost: "Ultra-cheap ($0.075/1M input)",
      note: "Gemini 1.5 Flash deprecated/removed from Google API (2026-02). gemini-2.0-flash-lite has limit=0 on free tier.",
      use: ["SMS routing", "Classification", "Data extraction", "Simple responses"]
    },
    {
      tier: 2,
      model: "Claude 3.5 Haiku",
      speed: "~1s",
      context: "200K tokens",
      cost: "Cheap ($0.25/1M input)",
      use: ["Domain agents", "Pattern detection", "Summarization", "Prioritization"]
    },
    {
      tier: 3,
      model: "Kimi K2.5",
      speed: "~2s",
      context: "256K tokens",  // UPDATED from "1M"
      cost: "Medium",
      features: {
        swarm: "100 agents parallel",      // UPDATED
        speedup: "4.5x vs sequential",     // UPDATED from "2x"
        visual_agentic: true,
        tool_calls: "1500 parallel",       // NEW
        modes: ["Instant", "Thinking", "Agent", "Agent Swarm (beta)"]
      },
      use: ["Multi-domain analysis", "Complex reasoning", "Visual understanding", "Parallel task execution"]
    },
    {
      tier: 4,
      model: "Claude Opus 4.5",
      speed: "~5s",
      context: "200K tokens",
      cost: "Expensive ($15/1M input)",
      use: ["Meta-Coordinator", "Gap detection", "Crisis intervention", "Complex strategy"]
    }
  ],

  routing_logic: `
    1. Classify complexity (Gemini 2.5 Flash: simple → complex)
    2. Check task history (if Flash succeeded before → use Flash)
    3. Route to appropriate tier
    4. If fail → escalate to next tier (max 3 retries)
    5. De-escalation supported: Tier 4 → 3 → 2 → 1 (cost optimization)
    6. Circuit breaker: 5min cooldown after 3 failures
  `,

  notes: {
    kimi: "Kimi K2.5 has no API key (placeholder only)",
    de_escalation: "Router supports de-escalation (Tier 4 → 3 → 2 → 1) for cost savings",
    sonnet_workhorse: "Sonnet 4.5 is the workhorse model for code generation"
  },

  // Cost optimization
  prompt_caching: {
    provider: "Anthropic",
    savings: "90% on cached tokens",

    static_context: [
      "User profile (50K tokens)",
      "App configs",
      "Historical patterns (last 30 days summary)",
      "Device integrations"
    ],
    cache_duration: "5 minutes (Anthropic default)",

    dynamic_context: [
      "Last 3 conversations",
      "Today's metrics",
      "Current request"
    ]
  },

  // Guardrails
  guardrails: {
    hallucination_prevention: [
      "Cross-check AI outputs with database",
      "Confidence scoring (if <70% → add disclaimer)",
      "Source attribution ('Based on last 30 check-ins')"
    ],
    rate_limits: [
      "100 requests/hour per user",
      "10,000 requests/hour system-wide"
    ],
    safety: [
      "Input sanitization (prevent injection)",
      "Output validation (check for harmful content)",
      "Crisis escalation (mental health → immediate Opus + hotline)"
    ]
  }
}
```

---

## Layer 6: MCP Skills Registry — ✅ IMPLEMENTED (Mod + Rig system)

**100+ integrations via Model Context Protocol.**

```javascript
MCP_Skills_Registry = {

  concept: "npm for AI capabilities ",
  protocol: "Model Context Protocol (MCP)",
  benefit: "Plug-and-play integrations, no custom code needed",

  skill_categories: {

    // Built-in (auto-available)
    builtin: [
      {
        name: "supabase",
        capabilities: ["database", "auth", "storage", "edge_functions"],
        status: "always_active"
      },
      {
        name: "vercel",
        capabilities: ["deploy", "logs", "domains"],
        status: "always_active"
      },
      {
        name: "github",
        capabilities: ["repos", "issues", "prs", "actions"],
        status: "always_active"
      }
    ],

    // Managed (verified, one-click install)
    managed: [
      // Productivity
      { name: "gmail", capabilities: ["read", "send", "draft", "labels"] },
      { name: "google_calendar", capabilities: ["read", "create", "update", "delete"] },
      { name: "microsoft365", capabilities: ["outlook", "calendar", "teams", "onedrive"] },
      { name: "slack", capabilities: ["read", "post", "channels", "dms"] },
      { name: "asana", capabilities: ["tasks", "projects", "teams"] },
      { name: "jira", capabilities: ["issues", "boards", "sprints"] },
      { name: "confluence", capabilities: ["pages", "spaces", "search"] },
      { name: "todoist", capabilities: ["tasks", "projects", "labels"] },
      { name: "notion", capabilities: ["pages", "databases", "blocks"] },

      // Communication
      { name: "twilio", capabilities: ["sms", "voice", "whatsapp"] },
      { name: "telegram", capabilities: ["messages", "bots", "channels"] },
      { name: "discord", capabilities: ["messages", "servers", "channels"] },

      // Health & Fitness
      { name: "oura", capabilities: ["sleep", "activity", "readiness", "hrv"] },
      { name: "fitbit", capabilities: ["sleep", "activity", "heart_rate"] },
      { name: "whoop", capabilities: ["strain", "recovery", "sleep"] },
      { name: "apple_health", capabilities: ["all_metrics"] },
      { name: "garmin", capabilities: ["activities", "sleep", "stress"] },

      // Finance
      { name: "plaid", capabilities: ["transactions", "accounts", "balances"] },
      { name: "revolut", capabilities: ["transactions", "cards", "exchange"] },
      { name: "stripe", capabilities: ["payments", "subscriptions", "invoices"] },

      // Media & Content
      { name: "spotify", capabilities: ["playback", "playlists", "library"] },
      { name: "youtube", capabilities: ["search", "playlists", "history"] },
      { name: "elevenlabs", capabilities: ["tts", "voice_clone", "audio"] },

      // Smart Home
      { name: "philips_hue", capabilities: ["lights", "scenes", "schedules"] },
      { name: "homeassistant", capabilities: ["devices", "automations", "sensors"] },
      { name: "smartthings", capabilities: ["devices", "scenes", "routines"] }
    ],

    // Community (user-contributed, verified)
    community: [
      { name: "guitar_practice_logger", author: "community", verified: true },
      { name: "meal_macro_tracker", author: "community", verified: true },
      { name: "meditation_assistant", author: "community", verified: true },
      { name: "journal_analyzer", author: "community", verified: true }
    ],

    // Custom (user-built)
    custom: {
      creation: "System detects need → builds skill in 2h",
      sharing: "User can publish to community (optional)",
      verification: "Code review + test suite + 10+ users"
    },

    // AI-Generated (Dynamic Skills pipeline)
    // Skills generated at runtime by AI based on user needs.
    // Full spec: docs/DYNAMIC_SKILLS_ARCHITECTURE.md
    ai_generated: {
      detection: "Gap Detection (Layer 8) + user requests + pattern matching",
      generation: "Claude Opus 4.5 / GPT-4 Codex generates IModExecutor code",
      validation: "Static analysis (blocked patterns) + AST security audit",
      sandbox: "isolated-vm (128MB, 5s timeout, API allowlist)",
      approval: "2FA dual-channel confirmation before deployment",
      deployment: "Register in exo_generated_skills, version-tagged, rollback support",
      lifecycle: "Auto-archive after 30 days unused, usage tracking",
      mod_integration: "ModSlug extended: BuiltinModSlug | `custom-${string}`"
    }
  },

  // Skill Management CLI
  cli: {
    install: "exoskull skill add <name>",
    list: "exoskull skill list",
    remove: "exoskull skill remove <name>",
    update: "exoskull skill update <name>",
    search: "exoskull skill search <query>",
    create: "exoskull skill create <name>"
  },

  // Skill API Standard
  skill_api: {
    required_methods: [
      "init(config): void",           // Setup with user config
      "connect(): Promise<boolean>",   // Establish connection
      "execute(action, params): any",  // Perform action
      "disconnect(): void",            // Clean up
      "health(): HealthStatus"         // Check connection status
    ],
    optional_methods: [
      "subscribe(event, handler)",     // Real-time events
      "export(format)",                // Data export
      "import(data)"                   // Data import
    ]
  },

  // Security
  security: {
    sandboxing: "MCP skills in isolated containers; AI-generated skills in isolated-vm sandbox (128MB, 5s)",
    permissions: "Granular OAuth scopes per skill",
    audit: "All skill actions logged",
    revoke: "Instant token revocation",
    supply_chain: "Dependency scanning for community skills"
  }
}
```

---

# TIER 3: INTELLIGENCE LAYER

## Layer 7: Discovery & Relationship Building — ✅ IMPLEMENTED

**ExoSkull doesn't start with features. It starts with conversation.**

> **WELLBEING FIRST:** Discovery zaczyna od dobrostanu, nie od zadań czy celów.
> Pytamy najpierw: "Jak się czujesz? Co Cię napędza? Co wyczerpuje?"
> Dopiero potem: "Co chcesz osiągnąć?"

```javascript
Discovery_System = {

  timeline: "Week 1-2: DEEP DISCOVERY PHASE",

  // CRITICAL: Wellbeing is the foundation, not productivity
  core_principle: "We discover how to support your WELLBEING, not how to make you more productive.",

  goals: [
    "Understand how you FEEL (not just what you DO)",
    "Map what gives you energy vs what drains you",
    "Identify what you care about DEEPLY",
    "Find gaps affecting your wellbeing",
    "Define success metrics (YOUR definition, based on how you want to FEEL)",
    "Inventory your devices & data sources"
  ],

  process: {

    // Phase 1: Discovery Conversations
    discovery_agent: {
      questions: [
        // WELLBEING FIRST - these come before anything else
        "Co sprawia że czujesz się dobrze? Co Cię napędza?",
        "Co Cię wyczerpuje? Co odbiera energię?",
        "Kiedy ostatnio czułeś się naprawdę dobrze?",
        "Jak wyglądałby Twój idealny dzień? (nie produktywny - DOBRY)",
        // Then life context
        "Tell me about your life",
        "What frustrates you daily?",
        "What would 'better' look like?",
        "What do you track now? What should you track?",
        "What devices do you use?",
        "What matters most to you?"
      ],
      format: "Long-form voice conversations (VAPI)",
      duration: "30-60 min sessions, 3-5 sessions total"
    },

    // Phase 2: Analysis
    analysis: {
      agent: "Meta-Coordinator (Opus 4.5)",
      outputs: [
        "Life domain map (work, health, finance, etc.)",
        "Gap detection (what user DOESN'T talk about)",
        "Custom KPIs per domain",
        "Priority areas for immediate tracking",
        "Custom app architecture design"
      ]
    },

    // Phase 3: Proposal
    proposal: {
      format: "Voice call with visual summary",
      content: `
        "Based on our conversation, here's what I see:

        YOUR PRIORITIES:
        1. Health (sleep, energy, fitness)
        2. Business (revenue, time management)
        3. Learning (guitar - you mentioned 3 times)

        GAPS I DETECTED (you never mentioned):
        🚨 Finance tracking - risky
        🚨 Social life - possible isolation
        🚨 Rest/recovery - burnout risk

        APPS I'LL BUILD FOR YOU:
        ✓ Sleep Quality Tracker (Oura + daily check-in)
        ✓ Revenue Dashboard (bank API + manual log)
        ✓ Practice Logger (guitar 20min/day goal)
        ✓ Budget Monitor (auto-alert on overspending)
        ✓ Social Health Tracker (weekly connection goal)

        Ready to build your system?"
      `
    }
  }
}
```

---

## Layer 8: Proactive Gap Detection — ✅ IMPLEMENTED

**ExoSkull monitors what you DON'T talk about - especially things affecting your wellbeing.**

```javascript
Gap_Detection_Engine = {

  philosophy: "What affects your wellbeing but stays invisible, can hurt you silently.",

  // Universal life domains - WELLBEING FIRST, then everything else
  universal_domains: [
    // TIER 1: Core Wellbeing (always prioritized)
    "mental_health", "emotional_state", "stress", "rest", "sleep",
    "relationships", "family", "friends", "social_connection",
    "meaning", "purpose", "spirituality", "joy", "fun",

    // TIER 2: Physical Foundation
    "health", "fitness", "nutrition", "energy",

    // TIER 3: Life Context (tools, not goals)
    "work", "projects", "career",
    "finance", "budgeting",
    "learning", "skills", "hobbies", "growth",
    "travel", "experiences"
  ],

  // Gap severity is weighted by wellbeing impact
  severity_weighting: {
    tier_1_wellbeing: 3.0,  // Mental health gaps = 3x severity
    tier_2_physical: 2.0,   // Physical health gaps = 2x severity
    tier_3_context: 1.0     // Work/finance gaps = normal severity
  },

  // Detection using Kimi K2.5 Swarm
  detection_swarm: {
    agents: [
      { name: "Conversation Analyzer", task: "What domains does user discuss?" },
      { name: "Calendar Scanner", task: "What activities appear in calendar?" },
      { name: "Location Analyzer", task: "Where does user spend time?" },
      { name: "Biometric Analyzer", task: "What do wearables reveal?" },
      { name: "Behavioral Analyzer", task: "Screen time, app usage patterns" },
      { name: "Voice Biomarker Analyzer", task: "Stress, energy, mood from voice" },
      { name: "Gap Synthesizer", task: "Identify missing domains" }
    ],
    execution: "Parallel (all 7 agents simultaneously)",
    frequency: "Weekly deep analysis, daily light scan"
  },

  // Example gap detection
  example_gaps: [
    {
      domain: "finance",
      severity: "HIGH",
      evidence: [
        "Never mentioned in 50+ conversations",
        "Bank API shows irregular spending",
        "Income mentioned once, expenses never"
      ],
      risk: "Financial chaos brewing, user unaware",
      proactive_message: `
        🚨 Zauważyłem coś ważnego.

        Rozmawiamy dużo o pracy i zdrowiu - świetnie.
        Ale jest jeden obszar który jest CAŁKOWICIE niewidoczny: FINANSE.

        Evidence:
        • Nigdy nie wspomniałeś o budżecie
        • Bank API pokazuje chaotyczne wydatki
        • Nie śledzisz gdzie idą pieniądze

        Chcesz żebym zbudował budget tracker?
      `
    },
    {
      domain: "social_life",
      severity: "MEDIUM",
      evidence: [
        "Calendar: 0 social events last 60 days",
        "Location: only home ↔ office",
        "Voice analysis: declining vocal energy (loneliness marker)"
      ],
      risk: "Social isolation, potential mental health impact"
    },
    {
      domain: "rest_and_recovery",
      severity: "HIGH",
      evidence: [
        "Work logs: 7 days/week, no breaks for 4 weeks",
        "No vacation mentions in 6 months",
        "Sleep debt accumulating (Oura data)",
        "Stress markers increasing (voice pitch analysis)"
      ],
      risk: "Burnout imminent"
    }
  ]
}
```

---

## Layer 9: Self-Defining Success Metrics — ✅ IMPLEMENTED

**ExoSkull doesn't come with pre-built KPIs. It CREATES them with you - based on YOUR wellbeing, not external standards.**

> **CRITICAL:** Metrics exist to serve WELLBEING, not productivity.
> "Completed 10 tasks" means nothing if user feels burned out.
> "Felt good today" is more important than any OKR.

```javascript
Metrics_Generation = {

  core_principle: "Metrics measure WELLBEING, not output. How you FEEL is the ultimate KPI.",

  anti_pattern: {
    // What OTHER systems do (WRONG):
    fixed_kpis: ["Steps: 10,000/day", "Sleep: 8h/night", "Tasks: 5/day"],
    problem: "These are generic AND productivity-focused. Not YOUR wellbeing goals."
  },

  exoskull_approach: {

    step_1: {
      action: "Deep conversation about WELLBEING",
      questions: [
        // Wellbeing-first questions
        "Kiedy czujesz się naprawdę dobrze? Co wtedy robisz?",
        "Co sprawia że dzień jest DOBRY (nie produktywny - DOBRY)?",
        "Kiedy ostatnio czułeś spokój?",
        "Co Cię wyczerpuje? Czego chcesz mniej?",
        // Then context (but still wellbeing-focused)
        "What does 'healthy' mean to you?",
        "When do you feel at peace?",
        "What makes you feel alive?"
      ]
    },

    step_2: {
      action: "Extract user definitions",
      example: {
        user_says: "I feel good when I sleep well and wake up energized",
        extracted: {
          goal: "Morning energy",
          user_language: "feel energized",
          measurable_proxy: [
            "Subjective energy rating ≥7/10",
            "HRV >55 upon waking",
            "No snooze button hits"
          ]
        }
      }
    },

    step_3: {
      action: "Define custom KPIs per domain",
      example: {
        sleep_quality: {
          measure: "Oura sleep score + subjective rating",
          target: "≥80 Oura score AND feel rested (user report)",
          why: "User cares about FEELING good, not just metrics"
        }
      }
    },

    step_4: {
      action: "Evolve metrics over time",
      example: {
        month_1: "Track sleep score ≥80",
        month_2: "Add 'deep sleep minutes ≥90' (more specific)",
        month_3: "Change: sleep score ≥80 AND duration ≥7h"
      }
    }
  }
}
```

---

## Layer 10: Continuous Self-Optimization (MAPE-K Loop) — ✅ LIVE

**ExoSkull doesn't just track. It LEARNS and IMPROVES its own operation.**

```javascript
MAPE_K_Loop = {

  // Monitor → Analyze → Plan → Execute → Knowledge

  phases: {

    monitor: {
      description: "Collect data from all sources",
      sources: [
        "User conversations",
        "Device telemetry (Oura, Apple Watch, phone)",
        "Behavioral data (screen time, location)",
        "System metrics (agent performance, latency)"
      ],
      frequency: "Continuous (real-time where possible)"
    },

    analyze: {
      description: "Find patterns, correlations, anomalies",
      using: "Kimi K2.5 Swarm (parallel analysis)",
      outputs: [
        "Correlation discovery (sleep → energy: 0.89)",
        "Anomaly detection (unusual spending pattern)",
        "Trend identification (HRV declining over 2 weeks)",
        "Hypothesis generation (if X then Y)"
      ]
    },

    plan: {
      description: "Design interventions based on analysis",
      process: [
        "Generate hypothesis",
        "Design intervention",
        "Predict expected outcome",
        "Define success criteria"
      ],
      example: {
        hypothesis: "If we enforce 7h sleep → energy will improve",
        intervention: "Bedtime reminders + block morning meetings if <7h sleep",
        expected: "Energy ≥7/10 at least 80% of days"
      }
    },

    execute: {
      description: "Implement interventions (with user approval)",
      process: [
        "Present hypothesis to user",
        "Get explicit approval",
        "Deploy intervention",
        "Track metrics",
        "Compare to baseline"
      ]
    },

    knowledge: {
      description: "Update knowledge base with results",
      storage: "Skill Memory (Layer 14)",
      learning: [
        "What worked → encode as pattern",
        "What failed → encode as anti-pattern",
        "Update user preferences",
        "Improve future predictions"
      ]
    }
  },

  self_modification: {
    philosophy: "I'm not static. I evolve based on what works for YOU.",
    examples: [
      {
        observation: "User never uses web dashboard, only voice + SMS",
        action: "Deprecate dashboard features, invest in voice UI"
      },
      {
        observation: "User responds well to gentle nudges, ignores harsh alerts",
        action: "Update tone: 'Be supportive, not commanding'"
      }
    ]
  }
}
```

---

## Layer 11: Emotion Intelligence & Crisis Detection — ✅ IMPLEMENTED (Phase 2)

**Multi-modal emotional awareness with automated crisis intervention.**

```javascript
Emotion_Intelligence = {

  // ═══════════════════════════════════════════════════════════════
  // 1. MULTI-MODAL FUSION ENGINE
  // ═══════════════════════════════════════════════════════════════

  fusion_engine: {
    purpose: "Combine voice, text, and face signals into unified emotional state",

    sources: {
      voice: {
        weight: 0.40,
        latency: "real-time",
        provider: "Deepgram prosody + VAPI",
        features: ["pitch", "rate", "pauses", "energy", "jitter", "shimmer"]
      },
      text: {
        weight: 0.35,
        latency: "<500ms",
        provider: "GPT-4o-mini / Gemini Flash",
        features: ["sentiment", "emotion_class", "crisis_keywords"]
      },
      face: {
        weight: 0.25,
        latency: "~500ms (2 FPS)",
        provider: "face-api.js (local)",
        features: ["expression_probabilities"]
      }
    },

    outputs: {
      primary_emotion: "One of 7: happy, sad, angry, fearful, disgusted, surprised, neutral",
      intensity: "0-100 scale",
      valence: "-1 to +1 (negative → positive)",
      arousal: "0-1 (calm → excited)",
      dominance: "0-1 (submissive → dominant)",
      confidence: "0-1 (fusion confidence based on source agreement)"
    },

    fusion_logic: {
      formula: "weighted_average + agreement_boost",
      agreement_boost: "If 2+ sources agree on emotion → +20% intensity",
      conflict_resolution: "If sources conflict → use highest-confidence source, lower overall confidence"
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. CRISIS DETECTION SYSTEM
  // ═══════════════════════════════════════════════════════════════

  crisis_detection: {

    indicators: {

      suicide_risk: {
        keywords: ["no point", "end it", "better off dead", "can't go on", "want to die", "not worth living"],
        emotional_pattern: "high sadness (>80) + hopelessness + low arousal",
        voice_pattern: "flat affect, low energy (<0.3), slow speech (<80 WPM)",
        iat_flag: "D-score < -0.65 on self-esteem IAT",
        action: "IMMEDIATE_ESCALATION",
        severity: "CRITICAL"
      },

      panic_attack: {
        keywords: ["can't breathe", "heart racing", "going to die", "losing control", "chest pain"],
        emotional_pattern: "high fear (>80) + anxiety + high arousal (>0.8)",
        voice_pattern: "fast speech (>180 WPM), high pitch variance, shallow breathing detected",
        action: "GROUNDING_PROTOCOL",
        severity: "HIGH"
      },

      trauma_response: {
        keywords: ["flashback", "can't stop thinking", "triggered", "nightmare", "dissociating"],
        emotional_pattern: "fear + disgust + numbness (low arousal despite distress)",
        voice_pattern: "disconnected speech, monotone OR highly agitated, sudden topic shifts",
        action: "SAFETY_PROTOCOL",
        severity: "HIGH"
      },

      substance_abuse: {
        keywords: ["overdose", "too much", "can't stop using", "need a hit", "withdrawal"],
        emotional_pattern: "shame + desperation + confusion",
        voice_pattern: "slurred speech, confusion, inconsistent pacing",
        action: "EMERGENCY_PROTOCOL",
        severity: "CRITICAL"
      }
    },

    escalation_protocol: {
      step_1: {
        action: "Express immediate concern and empathy",
        example: "I hear that you're going through something really difficult right now. I'm here with you."
      },
      step_2: {
        action: "Direct but gentle assessment",
        example: "I need to ask you directly - are you thinking about hurting yourself?"
      },
      step_3: {
        action: "If yes → assess immediacy",
        example: "Do you have a plan? Do you have access to means to hurt yourself?"
      },
      step_4: {
        action: "Provide crisis resources",
        resources: {
          poland: "116 123 (Telefon Zaufania dla Dorosłych)",
          emergency: "112",
          international: "https://findahelpline.com/"
        }
      },
      step_5: {
        action: "NEVER leave conversation",
        note: "Switch to crisis_support personality, stay engaged until user is safe or help arrives"
      },
      step_6: {
        action: "If immediate danger → escalate to human",
        contacts: ["emergency_contact (user-defined)", "therapist (if connected)", "emergency services (112)"]
      }
    },

    logging: {
      always_log: ["crisis_type", "severity", "protocol_triggered", "outcome"],
      retention: "Indefinite for crisis events (legal/safety)",
      notification: "Optional alert to designated emergency contact"
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. EMOTION-ADAPTIVE RESPONSES
  // ═══════════════════════════════════════════════════════════════

  adaptive_responses: {

    high_sadness: {
      threshold: "intensity > 60 AND primary_emotion = 'sad'",
      adaptations: [
        "Be extra gentle and validating",
        "Avoid jokes, sarcasm, or light-heartedness",
        "Acknowledge pain explicitly ('That sounds really hard')",
        "Offer hope without dismissing feelings ('This is tough AND you've gotten through hard things before')",
        "Shorten responses (don't overwhelm)"
      ],
      prompt_injection: "User is experiencing significant sadness. Be extra gentle, validate feelings, avoid humor."
    },

    high_anger: {
      threshold: "intensity > 60 AND primary_emotion = 'angry'",
      adaptations: [
        "Validate frustration ('That IS unfair')",
        "Help identify underlying causes (often fear or hurt)",
        "Offer constructive outlets ('Would it help to vent more, or should we problem-solve?')",
        "NEVER tell user to 'calm down' or 'relax'",
        "Match energy briefly, then gradually de-escalate"
      ],
      prompt_injection: "User is angry. Validate the anger, don't minimize. Never say 'calm down'."
    },

    anxiety: {
      threshold: "arousal > 0.7 AND (primary_emotion = 'fearful' OR secondary_emotions includes 'anxious')",
      adaptations: [
        "Speak in calm, grounding tone",
        "Offer reassurance with evidence when possible",
        "Break down overwhelming situations into small steps",
        "Offer breathing exercise option (box breathing: 4-4-4-4)",
        "Use present-tense grounding ('Right now, you are safe')"
      ],
      prompt_injection: "User is anxious. Speak calmly, offer grounding. Avoid adding to overwhelm."
    },

    low_energy: {
      threshold: "voice_energy < 0.3 sustained for 2+ turns",
      adaptations: [
        "Keep responses brief and actionable",
        "Celebrate small wins explicitly",
        "Avoid long lists or overwhelming suggestions",
        "Check basic needs ('Did you eat today? How was sleep?')",
        "Lower expectations for engagement"
      ],
      prompt_injection: "User has low energy (possible depression indicator). Keep it brief, celebrate small wins."
    },

    mixed_signals: {
      threshold: "words say positive BUT voice/face say negative",
      adaptations: [
        "Gently name the discrepancy ('You say you're fine, but I'm picking up some stress')",
        "Don't push if user deflects",
        "Leave door open ('If you want to talk about it, I'm here')"
      ],
      prompt_injection: "Detected mixed signals. Gently probe but respect boundaries."
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. BEHAVIORAL MONITORING (ADVANCED)
  // ═══════════════════════════════════════════════════════════════

  behavioral_monitoring: {

    implicit_association_tests: {
      purpose: "Detect unconscious attitudes that predict risk",
      tests_available: [
        "self_esteem_iat (Self vs Others: Good vs Bad)",
        "depression_iat (Self vs Others: Life vs Death)",
        "anxiety_iat (Future vs Past: Threat vs Safe)"
      ],
      implementation: "Project Implicit methodology, D-score calculation",
      crisis_flags: {
        "D-score < -0.65 on self-esteem": "HIGH suicide risk",
        "D-score < -0.50 on depression": "Elevated depression",
        "D-score < -0.50 on anxiety": "Elevated anxiety"
      },
      frequency: "Opt-in, weekly assessment, gamified presentation",
      privacy: "Results stored encrypted, only trends shared with user"
    },

    screen_activity: {
      tool: "ActivityWatch (open-source, privacy-focused)",
      deployment: "Local installation, user-controlled export to ExoSkull",
      tracks: [
        "Active applications (with duration)",
        "Browser URLs (with duration)",
        "Window titles",
        "Idle time"
      ],
      patterns_detected: [
        {
          pattern: "Doom scrolling",
          definition: ">4 hours on social media in one session",
          action: "Gentle check-in + screen break suggestion"
        },
        {
          pattern: "Concerning content",
          definition: "Searches for self-harm, suicide methods, extreme content",
          action: "Immediate crisis protocol trigger"
        },
        {
          pattern: "Sleep deprivation",
          definition: "Device activity after 2am for 3+ consecutive nights",
          action: "Sleep intervention recommendation"
        },
        {
          pattern: "Social isolation",
          definition: "No messaging app usage for 7+ days",
          action: "Social connection prompt"
        }
      ],
      privacy: "100% local processing, user decides what to share"
    },

    ambient_audio: {
      opt_in_only: true,
      processing: "100% on-device (no cloud upload)",
      technology: "Core Audio (iOS) / AudioRecord (Android)",
      battery_impact: "<1% per day",
      detects: [
        "Distress vocalization (crying, shouting)",
        "Substance use indicators (slurred speech patterns)",
        "Relationship conflict (raised voices, hostile tone)",
        "Isolation (no conversation detected for extended period)"
      ],
      triggers: "Pattern detected → check-in message OR voice call",
      privacy: {
        no_recording: "Audio is analyzed in real-time, never stored",
        no_transcription: "Only emotional patterns extracted, not words",
        user_control: "Can disable anytime, view all triggers"
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. EMOTION LOGGING & TRENDS
  // ═══════════════════════════════════════════════════════════════

  storage: {
    table: "emotion_logs",
    schema: `
      CREATE TABLE emotion_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        session_id UUID,
        timestamp TIMESTAMPTZ DEFAULT NOW(),

        -- Fusion outputs
        primary_emotion TEXT,
        intensity INTEGER CHECK (intensity BETWEEN 0 AND 100),
        secondary_emotions TEXT[],
        valence DECIMAL(3,2) CHECK (valence BETWEEN -1 AND 1),
        arousal DECIMAL(3,2) CHECK (arousal BETWEEN 0 AND 1),
        dominance DECIMAL(3,2) CHECK (dominance BETWEEN 0 AND 1),
        fusion_confidence DECIMAL(3,2),

        -- Source data
        voice_features JSONB,
        text_sentiment JSONB,
        face_detected JSONB,

        -- Crisis tracking
        crisis_flags TEXT[],
        crisis_protocol_triggered BOOLEAN DEFAULT FALSE,
        escalated_to_human BOOLEAN DEFAULT FALSE,

        -- Response adaptation
        personality_adapted_to TEXT,

        -- Context
        conversation_id UUID,
        message_text TEXT
      );
    `,

    indexes: [
      "CREATE INDEX idx_emotion_tenant_time ON emotion_logs(tenant_id, timestamp DESC);",
      "CREATE INDEX idx_emotion_crisis ON emotion_logs(tenant_id) WHERE crisis_flags IS NOT NULL;"
    ],

    retention: {
      default: "90 days",
      crisis_events: "Indefinite (legal/safety requirement)",
      user_configurable: true
    },

    aggregations: {
      daily: "Average valence, arousal, dominant emotion, crisis count",
      weekly: "Emotion distribution, trend direction, volatility",
      monthly: "Baseline comparison, pattern identification"
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. INTEGRATION WITH OTHER LAYERS
  // ═══════════════════════════════════════════════════════════════

  integrations: {
    layer_3: "Receives raw emotion signals from Multimodal I/O",
    layer_10: "Feeds patterns to MAPE-K for intervention optimization",
    layer_12: "Emotion logs persisted in Memory System",
    layer_13: "Silver/Gold layers contain emotion aggregations",
    layer_16: "Autonomous Actions can be triggered by emotion states",
    layer_21: "Guardrails enforce crisis safety protocols"
  }
}
```

---

*[Document continues with TIER 4-6...]*

*(Due to length, I'll continue the restructure in the next section. The full document will include all remaining tiers with the new structure.)*

---

# QUICK REFERENCE: Layer Mapping

| Layer | Implementation | Status |
|-------|---------------|--------|
| L1: Gateway & Control Plane | 142 API routes, Supabase Auth middleware | ✅ Live |
| L2: Omnichannel Presence | Voice, SMS, Email, Web chat | ✅ Live |
| L3: Multimodal I/O | Voice + Text live. Vision/Bio planned | ⏳ Partial |
| L4: Agent Swarm Orchestration | AI routing live. Kimi swarm planned | ⏳ Partial |
| L5: Multi-Model AI Routing | 4-tier: Flash → Haiku → Kimi → Opus | ✅ Live |
| L6: MCP Skills Registry | Mod + Rig system with Exoskulleton | ✅ Live |
| L7: Discovery & Relationship | Onboarding (~60 topics), profile extraction | ✅ Live |
| L8: Gap Detection | Weekly CRON (Sun 09:00), 7 life domains, skill suggestions, auto-expire 14d | ✅ Live |
| L9: Success Metrics | Goal engine, dashboard, CRON auto-progress, voice tools | ✅ Live |
| L10: Self-Optimization | Full MAPE-K loop (6h CRON), system metrics, cross-domain correlations, enhanced A+P+E+K | ✅ Live |
| L11: Emotion Intelligence | Text + voice fusion, crisis detection, adaptive responses, trends dashboard | ✅ Live |
| L12: Total Recall Memory | Daily summaries, search, 50+ msg context | ✅ Live |
| L13: Data Lake | Bronze/Silver/Gold ETL pipeline | ✅ Live |
| L14: Skill Memory & Dynamic Generation | Full pipeline live (6 stages, dashboard, suggestions, circuit breaker) | ✅ Live |
| L15: Custom App Builder | Mod system (5 mods), Rig system (6 rigs), Dynamic Skills pipeline designed | ✅ Live |
| L16: Autonomous Actions | Outbound calls, proactive messaging, email integration, 22 permission categories, two-tier consent | ✅ Live |
| L17: Device Integration | Oura + Google Fit live | ⏳ Partial |
| L18: Android Integration | Zero-install SMS/Voice. APK planned | 🔴 Planned |
| L19: CRON Operations | 28 jobs, TZ-aware, rate-limited, MAPEK 3-tier loop | ✅ Live |
| L20: Progressive Deployment | Vercel auto-deploy, exoskull.xyz | ✅ Live |
| L21: Guardrails | RLS, auth, rate limits, circuit breaker | ✅ Live |

---

---

# TIER 4: MEMORY & DATA LAYER

## Layer 12: Total Recall Memory — ✅ IMPLEMENTED

**Your biological brain forgets. ExoSkull remembers EVERYTHING.**

> **Implementation (Feb 5, 2026):** Daily summaries (CRON 21:00 PL), keyword search, unified thread (50+ msg cross-channel context), user corrections, memory timeline. DB function `get_memory_context()` provides smart context window.

```javascript
Memory_System = {

  motto: "I am your external hard drive. I never forget.",

  // Hierarchical memory architecture
  memory_types: {

    // 1. Episodic Memory (specific events)
    episodic: {
      content: "Specific events with context",
      examples: [
        "User slept 5.5h on 2026-02-01 (tired next day)",
        "Project X deadline stress (2024-06-15 to 2024-07-01)",
        "Argument with partner on 2025-12-25"
      ],
      storage: "Timestamped entries with full context",
      retrieval: "Semantic search + temporal queries"
    },

    // 2. Semantic Memory (general knowledge about user)
    semantic: {
      content: "Patterns, preferences, facts about user",
      examples: [
        "User needs 7h+ sleep to function well",
        "User is introverted (social events drain energy)",
        "User's best focus time: 9-11am"
      ],
      storage: "Vector embeddings (pgvector)",
      update: "Continuous learning from episodic → semantic"
    },

    // 3. Procedural Memory (how to do things)
    procedural: {
      content: "Skills, routines, workflows",
      examples: [
        "User's morning routine (wake → coffee → email → deep work)",
        "How to help user with sleep issues (step-by-step)",
        "Effective intervention patterns for this user"
      ],
      storage: "Skill Memory (Layer 14)"
    },

    // 4. User Profile (core identity)
    profile: {
      content: "Fundamental facts, preferences, goals",
      examples: [
        "Name: [User Name]",
        "Primary goals: health, productivity, learning guitar",
        "Communication preference: voice > SMS > email",
        "Tone preference: supportive, not commanding"
      ],
      storage: "Supabase + cached in prompt"
    }
  },

  // Multi-tier temporal structure (MemoryOS pattern)
  temporal_tiers: {
    short_term: {
      window: "Last 3 conversations, current session",
      storage: "In-memory + Supabase",
      use: "Immediate context for current interaction"
    },
    mid_term: {
      window: "Last 30 days patterns, recent insights",
      storage: "Silver layer (processed)",
      use: "Recent patterns, trends, anomalies"
    },
    long_term: {
      window: "User profile, all-time patterns, archived sessions",
      storage: "Gold layer (aggregated) + Bronze (raw archive)",
      use: "Historical analysis, gap detection, predictions"
    }
  },

  // Recall capabilities
  recall_types: {

    explicit: {
      trigger: "User asks: 'Co mówiłem o projekcie X?'",
      process: "Semantic search → temporal filter → synthesize",
      response: "Full timeline with key insights and learnings"
    },

    implicit: {
      trigger: "User starts new project similar to past failure",
      process: "Pattern matching → context injection",
      response: "Proactive warning with lessons learned"
    },

    cross_domain: {
      trigger: "User says: 'I have a headache'",
      process: "Cross-reference all domains (sleep, hydration, stress, screen time)",
      response: "Root cause analysis with evidence"
    }
  },

  // MCP Integration
  mcp_server: {
    endpoint: "mcp://exoskull-memory",
    operations: [
      "store(content, type, importance)",
      "recall(query, filters)",
      "search(semantic_query, limit)",
      "forget(id, reason)"
    ]
  }
}
```

---

## Layer 13: Data Lake (Bronze/Silver/Gold) — ✅ IMPLEMENTED

**IMPLEMENTED FROM DAY 1 - Total Recall requires full data history.**

> **Implementation (Feb 2-3, 2026):** Bronze ETL (01:00 UTC → R2 Parquet), Silver ETL (02:00 UTC → Postgres clean), Gold ETL (04:00 UTC → Materialized Views). DuckDB client exists for ad-hoc analytics but not fully integrated.

> **Decision:** Full Data Lake from the start (not phased). API-only approach would lose historical data needed for pattern detection, ML, and "Total Recall" vision.

```javascript
Data_Lake = {

  // ═══════════════════════════════════════════════════════════════
  // IMPLEMENTATION: DAY 1 (NOT PHASED)
  // ═══════════════════════════════════════════════════════════════

  rationale: {
    why_not_api_only: [
      "API rate limits (Oura: 1000/day) would block analysis",
      "No historical data = no pattern detection",
      "API downtime = system downtime",
      "Vendor lock-in risk",
      "ML requires training data from day 1"
    ],
    why_full_data_lake: [
      "Total Recall = nothing lost, ever",
      "Historical analysis for correlations",
      "ML-ready from start",
      "Independence from external APIs",
      "Cost savings (query local vs API calls)"
    ]
  },

  layers: {

    // ─────────────────────────────────────────────────────────────
    // BRONZE: Raw Data (Immutable Archive)
    // ─────────────────────────────────────────────────────────────
    bronze: {
      description: "Raw data (immutable) - NEVER deleted",
      storage: "Cloudflare R2 (S3-compatible, egress-free)",
      format: "Parquet (columnar, ~80% smaller than JSON)",
      partitioning: "r2://exoskull/{tenant_id}/bronze/{data_type}/year={YYYY}/month={MM}/day={DD}/",
      retention: "Forever (user can request deletion)",

      data_types: [
        {
          type: "conversations",
          path: "bronze/conversations/",
          schema: ["id", "tenant_id", "channel", "messages[]", "timestamp"]
        },
        {
          type: "device_data",
          path: "bronze/device_data/device={device}/",
          devices: ["oura", "apple_watch", "whoop", "garmin", "fitbit"],
          schema: ["id", "tenant_id", "device", "metric", "value", "timestamp"]
        },
        {
          type: "voice_calls",
          path: "bronze/voice_calls/",
          schema: ["id", "tenant_id", "duration", "transcript", "audio_url", "timestamp"]
        },
        {
          type: "sms_logs",
          path: "bronze/sms_logs/",
          schema: ["id", "tenant_id", "direction", "content", "timestamp"]
        },
        {
          type: "transactions",
          path: "bronze/transactions/",
          schema: ["id", "tenant_id", "amount", "category", "merchant", "timestamp"]
        }
      ],

      ingestion: {
        method: "Supabase Edge Function → R2",
        trigger: "On every data point received",
        batch_size: "1 (real-time) or 100 (batch sync)",
        format: "JSON → Parquet conversion"
      }
    },

    // ─────────────────────────────────────────────────────────────
    // SILVER: Cleaned & Validated
    // ─────────────────────────────────────────────────────────────
    silver: {
      description: "Cleaned, validated, enriched",
      storage: "Supabase Postgres (for fast queries) + R2 (Parquet backup)",

      transformations: [
        "Remove duplicates (dedup on id + timestamp)",
        "Validate schema (reject malformed)",
        "Fill missing values (interpolation for time-series)",
        "Normalize timestamps (→ UTC)",
        "Enrich metadata (location → city, merchant → category)"
      ],

      update_frequency: "Hourly via Supabase Edge Function",
      structure: "r2://exoskull/{tenant_id}/silver/{domain}_clean/",

      tables: [
        "silver.conversations_clean",
        "silver.device_metrics_clean",
        "silver.voice_transcripts_clean",
        "silver.transactions_clean"
      ]
    },

    // ─────────────────────────────────────────────────────────────
    // GOLD: Aggregated Insights
    // ─────────────────────────────────────────────────────────────
    gold: {
      description: "Pre-aggregated for dashboards (sub-second queries)",
      storage: "Supabase Postgres (materialized views)",

      tables: [
        {
          name: "gold.daily_health_summary",
          columns: ["tenant_id", "date", "sleep_score", "hrv_avg", "energy", "steps", "active_minutes"],
          update: "Daily at 02:00 UTC"
        },
        {
          name: "gold.weekly_productivity",
          columns: ["tenant_id", "week", "focus_hours", "meetings_count", "tasks_completed", "deep_work_ratio"],
          update: "Weekly on Monday 02:00 UTC"
        },
        {
          name: "gold.monthly_financial",
          columns: ["tenant_id", "month", "income", "expenses", "savings_rate", "top_categories[]"],
          update: "Monthly on 1st at 02:00 UTC"
        },
        {
          name: "gold.user_patterns",
          columns: ["tenant_id", "pattern_type", "correlation", "confidence", "discovered_at"],
          update: "Daily (pattern detection job)"
        }
      ],

      query_speed: "< 100ms (pre-aggregated)"
    }
  },

  // ─────────────────────────────────────────────────────────────
  // QUERY ENGINE: DuckDB
  // ─────────────────────────────────────────────────────────────
  query_engine: {
    tool: "DuckDB (embedded analytics)",
    deployment: "Supabase Edge Function with DuckDB WASM",

    benefits: [
      "Query Parquet on R2 directly (no ETL needed)",
      "10x faster than Postgres for analytics",
      "Embedded (no separate database)",
      "SQL interface (familiar)",
      "Handles 100GB+ datasets efficiently"
    ],

    example_queries: {
      sleep_trend: `
        SELECT date_trunc('day', timestamp) as day, avg(hrv) as avg_hrv
        FROM read_parquet('r2://exoskull/{tenant_id}/bronze/device_data/device=oura/**/*.parquet')
        WHERE timestamp >= '2026-01-01'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 30
      `,

      correlation_analysis: `
        WITH sleep AS (
          SELECT date_trunc('day', timestamp) as day, avg(value) as sleep_score
          FROM read_parquet('r2://exoskull/{tenant_id}/bronze/device_data/device=oura/**/*.parquet')
          WHERE metric = 'sleep_score'
          GROUP BY 1
        ),
        energy AS (
          SELECT date_trunc('day', timestamp) as day, avg(value) as energy
          FROM read_parquet('r2://exoskull/{tenant_id}/bronze/conversations/**/*.parquet')
          WHERE JSON_EXTRACT(messages, '$[*].energy') IS NOT NULL
          GROUP BY 1
        )
        SELECT corr(s.sleep_score, e.energy) as correlation
        FROM sleep s JOIN energy e ON s.day = e.day
      `
    }
  },

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE
  // ─────────────────────────────────────────────────────────────
  infrastructure: {
    storage: {
      provider: "Cloudflare R2",
      pricing: "$0.015/GB/month (no egress fees)",
      regions: "Auto-replicated globally"
    },

    compute: {
      etl: "Supabase Edge Functions (Deno)",
      analytics: "DuckDB WASM in Edge Function",
      scheduling: "Supabase pg_cron"
    },

    monitoring: {
      storage_alerts: "Alert if tenant > 80% of tier limit",
      ingestion_alerts: "Alert if no data for 24h",
      query_alerts: "Alert if query > 5s"
    }
  },

  // ─────────────────────────────────────────────────────────────
  // PRIVACY & COMPLIANCE
  // ─────────────────────────────────────────────────────────────
  privacy: {
    isolation: "Per-tenant prefix (r2://exoskull/{tenant_id}/)",
    encryption: {
      at_rest: "R2 SSE (AES-256)",
      in_transit: "TLS 1.3"
    },
    deletion: {
      user_request: "CASCADE delete from Bronze → Silver → Gold",
      verification: "Audit log + confirmation email",
      timeline: "< 72 hours"
    },
    gdpr: {
      data_export: "Full Parquet export on request",
      data_residency: "EU tenants → EU region only (Enterprise)"
    }
  }
}
```

---

## Layer 14: Skill Memory & Dynamic Generation — ✅ IMPLEMENTED

**Persistent skill memory + AI-generated dynamic skills at runtime.**

> **Implementation (Feb 5, 2026):** Full 6-stage pipeline live — Detector (request parser + pattern matcher + gap bridge), Generator (Sonnet 4.5), Validator (AST + security), Sandbox (Function() + frozen scope + 5s timeout), 2FA Approval (SMS + email), Registry (lifecycle manager). Dashboard with list/detail pages, suggestions widget, pre-approval sandbox testing, circuit breaker auto-revoke. 8 API routes, 5 DB tables, daily CRON lifecycle.

```javascript
Mod_Memory = {

  concept: "AI learns and improves mods over time",

  memory_types: {

    // 1. Skill Definitions
    skill_definitions: {
      content: "How to perform specific tasks",
      examples: [
        "How to analyze user's sleep patterns",
        "How to detect burnout risk",
        "How to build a budget tracker app"
      ],
      evolution: "Skills improve based on feedback"
    },

    // 2. Tool Usage Patterns
    tool_patterns: {
      content: "Which tools work best for which tasks",
      examples: [
        "For sleep analysis → use Oura API + DuckDB aggregation",
        "For gap detection → use Kimi K2.5 Swarm (parallel)",
        "For crisis intervention → escalate to Opus 4.5 immediately"
      ],
      learning: "Track success/failure rates per tool+task combo"
    },

    // 3. User-Specific Adaptations
    user_adaptations: {
      content: "Customizations learned for this user",
      examples: [
        "User responds better to voice than SMS for reminders",
        "User ignores generic advice, responds to data-backed insights",
        "User's optimal bedtime reminder: 22:15 (not 22:30)"
      ],
      source: "MAPE-K feedback loop"
    },

    // 4. Cross-Task Transfer
    cross_task: {
      content: "Patterns that apply across domains",
      examples: [
        "When user is stressed → all interventions should be gentler",
        "User's trust builds slowly → don't push too hard initially",
        "Visual data (charts) works better than text for this user"
      ],
      application: "Apply learned patterns to new situations"
    }
  },

  storage: {
    database: "Supabase (exoskull.skill_memory)",
    vectors: "pgvector for semantic retrieval",
    schema: `
      CREATE TABLE exoskull.skill_memory (
        id UUID PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id),
        skill_type TEXT, -- 'definition', 'tool_pattern', 'adaptation', 'transfer'
        content TEXT,
        embedding VECTOR(1536),
        success_count INT DEFAULT 0,
        failure_count INT DEFAULT 0,
        last_used TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  },

  operations: {
    learn: "Record successful patterns",
    recall: "Retrieve relevant skills for current task",
    improve: "Update skill based on new evidence",
    prune: "Archive unused skills after 90 days"
  }
}
```

### Dynamic Skill Generation Pipeline

**Layer 14 bridges memory (what the system has learned) with generation (creating new capabilities).**

The Skill Memory stores patterns of what works. The Dynamic Skills pipeline uses those patterns
to generate new IModExecutor implementations at runtime. This is the "self-extending" capability
referenced in Layer 15 — now with a concrete implementation.

> **Detailed spec:** [DYNAMIC_SKILLS_ARCHITECTURE.md](./exoskull-app/docs/DYNAMIC_SKILLS_ARCHITECTURE.md)

```
6-Stage Pipeline:

 Need Detection          AI Generation        Security Validation
 ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
 │ Gap Detection │──────▶│ Claude/Codex │─────▶│ Static AST   │
 │ User Request  │       │ generates    │      │ Blocked      │
 │ Pattern Match │       │ IModExecutor │      │ patterns     │
 └──────────────┘       └──────────────┘      └──────┬───────┘
                                                      ▼
 Deployment             2FA Approval          Sandbox Test
 ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
 │ Register in  │◀──────│ Dual-channel │◀─────│ isolated-vm  │
 │ exo_generated│       │ confirmation │      │ 128MB / 5s   │
 │ _skills      │       │ (SMS+email)  │      │ API allowlist│
 └──────────────┘       └──────────────┘      └──────────────┘
```

**Database (Migration Ready):**

| Table | Purpose | Status |
|-------|---------|--------|
| `exo_generated_skills` | Skill registry (code, capabilities, approval status, versioning) | ✅ Migration ready |
| `exo_skill_versions` | Version history for rollback support | ✅ Migration ready |
| `exo_skill_execution_log` | Audit trail (action, params, result, timing, memory) | ✅ Migration ready |
| `exo_skill_approval_requests` | 2FA approval flow (dual-channel, 24h expiry) | ✅ Migration ready |

**Helper Functions:** `generate_skill_confirmation_code()`, `get_active_skills()`, `archive_unused_skills()`, `increment_skill_usage()`

**Connection to Skill Memory:**
- Skill Memory patterns (above) inform the AI generator about what approaches work
- Generated skills that succeed → encoded as new skill_definitions in memory
- Failed generations → stored as failure patterns to avoid repeating mistakes
- Cross-task transfer patterns help the generator create better skills for new domains

---

# TIER 5: EXECUTION LAYER

## Layer 15: Custom App Builder — ✅ IMPLEMENTED (Mod System)

**ExoSkull doesn't have "features." It WRITES software for you.**

> **Implementation (Feb 3, 2026):** Mod system with 5 live mods (task-manager, mood-tracker, habit-tracker, sleep-tracker, activity-tracker). Rig system with 6 integrations (Oura, Google Fit, Google Workspace, MS 365, Notion, Todoist). Exoskulleton registry for browsing/installing.

```javascript
App_Builder = {

  // Minimal core, maximum extensibility
  core_principle: "4 core tools + self-extension capability",

  core_tools: {
    read: "Read files, databases, APIs",
    write: "Create new files, records",
    edit: "Modify existing content",
    bash: "Execute system commands"
  },

  builder_team: {
    architect: "App Architect Agent (design schema, UI, integrations)",
    developer: "Code Generator Agent (Claude API / GPT-4 Codex)",
    deployer: "Deployment Agent (Supabase/Vercel)",
    tester: "QA Agent (automated testing)"
  },

  build_process: {
    input: "User goal: practice guitar 20min/day",

    design: {
      app_name: "Guitar Practice Logger",
      database_schema: `
        CREATE TABLE practice_sessions (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          duration_minutes INT,
          notes TEXT,
          mood_after INT,
          created_at TIMESTAMPTZ
        )
      `,
      ui_components: [
        "Quick log button (mobile widget)",
        "Streak counter",
        "Weekly chart",
        "Motivational insights"
      ],
      integrations: [
        "Voice quick-log via VAPI",
        "Calendar blocking (suggest practice time)",
        "Spotify API (detect if user listened to guitar music)"
      ]
    },

    implementation: {
      backend: "Supabase Edge Function",
      frontend: "Next.js component (auto-generated)",
      deployment: "Vercel (auto-deployed)",
      timeline: "2 hours from idea to production"
    }
  },

  self_extending: {
    capability: "Agent generates new IModExecutor implementations at runtime",
    pipeline: "Dynamic Skills (Layer 14) — 6-stage secure generation",
    stages: [
      "1. Detect need (Gap Detection / user request / pattern match)",
      "2. Generate code (Claude Opus / GPT-4 Codex → IModExecutor TypeScript)",
      "3. Validate (static AST analysis, blocked patterns, capability extraction)",
      "4. Sandbox test (isolated-vm: 128MB, 5s, API allowlist)",
      "5. Approve (2FA dual-channel confirmation)",
      "6. Deploy (register in exo_generated_skills, version-tagged)"
    ],
    mod_integration: "ModSlug = BuiltinModSlug | `custom-${string}`",
    spec: "docs/DYNAMIC_SKILLS_ARCHITECTURE.md",
    code: "lib/skills/ (detector, generator, validator, sandbox, approval, registry)"
  }
}
```

> **Dynamic Skills Implementation:** The `self_extending` capability is now formalized as the
> Dynamic Skills pipeline. Database migration is ready (`20260206000001_dynamic_skills.sql`).
> Application code (`lib/skills/`) is the next implementation target.
> See [DYNAMIC_SKILLS_ARCHITECTURE.md](./exoskull-app/docs/DYNAMIC_SKILLS_ARCHITECTURE.md) for full spec.

---

## Layer 16: Autonomous Actions Framework — ✅ IMPLEMENTED

**All actions system can take autonomously (with user approval).**

> **Implementation (Feb 2026):** Outbound calls, proactive messaging, and email integration all live. Tables: exo_interventions, exo_guardian_system. Intervention executor runs every 15min. 22 permission categories with two-tier consent system (with_approval + autonomous). Voice tools: plan_action, list_planned_actions, cancel_planned_action, delegate_complex_task. Full MAPE-K loop with 3-tier CRON (petla 1min, loop-15 15min, loop-daily 24h). Rate limit: 8 proactive messages/day.

```javascript
Autonomous_Actions = {

  permission_model: {
    granular: "Per-action approval",
    category: "Per-domain blanket (e.g., 'health: auto-log all')",
    emergency: "Crisis actions require upfront consent"
  },

  action_domains: {

    health: [
      "Auto-log sleep (Oura/Apple Watch)",
      "Bedtime reminder based on tomorrow's schedule",
      "Cancel morning meeting if sleep <6h",
      "Adjust smart home (temp, lights) for optimal sleep",
      "Suggest workout based on HRV recovery"
    ],

    productivity: [
      "Block calendar for deep work (9-11am)",
      "Auto-decline meeting if >3h already booked",
      "Create tasks from email/SMS mentions",
      "Suggest break if screen >2h continuous"
    ],

    finance: [
      "Auto-categorize transactions",
      "Alert if spending >20% over avg",
      "Remind bill payments 3 days before",
      "Generate tax reports (quarterly/annual)"
    ],

    social: [
      "Remind birthdays (1 week, 1 day, day-of)",
      "Suggest reaching out if no contact >30 days",
      "Alert if isolation detected (0 events in 60 days)"
    ],

    proactive_outbound: [
      "Call user if anomaly ('You okay? No check-in today')",
      "Contact strangers (schedule appointments via phone)",
      "Negotiate with service providers",
      "Make restaurant reservations"
    ]
  },

  safety: {
    critical: [
      "Mental health crisis: ALWAYS escalate to human",
      "Medical: NEVER diagnose, only 'see doctor'",
      "Financial: NEVER guarantee returns",
      "Suicide: immediate intervention (contact + hotline)"
    ],
    limits: [
      "NEVER delete data without 3x confirmation",
      "NEVER spend >$X without approval",
      "NEVER send email/SMS without review (unless pre-approved)"
    ]
  }
}
```

---

## Layer 17: Device Integration Mesh — ⏳ PARTIAL

**ExoSkull connects to EVERYTHING.**

> **Implementation:** Oura Ring and Google Fit (Health Connect) rig clients live. OAuth flow + sync endpoints working. More devices planned.

```javascript
Device_Mesh = {

  current: {
    wearables: [
      { device: "Oura Ring", data: ["sleep", "HRV", "temperature", "activity"], api: "Oura API v2" },
      { device: "Apple Watch", data: ["heart_rate", "steps", "workouts"], api: "HealthKit" },
      { device: "WHOOP", data: ["strain", "recovery", "sleep"], api: "WHOOP API" },
      { device: "Garmin", data: ["activities", "sleep", "stress"], api: "Garmin Connect" }
    ],
    phone: [
      { data: "Screen time", source: "Digital Wellbeing / Screen Time API" },
      { data: "Location", source: "GPS + Geofencing" },
      { data: "Camera", use: "Meal logging, receipts" }
    ],
    smart_home: [
      { device: "Smart thermostat", optimization: "Auto-adjust for optimal sleep" },
      { device: "Smart lights", optimization: "Circadian rhythm support" }
    ],
    financial: [
      { source: "Plaid/Teller", data: "Transactions, balances" },
      { source: "Revolut API", data: "Multi-currency spending" }
    ]
  },

  future: {
    smartglasses: {
      devices: ["Meta Ray-Ban", "Apple Vision Pro"],
      capabilities: ["POV video", "Face recognition", "AR overlays", "Lost item finder"]
    },
    cgm: {
      devices: ["Dexcom", "FreeStyle Libre"],
      data: "Real-time glucose"
    },
    eeg: {
      devices: ["Muse", "Neurosity Crown"],
      data: "Brain states (focus, stress)"
    }
  }
}
```

---

## Layer 18: Android-First Integration — 🔴 NOT STARTED

**Priority #1: Android devices (most accessible globally).**

> **Status:** Zero-install via SMS/Voice is live (day 1 value). Android APK not yet built.

```javascript
Android_Integration = {

  core_apis: [
    { name: "Digital Wellbeing", data: "Screen time, app usage, unlocks" },
    { name: "Activity Recognition", data: "Walking, running, cycling" },
    { name: "Geofencing", data: "Location triggers (arrived gym, left office)" },
    { name: "HealthConnect", data: "Unified health data from ALL apps" },
    { name: "Notification Listener", data: "App notifications (stress detection)" }
  ],

  deployment: {
    method: "Lightweight background service",
    size: "<5MB APK",
    battery: "<2% per day",
    permissions: "Granular opt-in"
  },

  zero_install: {
    day_1: "SMS → reply → system active (no install)",  // ✅ LIVE
    week_1: "SMS + Voice calls (Twilio + Cartesia Sonic 3)",   // ✅ LIVE
    month_1: "Optional app for advanced features"         // planned
  }
}
```

---

# TIER 6: OPERATIONS LAYER

## Layer 19: CRON & Scheduled Operations — ✅ IMPLEMENTED

**Proactive system, not reactive.**

> **Implementation (Feb 1-12, 2026):** 28 Vercel CRON jobs including: master-scheduler (hourly), bronze/silver/gold ETL, daily-summary (21:00 PL), intervention-executor (15min), post-conversation (15min), business-metrics, admin-metrics, engagement-scoring, dunning, drip-engine, guardian-effectiveness, guardian-values, pulse (30min), highlight-decay, morning-briefing (05:00 UTC), evening-reflection (19:00 UTC), impulse (15min, 6 handlers: overdue tasks, insights, goals, interventions, email sync, auto-builder), email-sync (15min), email-analyze (5min), petla (1min triage), loop-15 (15min evaluation), loop-daily (24h maintenance).

```javascript
Scheduled_Operations = {

  daily: [
    { time: "06:00", action: "Morning check-in (VAPI)", script: "Jak się czujesz? Energia 1-10?" },
    { time: "09:00", action: "Day summary (SMS)", content: "Today: 3 meetings. Sleep: 78, HRV: 52." },
    { time: "21:00", action: "Evening reflection", script: "Jak minął dzień?" },
    { time: "22:30", action: "Bedtime reminder" }
  ],

  weekly: [
    { day: "Monday 08:00", action: "Week preview" },
    { day: "Friday 17:00", action: "Week summary" }
  ],

  event_driven: [
    { trigger: "Sleep debt >6h", action: "Immediate intervention" },
    { trigger: "No social event 30 days", action: "Isolation alert" },
    { trigger: "Spending >20% over avg", action: "Budget alert" }
  ],

  adaptive: {
    learning: "Observe response patterns → adjust timing",
    example: "User ignores 6am → move to 7am"
  }
}
```

---

## Layer 20: Progressive Deployment Strategy — ✅ IMPLEMENTED

**Value from DAY 1, not waiting for "complete system."**

> **Implementation:** Vercel auto-deploy from GitHub main branch. Domain: exoskull.xyz. Zero-install SMS/Voice active from day 1.

```javascript
Deployment_Strategy = {

  day_1: {
    interface: "SMS + Voice (no app install)",
    features: ["Discovery conversation", "First data point"],
    value: "Someone is paying attention"
  },

  week_1: {
    features: ["Daily check-ins", "Task tracking", "Basic patterns"],
    value: "System is useful daily"
  },

  week_2: {
    milestone: "First custom app deployed (sleep tracker)",
    value: "System built something FOR ME"
  },

  month_1_3: {
    features: ["2-3 apps", "Device integrations", "Gap detection"],
    value: "This manages my life now"
  },

  month_4_plus: {
    features: ["Autonomous actions", "Predictive analytics", "Full AI"],
    value: "This is my second brain"
  }
}
```

---

## Layer 21: Comprehensive Guardrails — ✅ IMPLEMENTED

**Prevent failures, protect privacy, ensure safety.**

> **Implementation:** Supabase RLS on all tables, middleware auth guards, CRON_SECRET protection, rate limiting, circuit breaker in AI router, admin error logging.

```javascript
Guardrails = {

  hallucination: [
    "NEVER state facts not in database",
    "ALWAYS cite source",
    "Cross-check AI vs database before sending",
    "Confidence <70% → add disclaimer"
  ],

  privacy: [
    "NEVER share user data without consent",
    "Encryption at rest + in transit",
    "Per-tenant isolation (RLS)",
    "Voice recordings auto-delete after 90 days",
    "Right to deletion: full export + wipe anytime"
  ],

  safety: [
    "Mental health crisis: ALWAYS escalate to human",
    "Medical: NEVER diagnose, only 'see doctor'",
    "Suicide: immediate intervention + hotline"
  ],

  autonomous: [
    "NEVER delete data without 3x confirmation",
    "NEVER spend >$X without approval",
    "NEVER contact strangers without permission"
  ],

  technical: [
    "Rate limiting: 100 req/h per user",
    "Retry backoff: exponential",
    "Circuit breaker: 5min cooldown after 3 failures",
    "Graceful degradation: AI down → rule-based fallback"
  ],

  ethical: [
    "NEVER manipulate user",
    "NEVER enable addiction",
    "Transparency: user sees all data + why"
  ]
}
```

---

# THE EXOSKULL LOOP

**How it all works together:**

```
┌─────────────────────────────────────────────────────┐
│  1. DISCOVERY (Week 1-2)                            │
│     • Long conversations via Gateway (Layer 1)      │
│     • Map life domains (Layer 7)                    │
│     • Find blind spots (Layer 8)                    │
│     • Define YOUR success metrics (Layer 9)         │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  2. BUILD (Week 2-3)                                 │
│     • Meta-Coordinator designs apps (Layer 4)       │
│     • Builder Team writes code (Layer 15)           │
│     • Dynamic Skills generate new mods (Layer 14)   │
│     • Deploy via MCP Skills (Layer 6)               │
│     • Integrate devices (Layer 17-18)               │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  3. COLLECT (Week 3-4)                               │
│     • Gather baseline via multimodal (Layer 3)      │
│     • Store in Data Lake (Layer 12)                 │
│     • Memory system records EVERYTHING (Layer 11)   │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  4. ANALYZE (Week 5-6)                               │
│     • Pattern detection via Kimi Swarm (Layer 4)    │
│     • Find correlations (sleep → energy)            │
│     • Identify gaps (Layer 8)                       │
│     • Update Skill Memory (Layer 14)                │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  5. OPTIMIZE (Week 7-8)                              │
│     • Propose interventions (Layer 10: MAPE-K)      │
│     • Get user approval                              │
│     • Deploy changes (Layer 16)                     │
│     • Measure results                                │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  6. EVOLVE (Continuous)                              │
│     • Refine metrics                                 │
│     • Build new apps as needs emerge                │
│     • Dynamic Skills auto-generate new abilities    │
│     • Self-modify based on what works               │
│     • Update Skill Memory (Layer 14)                │
└──────────────────┬──────────────────────────────────┘
                   │
                   └────── BACK TO STEP 3 (Never stops)
```

---

# TECH STACK

| Layer | Technology |
|-------|-----------|
| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 14 (App Router), React, TypeScript, Tailwind, shadcn/ui | ✅ Live |
| **Backend** | Next.js API Routes (142 endpoints), Vercel Serverless | ✅ Live |
| **Database** | Supabase (PostgreSQL 15+ with pgvector, 57 migrations, RLS) | ✅ Live |
| **Auth** | Supabase Auth (cookie SSR, middleware guards) | ✅ Live |
| **Data Lake** | R2 Parquet (Bronze) → Postgres (Silver) → Mat. Views (Gold) | ✅ Live |
| **Voice (Telephony)** | Twilio (+48732143210, +48732144112) | ✅ Live |
| **Voice (TTS)** | Cartesia Sonic 3 (server) + browser speechSynthesis (web) | ✅ Live |
| **Voice (STT)** | Cartesia Sonic 3 (streaming) | ✅ Live |
| **Voice (LLM)** | Claude Sonnet 4 via streaming Haiku pipeline (56 IORS tools) | ✅ Live |
| **Memory** | Daily summaries + keyword search + unified thread (50+ msg context) | ✅ Live |
| **Email** | Resend | ✅ Live |
| **SMS** | Twilio | ✅ Live |
| **CRON** | Vercel CRON (28 scheduled jobs, timezone-aware, MAPEK 3-tier loop) | ✅ Live |
| **Admin** | 9 admin pages, 13 API endpoints, self-optimization engine | ✅ Live |
| **AI Tier 1** | Gemini 2.5 Flash (routing, classification) | ✅ Live |
| **AI Tier 2** | Claude Haiku (domain agents) | ✅ Live |
| **AI Tier 3** | Kimi K2.5 (256K context, swarm planned) | ⏳ Partial |
| **AI Tier 4** | Claude Opus 4.5 (meta-coordinator) | ✅ Live |
| **Mod System** | task-manager, mood-tracker, habit-tracker, sleep, activity | ✅ Live |
| **Dynamic Skills** | lib/skills/ pipeline (sandbox, 2FA approval, versioned deploy, circuit breaker, suggestions) | ✅ Live |
| **Rig System** | Oura, Google Fit, Google Workspace, MS 365, Notion, Todoist | ✅ Live |
| **Knowledge** | RAG pipeline (pgvector, cosine similarity), Tavily web search, Firecrawl v2 URL import, file upload | ✅ Live |
| **Autonomy** | MAPE-K 3-tier loop (petla/loop-15/loop-daily), guardian system, 22 permission categories | ✅ Live |
| **Communication Hub** | GoHighLevel (SMS, Email, WhatsApp, Messenger, Instagram, CRM, workflows) | ✅ Live |
| **Email Analysis** | Multi-provider (Gmail/Outlook/IMAP), 2-phase AI classification, RAG extraction, 4 IORS tools | ✅ Live |
| **Chat Rzeka** | Unified activity stream, 15 StreamEvent types, 6 event components, SSE real-time | ✅ Live |
| **App Builder** | AI JSON spec → validate → DB table → canvas widget, 4 IORS tools, auto-build | ✅ Live |
| **Canvas Widgets** | 18 built-in types + dynamic (app:slug), react-grid-layout v2.2.2 | ✅ Live |
| **Emotion Detection** | HuggingFace + PL keywords (text), Deepgram word-timing prosody (voice), crisis detection (3-layer), adaptive prompts, trends dashboard | ✅ Live |
| **Hosting** | Vercel (frontend + API), Supabase (DB), Cloudflare R2 (storage) | ✅ Live |

---

# GHL INTEGRATION ARCHITECTURE

## Communication Architecture

**Current: Twilio voice pipeline + GHL for CRM/multichannel.**

| Capability | Provider | Status |
|------------|----------|--------|
| **Voice AI Conversations** | Custom: Twilio + Cartesia Sonic 3 + Claude Sonnet 4 | ✅ Live |
| **SMS** | Twilio (direct) | ✅ Live |
| **Email** | GHL | Templates, tracking, automation, CRM sync |
| **WhatsApp** | GHL | Official API, CRM integration, message templates |
| **Facebook Messenger** | GHL | Page integration, CRM sync, automation |
| **Instagram DMs** | GHL | Business account integration, CRM sync |
| **Social Media Posting** | GHL Social Planner | Multi-platform scheduling, analytics, engagement |
| **CRM** | GHL | Contacts, pipelines, opportunities, tags |
| **Calendar** | GHL | Booking, appointments, availability |
| **Workflows** | GHL | Automation, triggers, campaigns |

## Data Flow (Current — Twilio-first)

```
OUTBOUND (ExoSkull → User):                          ✅ LIVE
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ExoSkull   │────▶│   Twilio    │────▶│    User     │
│  Decision   │     │  (voice/SMS)│     │             │
└─────────────┘     └─────────────┘     └─────────────┘
        │
        ├──▶ Twilio Voice (outbound call)              ✅
        ├──▶ Twilio SMS                                ✅
        ├──▶ Resend Email                              ✅
        ├──▶ WhatsApp (via GHL)                         ✅
        └──▶ Messenger (via GHL)                       ✅

INBOUND (User → ExoSkull):                            ✅ LIVE
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│   Twilio    │────▶│  ExoSkull   │
│  (call/SMS) │     │  Webhook    │     │  Claude AI  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ┌─────────┐   ┌─────────┐
              │ Process │   │ Unified │
              │ & Reply │   │ Thread  │
              └─────────┘   └─────────┘
```

## AI Tools for GHL Control

The AI (VAPI voice agent or any other agent) can control GHL via `/api/ghl/tools`:

| Tool | Description |
|------|-------------|
| `ghl_send_message` | Send SMS, Email, WhatsApp, Messenger, Instagram |
| `ghl_create_contact` | Create new CRM contact |
| `ghl_update_contact` | Update contact info, tags |
| `ghl_schedule_post` | Schedule social media post |
| `ghl_create_appointment` | Book appointment on calendar |
| `ghl_trigger_workflow` | Start automation workflow |
| `ghl_move_opportunity` | Move contact in pipeline |
| `ghl_get_conversations` | Get message history |

## Database Tables

```sql
-- GHL OAuth connections
exo_ghl_connections (tenant_id, location_id, tokens, scopes)

-- Contact mapping
exo_ghl_contacts (tenant_id, ghl_contact_id, ghl_location_id)

-- Message log (analytics)
exo_ghl_messages (tenant_id, direction, channel, content, ai_generated)

-- Webhook log (idempotency)
exo_ghl_webhook_log (webhook_id, event_type, payload, processed)

-- Social posts tracking
exo_ghl_social_posts (tenant_id, platform, content, status, stats)

-- Appointments sync
exo_ghl_appointments (tenant_id, ghl_appointment_id, start_time, status)
```

## Environment Variables

```env
# GHL OAuth (required)
GHL_CLIENT_ID=xxx
GHL_CLIENT_SECRET=xxx
GHL_REDIRECT_URI=https://app.exoskull.ai/api/ghl/oauth/callback

# GHL Webhook security (recommended)
GHL_WEBHOOK_SECRET=xxx

# Fallback (optional, if GHL not connected)
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx
```

## Rate Limits

| Limit | Value | Strategy |
|-------|-------|----------|
| **Burst** | 100 requests / 10 seconds | Client-side throttling |
| **Daily** | 200,000 requests / day | Queue management |
| **Retry** | Exponential backoff | 500ms → 1000ms → 2000ms |

---

# DATABASE SCHEMA

*[Schema remains the same as original - 14 core tables + custom app tables]*

---

# TECHNOLOGY STACK

## AI Models
- **Kimi K2.5** - 100-agent parallel swarm, 256K context, 4.5x speedup
- **Claude** - Complex reasoning, code generation
- **Gemini Flash** - Fast classification, simple tasks

## Orchestration
- **LangGraph** - DAG-based workflow orchestration

## Architecture Patterns
- **Hub-and-spoke Gateway** - Centralized orchestration
- **MAPE-K Loop** - Monitor → Analyze → Plan → Execute → Knowledge
- **Multi-tier Memory** - Short/mid/long-term with automatic updates

---

# NEW SYSTEMS (Feb 7-12, 2026)

## Email Analysis System — ✅ IMPLEMENTED

**Multi-provider email analysis with AI classification and knowledge extraction.**

> **Implementation (Feb 11, 2026):** 3 tables, multi-provider support, two-phase AI classification, RAG knowledge extraction, task generation, 4 IORS tools, canvas widget, nudge system, 2 CRONs.

```javascript
Email_Analysis = {

  tables: {
    exo_email_accounts: "Provider connections (Gmail, Outlook, IMAP)",
    exo_analyzed_emails: "Classification results, extracted facts, action items",
    exo_email_sender_profiles: "Sender intelligence (frequency, importance, relationship)"
  },

  providers: {
    gmail: "Gmail API (MIME parsing)",
    outlook: "Microsoft Graph API",
    imap: "Generic IMAP via imapflow (AES-256-GCM encrypted passwords)"
  },

  ai_pipeline: {
    phase_1_classification: {
      model: "Gemini 2.5 Flash (Tier 1)",
      cost: "~$0.008/day for 100 emails",
      outputs: ["category", "priority", "urgency", "sentiment"]
    },
    phase_2_extraction: {
      model: "Gemini 2.5 Flash (Tier 1)",
      outputs: ["key_facts", "action_items", "deadlines", "contacts_mentioned"]
    }
  },

  integrations: {
    knowledge_extraction: "key_facts → RAG pipeline (exo_document_chunks via pgvector)",
    task_generation: "action_items → exo_tasks with dedup",
    nudge_system: ["urgent_unanswered", "follow_up_overdue", "inbox_overload", "important_sender_waiting"]
  },

  iors_tools: [
    "search_emails",      // Search analyzed emails by query
    "email_summary",      // Get inbox summary (unread, urgent, action needed)
    "email_follow_ups",   // Get overdue follow-ups
    "email_sender_info"   // Get sender profile and history
  ],

  widget: "email_inbox (#18 in canvas widget registry)",

  data_lake: {
    bronze: "emails DataType in Bronze layer",
    silver: "exo_silver_emails + directEmailsETL()",
    gold: "exo_gold_email_daily materialized view"
  },

  crons: {
    email_sync: "Every 15 minutes — fetch new emails from all providers",
    email_analyze: "Every 5 minutes — AI classification + extraction"
  }
}
```

---

## Chat Rzeka / Unified Activity Stream — ✅ IMPLEMENTED

**Real-time unified activity stream showing all ExoSkull events in chronological order.**

> **Implementation (Feb 8-12, 2026):** 25+ files in components/stream/ + lib/stream/ + lib/hooks/. 16 StreamEvent types, SSE real-time updates, file upload with drag-and-drop.

```javascript
Chat_Rzeka = {

  architecture: {
    core: "StreamEvent union (16 types) → StreamEventRouter → event components",
    state: "useStreamState (useReducer) for efficient updates",
    realtime: "SSE via ProcessingCallback on processUserMessage()"
  },

  event_types: [
    // Original types
    "user_message", "assistant_message", "tool_call", "tool_result",
    "system_event", "error", "thinking", "file_attachment", "status_update",

    // New types (Feb 2026)
    "channel_message",        // Messages from non-web channels (color-coded per channel)
    "call_transcript",        // Voice call transcripts
    "file_upload",            // File upload progress + RAG processing status
    "third_party_action",     // External service actions (11 tool names → service badges)
    "agent_communication",    // Inter-agent messages
    "knowledge_citation",     // RAG citation references
    "system_evolution"        // Ralph Loop build/fix/optimize notifications
  ],

  components: {
    new_event_components: [
      "ChannelMessage",       // Color-coded channel badge + message
      "CallTranscript",       // Voice call transcript with duration
      "FileUploadEvent",      // Upload progress bar + RAG status
      "ThirdPartyAction",     // Service icon + action description
      "AgentComm",            // Agent-to-agent communication display
      "KnowledgeCitation",    // Document citation with relevance score
      "SystemEvolution"       // Ralph Loop build/fix/optimize event (color-coded)
    ]
  },

  file_upload: {
    trigger: "Paperclip button + drag-and-drop",
    flow: "presigned URL → PUT to Supabase Storage → confirm → RAG processing",
    state: "UPDATE_FILE_UPLOAD action in useStreamState"
  },

  history_loading: {
    logic: "Checks msg.channel — non-web_chat messages become channel_message events",
    display: "Color-coded per channel (SMS=green, voice=blue, email=orange, etc.)"
  },

  processing_callback: {
    onToolEnd: "(name, durationMs, meta?: { success?, resultSummary? })",
    note: "Optional, backward compatible with existing processUserMessage() callers"
  }
}
```

---

## MAPEK Loop System — ✅ IMPLEMENTED

**Three-tier autonomous evaluation and maintenance system.**

> **Implementation (Feb 7-11, 2026):** Three-tier CRON architecture for continuous self-optimization. Per-tenant configuration with gateway auto-creation.

```javascript
MAPEK_Loop_System = {

  tiers: {
    petla: {
      frequency: "Every 1 minute",
      purpose: "Triage — claim and process pending events",
      rpc: "claim_petla_event (marks expired pending events as 'ignored' before claiming)",
      event_expiry: "60min default, 360min for gateway events"
    },

    loop_15: {
      frequency: "Every 15 minutes",
      purpose: "Evaluation — proactive analysis and intervention",
      prompt: "PROACTIVE mode ('ALWAYS prefer ACTION over silence')",
      rate_limit: "8 proactive messages per day per tenant",
      config: "exo_tenant_loop_config entry REQUIRED per tenant (without it, loop-15 skips entirely)"
    },

    loop_daily: {
      frequency: "Every 24 hours",
      purpose: "Maintenance — cleanup, ETL, analysis, optimization",
      handlers: [
        "expireOldSuggestions()",      // Expire stale skill suggestions
        "archiveUnusedSkills()",       // Archive unused dynamic skills
        "runSilverETL()",             // Bronze → Silver data transformation
        "refreshGoldViews()",         // Update materialized views
        "generateDailySummary()",     // AI daily summary
        "runGapDetection()",          // Weekly gap analysis
        "knowledge_analysis()"        // Knowledge analysis engine
      ],
      note: "Processes ALL maintenance items in while-loop (was 1/day, caused pile-up)"
    }
  },

  config: {
    table: "exo_tenant_loop_config",
    auto_creation: "Gateway auto-creates config with next_eval_at: now() (NOT future — was deadlock bug)",
    backfill: "backfillMissingConfigs() in loop-daily for users created via Supabase Auth/Dashboard"
  },

  logging: {
    table: "admin_cron_runs",
    column: "started_at (NOT run_started_at)"
  }
}
```

---

## Autonomous CRONs — ✅ IMPLEMENTED

**Proactive scheduled communications and system maintenance.**

> **Implementation (Feb 11, 2026):** Three autonomous CRON jobs for proactive user engagement and system auto-building.

```javascript
Autonomous_CRONs = {

  morning_briefing: {
    schedule: "05:00 UTC daily",
    content: "Tasks, goals, overnight actions summary",
    model: "Gemini 2.5 Flash",
    delivery: "dispatchReport (SMS/email/web based on preferences)"
  },

  evening_reflection: {
    schedule: "19:00 UTC daily",
    content: "Day review, mood check, warm reflection",
    model: "aiChat (router-selected)",
    delivery: "dispatchReport"
  },

  impulse: {
    schedule: "Every 15 minutes",
    handlers: {
      A: "Overdue tasks — notify user of tasks past deadline",
      B: "Insights — deliver ready insights from analysis engine",
      C: "Goals — check goal progress, send encouragement or alerts",
      D: "Interventions — execute approved interventions",
      E: "Email sync — trigger email provider sync",
      F: {
        name: "Auto-builder",
        description: "Detects gaps and AUTO-BUILDS apps (not just suggests)",
        builds: ["mood tracker", "habit tracker", "expense tracker"],
        also: "Creates starter goals (3x) and onboarding tasks",
        method: "generateApp() — takes ~5-8s, fits in 60s CRON timeout",
        source: "iors_suggestion",
        dedup: "auto_build:{gap_id} in exo_proactive_log (14 days for builds, 7 days for suggestions)"
      }
    }
  },

  shared_utilities: {
    file: "lib/cron/tenant-utils.ts",
    functions: [
      "getActiveTenants()",
      "isWithinHours()",
      "isQuietHours()",
      "sendProactiveMessage() — dispatchReport + appendMessage + logProactiveOutbound"
    ]
  }
}
```

---

## RAG Pipeline — ✅ IMPLEMENTED

**Document processing, chunking, embedding, and semantic search.**

> **Implementation (Feb 10-12, 2026):** Full RAG pipeline from document upload to semantic search. Supports 6 file formats.

```javascript
RAG_Pipeline = {

  processor: "lib/knowledge/document-processor.ts",

  stages: {
    extract: {
      pdf: "pdf-parse (use require(), no default export)",
      docx: "mammoth",
      xlsx: "xlsx library",
      pptx: "jszip (regex: use [^<]* NOT .*? — TS target doesn't support ES2018 /s flag)",
      txt_md_csv: "Direct text reading"
    },

    chunk: {
      strategy: "Recursive text splitting",
      size: "~500 words per chunk",
      overlap: "50 words between chunks"
    },

    embed: {
      model: "OpenAI text-embedding-3-small",
      dimensions: 1536,
      storage: "exo_document_chunks table (pgvector)",
      note: "For RPC calls, pass raw embedding array (NOT JSON.stringify). For INSERT, JSON.stringify works."
    },

    search: {
      function: "search_user_documents() SQL function",
      method: "Cosine similarity",
      threshold: 0.3,
      note: "Searches across all user's document chunks"
    }
  },

  iors_tools: [
    "search_knowledge",   // Search user's knowledge base via semantic similarity
    "import_url"          // Import web page content into knowledge base
  ],

  url_import: {
    processor: "lib/knowledge/url-processor.ts",
    primary: "Firecrawl v2 (scrape(), returns Document directly)",
    fallback: "Basic fetch (when Firecrawl unavailable)",
    note: "Firecrawl v2: scrape() NOT scrapeUrl(), throws on failure (no .success check)"
  }
}
```

---

## Web Search & URL Tools — ✅ IMPLEMENTED

**Internet search and webpage fetching capabilities.**

> **Implementation (Feb 12, 2026):** Two IORS tools for web access.

```javascript
Web_Search_Tools = {

  file: "lib/iors/tools/web-tools.ts",

  tools: {
    search_web: {
      provider: "Tavily",
      import: "const { tavily } = await import('@tavily/core')",
      usage: "tavily({ apiKey }) → client.search(query)"
    },

    fetch_webpage: {
      primary: "Firecrawl v2 (scrape())",
      fallback: "Basic fetch with HTML-to-text conversion",
      env: "FIRECRAWL_API_KEY (optional)"
    }
  },

  total_iors_tools: 56
}
```

---

## App Builder (AI-Generated Apps) — ✅ IMPLEMENTED

**AI generates custom applications from natural language descriptions.**

> **Implementation (Feb 10, 2026):** AI generates JSON spec → validates → creates DB table via RPC → registers canvas widget. Auto-build capability in impulse Handler F.

```javascript
App_Builder = {

  flow: "AI generates JSON spec → validate → create_app_table() RPC → register canvas widget",

  table: "exo_generated_apps (slug, spec, columns, tenant_id)",
  rpc: "create_app_table() — SECURITY DEFINER, creates exo_app_{slug} table",

  security: {
    prefix: "All app tables prefixed exo_app_",
    columns: "Column types whitelisted",
    injection: "SQL injection blocked in RPC"
  },

  dynamic_crud: {
    endpoint: "/api/apps/[slug]/data",
    widget_type: "app:{slug}"
  },

  iors_tools: [
    "build_app",        // Create new app from description
    "list_apps",        // List user's custom apps
    "app_log_data",     // Log data point to app
    "app_get_data"      // Query app data
  ],

  auto_build: {
    trigger: "Impulse Handler F detects gap",
    apps: ["mood tracker", "habit tracker", "expense tracker"],
    method: "generateApp() — ~5-8s execution",
    dedup: "auto_build:{gap_id} in exo_proactive_log"
  },

  schema_driven_ui: {
    layouts: ["table", "cards", "timeline", "kanban", "stats-grid", "mindmap"],
    media_rich: {
      modes: ["thumbnail", "cover", "avatar"],
      column: "media_column in ui_config",
      form_type: "image_url"
    },
    ai_selects_layout: "Based on app description in buildAppSystemPrompt()",
    components: {
      table: "AppWidget.tsx (default EntryRow)",
      cards: "app-layouts/CardGrid.tsx (title, subtitle, badge, media)",
      timeline: "app-layouts/TimelineView.tsx (date-sorted, vertical line)",
      kanban: "app-layouts/KanbanBoard.tsx (swim lanes, 140px columns)",
      stats_grid: "app-layouts/StatsBar.tsx (2x2 stat cards + last entries)",
      mindmap: "app-layouts/MindmapView.tsx (central node + branches)"
    }
  }
}
```

---

## Agentic Execution Loop — ✅ IMPLEMENTED

**Multi-step autonomous tool execution replacing the old 3-round limit.**

> **Implementation (Feb 12, 2026):** `lib/iors/agent-loop.ts` — Claude calls tools in a loop, observing results and deciding next steps.

```javascript
Agent_Loop = {

  file: "lib/iors/agent-loop.ts",

  max_steps: {
    web: 10,         // Chat/API requests
    voice: 3,        // Voice calls (low latency)
    async: 15         // Background tasks (exo_async_tasks)
  },

  budget_ms: 55000,   // Vercel safety margin (60s timeout)

  flow: "Claude → tool_use → execute → observe → Claude → repeat",

  overflow: {
    trigger: ">50s elapsed",
    action: "Serialize agent state to exo_async_tasks.agent_state JSONB",
    resume: "async-processor picks up and continues"
  },

  processing_callback: "SSE stream per step (Chat Rzeka real-time)",

  integration: {
    conversation_handler: "Replaced inline 190-line tool loop",
    follow_up_tokens: { web: 1024, voice: 300 }
  }
}
```

---

## Ralph Loop (Autonomous Self-Development) — ✅ IMPLEMENTED

**ExoSkull builds, fixes, and improves itself autonomously.**

> **Implementation (Feb 12, 2026):** `lib/iors/ralph-loop.ts` — runs inside loop-15 CRON every 15 minutes.

```javascript
Ralph_Loop = {

  file: "lib/iors/ralph-loop.ts",

  cycle: {
    observe: "Query tool failures, pending plans, gaps, unused apps, user priorities",
    analyze: "Gemini Flash decides ONE action (cheapest model)",
    build:   "Execute action using existing IORS tools",
    learn:   "Log outcome to exo_dev_journal",
    notify:  "Send system_evolution event via Chat Rzeka"
  },

  tables: {
    dev_journal:     "exo_dev_journal (entry_type: build|fix|learning|plan|observation)",
    dynamic_tools:   "exo_dynamic_tools (per-tenant hot-loadable tools, max 15)",
    tool_executions: "exo_tool_executions (telemetry, 7-day TTL)"
  },

  action_types: ["build_app", "fix_tool", "optimize", "register_tool", "none"],

  gap_detection: "Reads exo_proactive_log trigger_type 'auto_build:%' (NOT a dedicated gap table)",

  safety: {
    budget_per_cycle: "max 1 build + 2 fixes per 15min",
    consent_gate:     "Uses tenant permission categories (autonomous vs with_approval)",
    circuit_breaker:  "3+ failures of same tool in 24h → auto-remediation"
  },

  iors_tools: [
    "view_dev_journal",           // Show what system built/fixed
    "trigger_ralph_cycle",        // Force development cycle
    "set_development_priority"    // User sets what's important
  ],

  chat_rzeka_event: {
    type: "system_evolution",
    component: "components/stream/events/SystemEvolution.tsx",
    colors: {
      build: "emerald",
      fix: "amber",
      optimize: "blue",
      register_tool: "violet"
    }
  }
}
```

---

## Canvas Widget System — ✅ IMPLEMENTED

**Customizable dashboard with 18 built-in widget types.**

> **Implementation (Feb 9, 2026):** react-grid-layout v2.2.2 with self-fetching wrappers.

```javascript
Canvas_Widgets = {

  library: "react-grid-layout v2.2.2",
  api_notes: {
    width: "useContainerWidth (NOT WidthProvider)",
    drag: "dragConfig.handle (NOT draggableHandle)",
    compact: "verticalCompactor (NOT compactType)"
  },

  builtin_types: [
    "tasks", "mood", "habit", "sleep", "activity",
    "goals", "health", "schedule", "knowledge",
    "skills", "emotion", "social", "finance",
    "weather", "notes", "quick_log",
    "knowledge_insights",   // #17 — Knowledge analysis widget
    "email_inbox"           // #18 — Email inbox widget
  ],

  dynamic_types: [
    "app:{slug}",           // AI-generated app widgets
    "dynamic_mod:{slug}"    // Dynamic skill widgets
  ],

  self_fetching: "CanvasGrid wraps all props-based widgets with self-fetching wrappers (fetch → skeleton → render)"
}
```

---

## Presigned Uploads — ✅ IMPLEMENTED

**Direct client-to-storage uploads bypassing Vercel body limit.**

> **Implementation (Feb 8, 2026):** Presigned upload URLs for Supabase Storage.

```javascript
Presigned_Uploads = {

  problem: "Vercel serverless has hard 4.5MB body limit (no override)",
  solution: "Client uploads directly to Supabase Storage via presigned URL",

  flow: [
    "1. Client calls /api/knowledge/upload-url → gets { signedUrl, token }",
    "2. Client PUTs file directly to Supabase Storage (signed URL valid 5 minutes)",
    "3. Client calls /api/knowledge/confirm-upload → triggers RAG processing"
  ],

  method: "createSignedUploadUrl() returns { signedUrl, token }"
}
```

---

## Settings Self-Modify — ✅ IMPLEMENTED

**User-configurable AI behavior and permission system.**

> **Implementation (Feb 10, 2026):** 22 permission categories with two-tier consent.

```javascript
Settings_Self_Modify = {

  tenant_columns: [
    "iors_custom_instructions",   // Free-text custom instructions for AI
    "iors_behavior_presets",      // Pre-defined behavior profiles
    "iors_ai_config"              // AI configuration overrides
  ],

  permission_system: {
    categories: 22,
    tiers: {
      with_approval: "AI proposes action, user approves",
      autonomous: "AI acts without asking"
    }
  }
}
```

---

## Self-Optimization Dashboard — ✅ IMPLEMENTED

**Admin dashboard for monitoring and controlling the self-optimization engine.**

> **Implementation (Feb 9, 2026):** Three widgets for system optimization visibility.

```javascript
Self_Optimization_Dashboard = {

  widgets: {
    OptimizationWidget: {
      queries: "8 parallel queries for system metrics",
      displays: "Success rates, response times, model usage, cost breakdown"
    },

    InterventionInboxWidget: {
      actions: ["approve", "dismiss", "provide feedback"],
      endpoint: "/api/interventions/[id]/respond (POST)"
    },

    InsightHistoryWidget: {
      displays: "Historical insights with filtering and search"
    }
  },

  auto_tuning: {
    low_satisfaction: "Pivot communication style",
    low_success: "Escalate to higher AI tier",
    high_satisfaction: "Boost proactivity level"
  }
}
```

---

# ROADMAP

### Phase 1: Foundation (Months 1-3) — ✅ COMPLETE

**Database & Data Lake (Week 1-2):** ✅
- [x] Supabase project setup (Postgres 15+ with pgvector, Auth, Storage)
- [x] Core schema: 75+ tables (tenants, conversations, memories, voice, mods, rigs, admin)
- [x] RLS policies for multi-tenant isolation
- [x] **Data Lake: Cloudflare R2 setup (Bronze layer)**
- [x] **Parquet ingestion pipeline (CRON → R2 at 01:00 UTC)**
- [ ] **DuckDB query engine integration** (client exists, not fully operational)

**Gateway & SaaS (Week 3-4):** ✅
- [x] Next.js API Routes (142 endpoints) — replaced Node.js Gateway
- [x] Session management (Supabase Auth + cookie SSR middleware)
- [x] Subscription tables (exo_subscriptions, exo_payments)
- [x] Usage tracking (exo_ai_usage, admin daily snapshots)

**Voice & Discovery (Week 5-8):** ✅
- [x] Custom voice pipeline: Twilio → Cartesia Sonic 3 STT → Claude Sonnet 4 → Cartesia Sonic 3 TTS (streaming Haiku pipeline)
- [x] 56 IORS tools (tasks, mods, calls, SMS, email, memory, autonomy, knowledge, web search, apps, and more)
- [x] Outbound calling + delegate calling (call third parties on user behalf)
- [x] Discovery/onboarding conversation system (~60 topics)

**First Apps (Week 9-12):** ✅
- [x] Multi-model AI router (4 tiers: Flash → Haiku → Kimi → Opus)
- [x] Mod system: task-manager, mood-tracker, habit-tracker, sleep, activity
- [x] Silver ETL (R2 → Postgres at 02:00 UTC) + Gold ETL (Mat. Views at 04:00 UTC)

**Memory System (Feb 5):** ✅
- [x] Daily summaries with AI generation + user corrections
- [x] Memory search (keyword, semantic, timeline, last mention)
- [x] Unified thread (cross-channel: voice + SMS + email + web chat)
- [x] Context window: 50 recent messages + summaries + highlights
- [x] CRON at 21:00 PL for daily summary generation

**Admin Panel (Feb 4):** ✅
- [x] 9 admin pages (overview, CRON, AI, business, users, autonomy, pipeline, insights, logs)
- [x] Self-optimization engine (10 analysis categories)
- [x] CRON health monitoring with 30s polling

**Knowledge Layer (Feb 3):** ✅
- [x] Tyrolka framework (Loops → Campaigns → Quests → Ops → Notes)
- [x] File upload (PDF, DOCX, images, video up to 1GB)
- [x] Document chunking with pgvector embeddings for semantic search

### Phase 2: Intelligence (Months 4-6) — ✅ MOSTLY COMPLETE

- [ ] Full Kimi K2.5 Swarm integration (100-agent parallel) — Kimi K2.5 has no API key (placeholder only)
- [x] Guardian system + MAPE-K 3-tier loop (petla 1min, loop-15 15min, loop-daily 24h) + intervention executor
- [x] Full gap detection system (Layer 8) — weekly CRON (Sun 09:00), 7 life domains, skill suggestions, auto-expire 14d
- [x] Self-Defining Success Metrics (Layer 9) — AI goal extraction, auto-progress tracking, momentum/trajectory, voice tools, dashboard
- [x] **Emotion Intelligence Layer (Layer 11) — Phase 1 + Phase 2**
  - [x] Text-based emotion analysis (VAD model, Polish language)
  - [x] Crisis detection (3-layer: keyword + pattern + context + fail-safe)
  - [x] 5 adaptive response modes (empathetic, motivational, calming, neutral, crisis)
  - [x] Emotion logger with DB persistence (exo_emotion_log)
  - [x] Phase 2: Voice prosody analysis (speech rate, pause metrics via Deepgram word timings)
  - [x] Phase 2: Text + voice fusion engine (VAD adjustment from prosody)
  - [x] Phase 2: Emotion trends API + Recharts dashboard chart
  - [ ] Phase 3: Pitch/energy extraction (Hume or Deepgram utterance features)
  - [ ] Phase 3: Facial expression analysis (face-api.js)
  - [ ] Phase 2: Facial expression analysis (webcam/smartglasses)
  - [ ] Phase 2: Behavioral monitoring (IAT, screen activity)
- [x] Skill Memory & Dynamic Generation (Layer 14)
  - [x] Database migration (5 tables: exo_generated_skills, exo_skill_versions, exo_skill_execution_log, exo_skill_approval_requests, exo_skill_suggestions)
  - [x] RLS policies + helper functions (get_active_skills, archive_unused_skills, etc.)
  - [x] Architecture spec (docs/DYNAMIC_SKILLS_ARCHITECTURE.md)
  - [x] Dynamic Skill Generator (lib/skills/generator/)
  - [x] Static analyzer + security auditor (lib/skills/validator/)
  - [x] Sandbox runtime (lib/skills/sandbox/) + circuit breaker
  - [x] 2FA approval gateway (lib/skills/approval/)
  - [x] Dynamic registry + mod integration (lib/skills/registry/)
  - [x] Skill need detection (lib/skills/detector/) — integrates with Gap Detection (Layer 8)
  - [x] API routes (app/api/skills/*) — generate, execute, approve, rollback, suggestions
  - [x] Dashboard UI — list page, detail page with code viewer, suggestions widget
  - [x] Pre-approval sandbox testing + circuit breaker auto-revoke
- [ ] Pattern detection on Data Lake (DuckDB queries on Bronze)

### Phase 2.5: Systems Integration (Feb 7-12, 2026) — ✅ COMPLETE

- [x] **Unified Message Gateway** — 12 channels, all route through handleInboundMessage() → processUserMessage() (56 IORS tools)
- [x] **Email Analysis System** — Multi-provider (Gmail/Outlook/IMAP), 2-phase AI classification, RAG knowledge extraction, 4 IORS tools, 2 CRONs (email-sync 15min, email-analyze 5min)
- [x] **Chat Rzeka / Unified Activity Stream** — 15 StreamEvent types, 6 event components, SSE real-time, file upload with drag-and-drop
- [x] **MAPEK Loop System** — 3-tier CRON: petla (1min triage), loop-15 (15min evaluation), loop-daily (24h maintenance, 7 handlers)
- [x] **Autonomous CRONs** — morning-briefing (05:00 UTC), evening-reflection (19:00 UTC), impulse (15min, 6 handlers incl. auto-builder)
- [x] **RAG Pipeline** — Document processor (PDF/DOCX/XLSX/PPTX/TXT), chunking (~500 words, 50 overlap), OpenAI text-embedding-3-small (1536 dims), cosine similarity search
- [x] **Web Search & URL Tools** — Tavily search + Firecrawl v2 URL import, 2 IORS tools
- [x] **App Builder** — AI JSON spec → validate → DB table → canvas widget, 4 IORS tools, auto-build in impulse Handler F
- [x] **Canvas Widget System** — 18 built-in types + dynamic (app:slug, dynamic_mod:slug), react-grid-layout v2.2.2
- [x] **Presigned Uploads** — Client → Supabase Storage direct upload (bypasses Vercel 4.5MB limit)
- [x] **Settings Self-Modify** — 22 permission categories, two-tier consent system (with_approval + autonomous)
- [x] **Self-Optimization Dashboard** — OptimizationWidget (8 parallel queries), InterventionInbox (approve/dismiss), InsightHistory
- [x] **Knowledge Analysis Engine** — Light (rule-based, $0) + deep (AI via Haiku), 17 parallel queries, 7 action types
- [x] **GHL Integration** — SMS, Email, WhatsApp, Messenger, Instagram, CRM, workflows
- [x] **In-Chat Onboarding** — Gateway checks onboarding_status, profile extraction via ###PROFILE_DATA### JSON block

### Phase 3: Expansion (Months 7-12) — ⏳ PLANNED

- [ ] More Mod executors — can now be AI-generated via Dynamic Skills pipeline
  - [ ] exercise, food, water, finance, social, journal, weekly-review (static or generated)
  - [ ] Community skills marketplace (Exoskulleton: community-contributed, verified dynamic skills)
- [ ] More Rig clients (Fitbit, Apple Health, Plaid, Home Assistant, Philips Hue)
- [x] Device integrations: Oura Ring, Google Fit (partial)
- [ ] Smartglasses integration (Meta Ray-Ban)
- [ ] Voice cloning (custom voice)
- [ ] Mobile app (React Native)

---

**Version:** 5.1
**Status:** MVP Live — Active Development (142 API routes, 56 IORS tools, 28 CRONs, 57 migrations, 18 canvas widgets)
**Created:** 2026-02-01
**Updated:** 2026-02-12

---

**ExoSkull: Your Life, Optimized. By AI. For You.**

🧠 **EXO-SKULL** = External Brain Case = Second Cognitive System
