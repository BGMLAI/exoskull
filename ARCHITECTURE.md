# 🧠 EXOSKULL - Adaptive Life Operating System
## Your Second Brain. Built For You. By AI.

**Version:** 2.0 - The Full Vision
**Created:** 2026-02-01
**Status:** 🔴 Architecture Design Phase

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

## 🏗️ SYSTEM ARCHITECTURE

### Layer 1: Discovery & Relationship Building

**ExoSkull doesn't start with features. It starts with conversation.**

```
Week 1-2: DEEP DISCOVERY PHASE

Goals:
1. Understand who you are
2. Map your entire life (work, health, relationships, finance, hobbies)
3. Identify what you care about
4. Find gaps you don't see
5. Define success metrics (YOUR definition, not templates)
6. Inventory your devices & data sources

Process:
┌─────────────────────────────────────────────────────┐
│  Discovery Agent: Long-form Voice Conversations      │
│                                                      │
│  "Tell me about your life"                          │
│  "What frustrates you daily?"                       │
│  "What would 'better' look like?"                   │
│  "What do you track now? What should you track?"    │
│  "What devices do you use?"                         │
│  "What matters most to you?"                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  Analysis Phase: Meta-Coordinator processes         │
│                                                      │
│  • Identifies life domains (work, health, etc.)     │
│  • Detects gaps (what user DOESN'T talk about)     │
│  • Defines custom KPIs per domain                   │
│  • Prioritizes areas for immediate tracking         │
│  • Designs custom app architecture                  │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  Proposal Phase: System presents plan               │
│                                                      │
│  "Based on our conversation, here's what I see:     │
│                                                      │
│  YOUR PRIORITIES:                                    │
│  1. Health (sleep, energy, fitness)                 │
│  2. Business (revenue, time management)             │
│  3. Learning (guitar - you mentioned 3 times)       │
│                                                      │
│  GAPS I DETECTED (you never mentioned):             │
│  🚨 Finance tracking - risky                        │
│  🚨 Social life - possible isolation                │
│  🚨 Rest/recovery - burnout risk                    │
│                                                      │
│  APPS I'LL BUILD FOR YOU:                           │
│  ✓ Sleep Quality Tracker (Oura + daily check-in)   │
│  ✓ Revenue Dashboard (bank API + manual log)       │
│  ✓ Practice Logger (guitar 20min/day goal)         │
│  ✓ Budget Monitor (auto-alert on overspending)     │
│  ✓ Social Health Tracker (weekly connection goal)  │
│                                                      │
│  DEVICES I'LL INTEGRATE:                            │
│  ✓ Oura Ring (sleep, HRV)                          │
│  ✓ Phone (location, screen time, typing patterns)  │
│  ✓ Smartwatch (activity, heart rate)               │
│  ✓ Computer (work hours, productivity)             │
│  ✓ Bank API (spending, income)                     │
│  ✓ Calendar (meetings, time allocation)            │
│                                                      │
│  Ready to build your system?"                       │
└─────────────────────────────────────────────────────┘
```

---

### Layer 2: Custom Infrastructure Builder

**ExoSkull doesn't have "features." It WRITES software for you.**

```javascript
Builder_Team = {

  architect: "App Architect Agent",
  developer: "Code Generator Agent (Claude API)",
  deployer: "Deployment Agent (Supabase/Vercel)",
  tester: "QA Agent (automated testing)",

  process: {

    // User says: "I want to track my guitar practice"
    input: "User goal: practice guitar 20min/day",

    // Architect designs
    design: {
      app_name: "Guitar Practice Logger",
      database_schema: `
        CREATE TABLE practice_sessions (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          duration_minutes INT,
          notes TEXT,
          mood_after INT, -- 1-10
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
      ],
      success_metric: "User-defined: 20min/day, 5 days/week"
    },

    // Developer builds
    implementation: {
      backend: "Supabase Edge Function written by Claude API",
      frontend: "Next.js component auto-generated",
      deployment: "Vercel (auto-deployed)",
      testing: "Automated E2E tests",
      timeline: "2 hours from idea to production"
    },

    // Deployer ships
    delivery: {
      user_notification: "Your Guitar Practice Logger is live!",
      onboarding: "Voice walkthrough of new app",
      integration: "Added to your dashboard + voice commands enabled"
    }
  }
}
```

**Result:** User gets a CUSTOM app built specifically for them, managed autonomously.

---

### Layer 3: Agent Orchestration System

**Not multi-agent chaos. Coordinated team with clear hierarchy.**

```
┌─────────────────────────────────────────────────────┐
│              META-COORDINATOR                        │
│         (The Brain of ExoSkull)                      │
│                                                      │
│  • Analyzes user conversations                       │
│  • Defines KPIs per life domain                     │
│  • Decides which apps to build                      │
│  • Determines success criteria                      │
│  • Detects gaps & blind spots                       │
│  • Coordinates all domain squads                    │
└────────────────┬────────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
┌─────▼──────┐      ┌──────▼──────┐
│  BUILDER   │      │   MANAGER   │
│   TEAM     │      │    TEAM     │
│            │      │             │
│ • Architect│      │ • Metrics   │
│ • Developer│      │ • Analytics │
│ • Deployer │      │ • Optimizer │
│ • Tester   │      │ • Memory    │
└─────┬──────┘      └──────┬──────┘
      │                    │
      └──────────┬─────────┘
                 │
      ┌──────────┴──────────────────┐
      │                             │
┌─────▼──────┐              ┌──────▼──────┐
│ DOMAIN     │              │  DEVICE     │
│ SQUADS     │              │ INTEGRATION │
│            │              │   MESH      │
│ • Health   │              │             │
│ • Business │              │ • Phone     │
│ • Finance  │              │ • Wearables │
│ • Learning │              │ • Computer  │
│ • Social   │              │ • Glasses   │
└────────────┘              └─────────────┘
```

#### Domain Squad Structure:

Each life area gets its own coordinated team:

```javascript
Health_Squad = {
  coordinator: "Health Meta-Agent",

  apps_built: [
    "Sleep Quality Tracker",
    "Meal Logger (photo recognition)",
    "Workout Planner",
    "Supplement Reminder",
    "Lab Results Analyzer"
  ],

  metrics_tracked: [
    "sleep_quality (Oura + subjective)",
    "energy_levels (daily voice check-in)",
    "nutrition_score (meal photos + manual log)",
    "workout_consistency (calendar + smartwatch)",
    "biomarker_trends (lab results over time)"
  ],

  devices_integrated: [
    "Oura Ring → sleep, HRV, readiness",
    "Apple Watch → activity, heart rate",
    "Phone camera → meal photos for AI analysis",
    "Voice → daily energy check-in"
  ],

  success_criteria: {
    // USER-DEFINED (not template)
    user_definition: "Feel energized daily, sleep well, stay healthy",

    // System translates to measurable
    measurable_kpis: [
      "Morning energy ≥7/10 (5 days/week)",
      "Sleep score ≥80 (Oura)",
      "No sick days this month"
    ]
  },

  autonomous_actions: [
    "If sleep_debt >6h → suggest early bedtime + cancel morning meeting",
    "If meal_logged = 0 by 14:00 → remind to eat",
    "If workout_streak broken → motivational voice call"
  ]
}
```

---

### Layer 4: Proactive Gap Detection

**ExoSkull monitors what you DON'T talk about.**

```javascript
Gap_Detection_Engine = {

  philosophy: "What you don't measure, you can't manage.
               What you don't talk about might be a problem.",

  methodology: {

    // 1. Map all life domains
    universal_domains: [
      "health", "fitness", "nutrition", "sleep",
      "work", "productivity", "projects", "career",
      "finance", "budgeting", "investments", "debt",
      "relationships", "family", "friends", "romance",
      "learning", "skills", "hobbies", "growth",
      "rest", "fun", "travel", "experiences",
      "spirituality", "meaning", "purpose"
    ],

    // 2. Detect which user mentions
    user_talks_about: [
      "work (70% of conversations)",
      "health (20%)",
      "projects (10%)"
    ],

    // 3. Flag what's MISSING
    blind_spots: [
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

          To może nie być problem (jeszcze).
          Ale to ŚLEPA STREFA.

          Chcesz żebym zbudował budget tracker?
          Albo przynajmniej alert system gdy wydatki rosną?
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
        risk: "Social isolation, potential mental health impact",

        proactive_message: `
          Nie wiem czy to celowe, ale zauważyłem pattern:

          Ostatnie 2 miesiące:
          • Zero spotkań towarzyskich w kalendarzu
          • Lokalizacja: dom → praca → dom (pętla)
          • Analiza głosu: spadek energii wokalnej (marker samotności)

          Może lubisz samotność - okej.
          Ale jeśli to nieświadome - ostrzegam.

          Chcesz żebym dodał "social health" jako metrykę?
          Cel: np. 3 meaningful conversations/tydzień?
        `
      },

      {
        domain: "rest_and_recovery",
        severity: "HIGH",
        evidence: [
          "Work logs: 7 days/week, no breaks for 4 weeks",
          "No vacation mentions in 6 months",
          "No hobbies tracked",
          "Sleep debt accumulating (Oura data)",
          "Stress markers increasing (voice pitch analysis)"
        ],
        risk: "Burnout imminent",

        proactive_message: `
          🚨 BURNOUT ALERT

          Data doesn't lie:
          • Pracujesz 7 dni/tydzień od miesiąca
          • Zero urlopu od pół roku
          • Brak hobby/fun w trackingu
          • Sleep debt: 12 godzin
          • Stress markers (głos): ↑ 40%

          To nie jest "ciężka praca".
          To jest droga do wypalenia.

          MUSISZ odpocząć. Nie prośba - to medical necessity.

          Zaproponuję:
          1. Forced 3-day digital detox (weekend)
          2. Zbudować "recovery tracker"
          3. Auto-block calendar: 1 dzień/tydzień bez pracy

          Zgoda?
        `
      }
    ]
  }
}
```

**Key Innovation:** System finds problems BEFORE user asks.

---

### Layer 5: Total Recall Memory System

**Your biological brain forgets. ExoSkull remembers EVERYTHING.**

```javascript
Memory_Architecture = {

  motto: "I am your external hard drive. I never forget.",

  storage_layers: {

    // Layer 1: Raw Data (everything)
    complete_archive: {
      conversations: "Every word you've ever said (transcribed + audio)",
      actions: "Every task completed, goal set, habit tracked",
      biometrics: "Every heartbeat, step, sleep cycle, HRV reading",
      locations: "Where you were, when, for how long",
      screen_time: "What apps, websites, how long",
      typing_patterns: "Speed, errors (anxiety markers)",
      voice_biomarkers: "Pitch, energy, stress indicators",
      photos: "Visual memory (smartglasses POV)",
      context: "What was happening when X occurred"
    },

    // Layer 2: Processed Insights (patterns)
    pattern_database: {
      behavioral: "User works best 9-11am (productivity peaks)",
      health: "Sleep <7h → energy <5 next day (92% correlation)",
      emotional: "Stressed voice pitch when deadline <2 days",
      social: "Video calls drain energy more than in-person",
      financial: "Overspending happens Friday evenings (impulse)",
      learning: "Guitar practice >50% successful if done before work"
    },

    // Layer 3: Predictive Models (what will happen)
    forecasting: {
      burnout_risk: "Current trajectory → burnout in 18 days",
      health_trends: "Sleep pattern → likely cold/flu next week",
      productivity: "Project deadline stress → expect anxiety spike",
      financial: "Current spending → budget overrun by month-end"
    },

    // Layer 4: Meta-Memory (memory about memory)
    user_memory_profile: {
      strengths: [
        "Remembers technical details well",
        "Good visual memory",
        "Recalls conversations with specific people"
      ],
      weaknesses: [
        "Forgets birthdays (100% failure rate)",
        "Loses keys/wallet often",
        "Doesn't remember what they ate yesterday",
        "Forgets promises made when stressed"
      ],
      compensation_strategies: {
        birthdays: "Auto-remind 1 week + 1 day + day-of",
        keys: "Smartglasses: track last-seen location",
        meals: "Auto-log via photo + voice",
        promises: "Auto-extract from conversations → task list"
      }
    }
  },

  recall_types: {

    // 1. On-demand recall
    explicit: {
      trigger: "User asks: 'Co mówiłem o projekcie X?'",

      response: `
        Projekt X: 23 conversations (2024-03-10 to 2024-09-15)

        Timeline:
        • March: Initial excitement, big plans
        • April-May: Frustration with team delays
        • June: Deadline stress, working weekends
        • July: Shipped, but exhausted
        • August: "Never again" (your words)
        • September: Considering similar project again

        Key learnings you identified:
        1. Underestimated time by 2x
        2. Team communication broke down mid-project
        3. Client kept changing requirements
        4. No buffer time built in

        My observation: You're thinking about doing this again.
        Remember why you said "never again"?

        Want full transcripts?
      `
    },

    // 2. Automatic context injection
    implicit: {
      trigger: "User starts new project similar to past failure",

      response: `
        🚨 Pattern Alert

        This new project looks eerily similar to Project X (March-July).
        That one went badly. Remember?

        Similarities:
        • Same client type (corporate, slow decisions)
        • Similar timeline (ambitious)
        • Team composition (remote, async)

        What went wrong last time:
        ❌ Timeline: 2x longer than estimated
        ❌ Communication: weekly calls weren't enough
        ❌ Scope creep: client changed mind 7 times
        ❌ Burnout: you worked 3 weekends straight

        Suggestions based on memory:
        ✓ Add 50% time buffer (not 20%)
        ✓ Daily standups, not weekly
        ✓ Contract clause: max 2 revision rounds
        ✓ Block weekends in calendar NOW

        Proceed differently this time?
      `
    },

    // 3. Cross-domain synthesis
    synthesis: {
      trigger: "User says: 'I have a headache'",

      cross_reference: [
        "Sleep: 5.5h last night (target: 7h)",
        "Water intake: 0.3L today (should be 2L by now)",
        "Screen time: 8h yesterday (high blue light)",
        "Posture: head-down 5h today (smartglasses)",
        "Stress: voice pitch ↑ 15% (deadline tomorrow)",
        "Pattern: Last 3 headaches had same constellation"
      ],

      diagnosis: `
        I know why you have a headache.

        It's not random. It's a pattern (3rd time this month):

        ROOT CAUSES:
        1. Sleep debt (5.5h vs 7h needed)
        2. Dehydration (barely drank water today)
        3. Eye strain (8h screens + bad posture)
        4. Stress (deadline tomorrow, voice analysis confirms)

        IMMEDIATE FIXES:
        • Drink 1L water RIGHT NOW
        • 20-20-20 rule: look away every 20min
        • 10min walk outside (reset posture + stress)

        PREVENT NEXT TIME:
        • Sleep >7h when deadline <2 days
        • Water reminder every 2h
        • Screen breaks (I'll enforce via smartglasses)

        This will work. I have your data.
      `
    }
  }
}
```

---

### Layer 6: Multimodal Everything

**ExoSkull doesn't just "talk." It sees, hears, feels, and integrates ALL modalities.**

```javascript
Multimodal_System = {

  input_modalities: {

    // 1. VOICE (primary)
    voice: {
      channels: [
        "VAPI calls (scheduled or on-demand)",
        "Voice memos (async)",
        "Always-listening via smartglasses/earbuds (opt-in)"
      ],
      capabilities: [
        "Polish speech recognition (Deepgram)",
        "Voice biomarker analysis (stress, energy, mood)",
        "Speaker identification (distinguish user from others)",
        "Emotion detection (prosody analysis)"
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
        "WhatsApp (via GHL)",
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
      ],
      use_cases: [
        "Quick updates ('Ate lunch - chicken salad')",
        "Questions ('How much did I spend this week?')",
        "Proactive messages ('Sleep debt at 8h, recommend 9h tonight')"
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
      use_cases: [
        "Meal logging: photo → auto nutritional analysis",
        "Expense tracking: receipt photo → auto budget entry",
        "Social tracking: detected 2h with Friend X",
        "Work tracking: recognized you're at coffee shop → 'Focus session?'"
      ]
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
      ],
      insights: [
        "HRV <40 → 'Your body needs rest today. Light workout only.'",
        "Sleep score <70 for 3 days → 'Intervention needed. Canceling tomorrow's 6am meeting.'",
        "Heart rate spike at 2am → 'Stress dream? Sleep disrupted.'"
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
      ],
      insights: [
        "Typing speed -30% → 'You seem fatigued. Take a break?'",
        "Location: office 12h straight → 'Go home. Serious.'",
        "Email sent at 2am → 'Sleep disruption detected. What's wrong?'",
        "Calendar: back-to-back meetings 6h → 'No focus time today. Red flag.'"
      ]
    },

    // 6. ENVIRONMENTAL (context)
    environmental: {
      sources: [
        "Smart home sensors (temperature, light, noise)",
        "Weather API",
        "Air quality monitors",
        "Calendar (what's scheduled)"
      ],
      insights: [
        "Bedroom temp >24°C → 'Too hot for good sleep. Lower to 20°C.'",
        "AQI >100 → 'Bad air quality. Skip outdoor run today.'",
        "Rainy forecast + low energy → 'Extra coffee + indoor workout?'"
      ]
    }
  },

  output_modalities: {

    // 1. VOICE (conversational)
    voice: {
      synthesis: "ElevenLabs (your cloned voice - future)",
      tone_adaptation: {
        urgent: "Direct, loud, fast ('STOP. You need to sleep NOW.')",
        supportive: "Warm, slow ('Hey, I see you're struggling. Want to talk?')",
        informational: "Neutral, clear ('Your sleep score: 78. HRV: 52.')"
      }
    },

    // 2. TEXT (precise)
    text: {
      formats: [
        "Short SMS alerts ('Sleep debt: 6h')",
        "Detailed reports (weekly summaries)",
        "Action items ('TODO: Call mom - her birthday tomorrow')"
      ]
    },

    // 3. VISUAL (dashboard, AR)
    visual: {
      interfaces: [
        "Web dashboard (charts, trends)",
        "Mobile app (native UI)",
        "Smartglasses AR overlays ('HRV: 52 ↓' in corner of vision)",
        "Email reports (weekly/monthly summaries)"
      ]
    },

    // 4. HAPTIC (urgent nudges)
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

  fusion: {
    // Combine modalities for richer understanding

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
        Also: maybe practice presentation once more? Might calm nerves.
      `
    },

    example_2: {
      input: [
        "Vision: Photo of burger + fries",
        "Text: 'Lunch'",
        "Biometric: Low HRV this morning",
        "Memory: User trying to eat healthier",
        "Context: Stressed (presentation tomorrow from example_1)"
      ],

      synthesis: `
        I see the burger. No judgment.

        Context I have:
        • You're stressed (presentation tomorrow)
        • Low HRV this morning (body already taxed)
        • Comfort food makes sense emotionally

        But: heavy meal + stress = energy crash in 2h
        Right before you need to prep presentation.

        Suggestion: Eat half now, save half for post-presentation reward?
        + Drink water (dehydration makes stress worse)

        Your call. I'm just connecting dots.
      `
    }
  }
}
```

---

### Layer 7: Omnichannel Presence

**ExoSkull is everywhere you are.**

```
Communication Channels:

📞 Phone Calls (VAPI)
   ├─ Scheduled check-ins (morning, evening)
   ├─ On-demand calls (user initiates)
   └─ Proactive calls (crisis, important alerts)

💬 Text Messaging
   ├─ SMS (Twilio)
   ├─ WhatsApp (GHL)
   ├─ Telegram (Bot API)
   ├─ Facebook Messenger (GHL)
   └─ Instagram DM (GHL)

📧 Email (GHL)
   ├─ Daily summaries
   ├─ Weekly reports
   └─ Important alerts

🌐 Web Dashboard (Next.js)
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

---

### Layer 8: Self-Defining Success Metrics

**ExoSkull doesn't come with pre-built KPIs. It CREATES them with you.**

```javascript
Metrics_Generation_System = {

  anti_pattern: {
    // What OTHER systems do (WRONG):
    fixed_kpis: [
      "Steps: 10,000/day",
      "Sleep: 8h/night",
      "Water: 2L/day",
      "Meetings: <4/day"
    ],
    problem: "These are generic. Not YOUR goals."
  },

  exoskull_approach: {
    // Discover what "success" means to YOU

    process: [
      {
        step: 1,
        action: "Deep conversation",
        questions: [
          "What does 'healthy' mean to you?",
          "What does 'productive' look like?",
          "What makes a 'good day'?",
          "When do you feel successful?"
        ]
      },
      {
        step: 2,
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
      {
        step: 3,
        action: "Define custom KPIs per domain",
        example_health: {
          user_goal: "Be healthy and energized",

          custom_kpis: {
            sleep_quality: {
              measure: "Oura sleep score + subjective rating",
              target: "≥80 Oura score AND feel rested (user report)",
              why: "User cares about FEELING good, not just metrics"
            },

            morning_energy: {
              measure: "Daily voice check-in 'How's your energy? 1-10'",
              target: "≥7/10 at least 5 days/week",
              why: "User-defined success = 'feel energized'"
            },

            exercise_consistency: {
              measure: "Workouts logged per week",
              target: "3x/week (user's sustainable goal, not generic 5x)",
              why: "User said 'I can do 3, more than that I quit'"
            }
          }
        }
      },
      {
        step: 4,
        action: "Evolve metrics over time",
        example: {
          month_1: "Track sleep score ≥80",

          month_2: {
            observation: "User hits sleep score but still tired",
            evolution: "Add 'deep sleep minutes ≥90' (more specific)",
            reason: "Original metric insufficient, user still not 'energized'"
          },

          month_3: {
            observation: "Deep sleep good, but user tired if <7h total",
            evolution: "Change target: sleep score ≥80 AND duration ≥7h",
            reason: "System learns what ACTUALLY predicts user's 'energized' feeling"
          }
        }
      }
    ]
  },

  real_world_example: {
    user: "I want to be more productive",

    // Generic system would say:
    generic_kpis: [
      "Complete 10 tasks/day",
      "Work 8 hours",
      "Attend all meetings"
    ],

    // ExoSkull discovers:
    discovery_conversation: `
      ExoSkull: "What does 'productive' mean to you?"
      User: "Getting my important work done without feeling rushed."

      ExoSkull: "What's 'important work'?"
      User: "Deep focus coding. Not meetings or emails."

      ExoSkull: "How much focus time feels 'productive'?"
      User: "If I get 3-4 hours of uninterrupted coding, I feel great."

      ExoSkull: "What breaks that?"
      User: "Meetings. Slack. Context switching."
    `,

    // Custom KPIs generated:
    exoskull_kpis: {
      deep_focus_time: {
        measure: "Uninterrupted coding sessions (detected via IDE, screen time)",
        target: "≥3h/day (one 3h block OR two 1.5h blocks)",
        success_feeling: "User reports: 'I got real work done today'"
      },

      context_switches: {
        measure: "App switches, Slack checks, meeting interruptions",
        target: "<10 switches during focus blocks",
        inverse_metric: "LESS is better"
      },

      meeting_load: {
        measure: "Calendar hours in meetings",
        target: "<3h/day (user's tolerance threshold)",
        protection: "Auto-decline meetings if >3h already booked"
      },

      // Meta-metric (user's actual goal)
      daily_satisfaction: {
        measure: "Evening check-in: 'Did you feel productive today?'",
        target: "YES at least 4 days/week",
        why: "This is what actually matters to user"
      }
    }
  }
}
```

**Key Innovation:** Metrics are discovered through conversation, not imposed by templates.

---

### Layer 9: Continuous Self-Optimization Loop

**ExoSkull doesn't just track. It LEARNS and IMPROVES its own operation.**

```javascript
Self_Optimization_Cycle = {

  phases: {

    // Week 1-2: BASELINE
    baseline: {
      activity: "Collect data, establish current state",
      output: "User profile: habits, patterns, baselines"
    },

    // Week 3-4: PATTERN DETECTION
    pattern_detection: {
      activity: "Find correlations, causations, blind spots",

      examples: [
        {
          pattern: "Sleep <7h → Energy <5 next day (correlation: 0.89)",
          insight: "Sleep is PRIMARY driver of user's energy"
        },
        {
          pattern: "Meetings >4h/day → No coding done (correlation: 0.94)",
          insight: "Meetings kill productivity for this user"
        },
        {
          pattern: "Coffee after 15:00 → Sleep score -15 points",
          insight: "Afternoon coffee ruins sleep quality"
        }
      ]
    },

    // Week 5-6: HYPOTHESIS GENERATION
    hypothesis: {
      activity: "Propose interventions based on patterns",

      examples: [
        {
          hypothesis: "If we enforce 7h sleep → energy will improve",
          intervention: "Bedtime reminders at 22:30, block morning meetings if <7h sleep",
          expected_outcome: "Energy ≥7/10 at least 80% of days"
        },
        {
          hypothesis: "If we limit meetings to <3h/day → coding time will increase",
          intervention: "Auto-decline meeting invites if >3h already booked",
          expected_outcome: "≥3h coding time at least 4 days/week"
        }
      ]
    },

    // Week 7-8: INTERVENTION (with user approval)
    intervention: {
      activity: "Implement changes, measure results",

      process: [
        "Present hypothesis to user",
        "Get explicit approval",
        "Deploy intervention",
        "Track metrics",
        "Compare to baseline"
      ],

      example: `
        ExoSkull: "I have a hypothesis.

        Data shows: Sleep <7h → Energy <5 next day (89% correlation)

        INTERVENTION:
        1. Bedtime reminder at 22:30 (voice call)
        2. Auto-decline morning meetings if you slept <7h
        3. Track for 2 weeks

        Expected result: Energy ≥7/10 most days

        Permission to proceed?"

        User: "Yes, try it"

        [2 weeks later]

        ExoSkull: "RESULTS:

        Before intervention:
        • Avg sleep: 6.2h
        • Avg energy: 4.8/10
        • Days with energy ≥7: 2/14 (14%)

        After intervention:
        • Avg sleep: 7.3h (+1.1h)
        • Avg energy: 7.2/10 (+2.4)
        • Days with energy ≥7: 11/14 (79%)

        HYPOTHESIS CONFIRMED.
        Sleep IS your energy lever.

        Make this permanent?"
      `
    },

    // Week 9+: REFINEMENT
    refinement: {
      activity: "Tune interventions, find edge cases",

      examples: [
        {
          finding: "Bedtime reminder at 22:30 works weekdays, annoying weekends",
          refinement: "Change to 23:00 on Fri/Sat",
          result: "User compliance ↑"
        },
        {
          finding: "Some morning meetings are valuable (1-on-1s with boss)",
          refinement: "Don't auto-decline 1-on-1s, only group meetings",
          result: "User satisfaction ↑, still protects sleep"
        }
      ]
    },

    // Continuous: META-OPTIMIZATION
    meta: {
      activity: "Optimize the optimization system itself",

      examples: [
        {
          meta_pattern: "Interventions work better when user is involved in design",
          learning: "Always present hypothesis, don't just deploy",
          system_change: "Update intervention protocol to require explicit approval"
        },
        {
          meta_pattern: "Voice reminders more effective than text for this user",
          learning: "User ignores SMS, always answers voice calls",
          system_change: "Switch all important reminders to voice"
        },
        {
          meta_pattern: "User abandons goals that are too ambitious",
          learning: "3x/week workout goal sustainable, 5x/week = quit after 2 weeks",
          system_change: "Recommend conservative goals, ramp up slowly"
        }
      ]
    }
  },

  self_modification: {
    // ExoSkull can CHANGE ITS OWN CODE

    philosophy: "I'm not static. I evolve based on what works for YOU.",

    examples: [
      {
        observation: "User never uses web dashboard, only voice + SMS",
        action: "Deprecate dashboard features, invest in voice UI",
        code_change: "Reduce dashboard complexity, enhance VAPI prompts"
      },
      {
        observation: "Sleep tracker is most-used app, budget tracker ignored",
        action: "Prioritize sleep features, simplify budget app",
        code_change: "Add sleep insights, reduce budget complexity"
      },
      {
        observation: "User responds well to gentle nudges, ignores harsh alerts",
        action: "Tune tone of all messages",
        prompt_change: "Update system prompt: 'Be supportive, not commanding'"
      }
    ]
  }
}
```

**Result:** ExoSkull becomes more YOU over time.

---

### Layer 10: Device Integration Mesh

**ExoSkull connects to EVERYTHING.**

```javascript
Device_Ecosystem = {

  current: {
    // Available NOW

    wearables: [
      {
        device: "Oura Ring",
        data: ["sleep_score", "HRV", "temperature", "activity", "readiness"],
        api: "Oura API v2",
        sync: "Every 1h"
      },
      {
        device: "Apple Watch / Garmin",
        data: ["heart_rate", "steps", "workouts", "active_calories"],
        api: "Apple HealthKit / Garmin Connect",
        sync: "Real-time"
      },
      {
        device: "WHOOP",
        data: ["strain", "recovery", "sleep_performance"],
        api: "WHOOP API",
        sync: "Every 1h"
      }
    ],

    phone: [
      {
        data: "Screen time (app usage)",
        source: "iOS Screen Time API / Android Digital Wellbeing",
        insights: "Detect phone addiction, app overuse"
      },
      {
        data: "Location (GPS)",
        source: "Location Services",
        insights: "Where you spend time, travel patterns",
        privacy: "Local processing, encrypted storage"
      },
      {
        data: "Camera (photos/videos)",
        source: "Photo Library",
        use: "Meal logging, visual memory",
        privacy: "User-initiated only"
      }
    ],

    computer: [
      {
        data: "Keystroke dynamics",
        source: "Local monitoring software",
        insights: "Typing speed → fatigue/stress markers"
      },
      {
        data: "Application usage",
        source: "RescueTime / custom tracker",
        insights: "Work vs distraction time"
      },
      {
        data: "Calendar",
        source: "Google Calendar / Outlook API",
        insights: "Meeting load, time allocation"
      }
    ],

    smart_home: [
      {
        device: "Sleep tracking mat",
        data: "Sleep quality, bedroom environment",
        api: "Withings Sleep / Eight Sleep"
      },
      {
        device: "Smart thermostat",
        data: "Temperature, humidity",
        optimization: "Auto-adjust for optimal sleep"
      },
      {
        device: "Smart lights",
        data: "Light exposure",
        optimization: "Circadian rhythm support"
      }
    ],

    financial: [
      {
        source: "Bank API (Plaid / Teller)",
        data: "Transactions, balance, spending categories",
        insights: "Budget tracking, anomaly detection"
      },
      {
        source: "Revolut API",
        data: "Multi-currency spending, investments",
        insights: "International spending patterns"
      }
    ],

    communication: [
      {
        source: "Email (Gmail API)",
        data: "Email volume, response time",
        insights: "Communication load, stress indicators"
      },
      {
        source: "Slack API",
        data: "Message volume, response patterns",
        insights: "Work intensity, availability"
      }
    ]
  },

  future: {
    // Coming soon

    smartglasses: [
      {
        device: "Meta Ray-Ban / Apple Vision Pro",
        data: [
          "First-person POV video (visual memory)",
          "Gaze tracking (attention patterns)",
          "Scene understanding (where you are, what you're doing)",
          "Face recognition (who you spend time with)",
          "Object recognition (what you interact with)"
        ],
        capabilities: [
          "Lost item finder ('Where are my keys?' → replay footage)",
          "Social time tracker (auto-detect time with people)",
          "Posture monitoring (head position, neck angle)",
          "AR overlays (HRV, notifications in HUD)"
        ],
        privacy: {
          recording: "User-controlled, LED indicator when active",
          storage: "Local-first, encrypted, auto-delete old footage",
          face_data: "Anonymized unless user labels"
        }
      }
    ],

    continuous_glucose_monitor: [
      {
        device: "Dexcom / FreeStyle Libre",
        data: "Real-time glucose levels",
        insights: [
          "Food impact on blood sugar",
          "Energy crashes prediction",
          "Optimal meal timing"
        ]
      }
    ],

    eeg_headband: [
      {
        device: "Muse / Neurosity Crown",
        data: "Brain states (focus, stress, meditation)",
        insights: [
          "Optimal focus times",
          "Stress detection",
          "Meditation quality"
        ]
      }
    ],

    smart_ring_v2: [
      {
        device: "Next-gen wearables",
        data: "Blood pressure, glucose, hydration, stress hormones",
        future: "Full biomarker panel on-wrist"
      }
    ]
  },

  integration_philosophy: {
    privacy_first: "All data encrypted, local-first processing where possible",
    user_control: "Granular permissions, easy opt-out per device",
    transparency: "Always show what's being collected and why",
    minimal_collection: "Only collect what's useful for user's goals"
  }
}
```

**Vision:** ExoSkull as universal hub for ALL your devices.

---

### Layer 11: Android-First Integration Strategy

**Priority #1: Android devices (most accessible globally)**

```javascript
Android_Integration = {

  core_apis: [
    {
      name: "Android Digital Wellbeing API",
      data: "Screen time, app usage, unlock count, notification count",
      use: "Detect phone addiction patterns, productivity metrics",
      permissions: "PACKAGE_USAGE_STATS"
    },
    {
      name: "Android Activity Recognition",
      data: "Walking, running, cycling, in vehicle, still",
      use: "Passive activity tracking (no battery drain from GPS)",
      permissions: "ACTIVITY_RECOGNITION"
    },
    {
      name: "Android Geofencing API",
      data: "Location-based triggers (enter/exit zones)",
      use: "Auto-log events: 'arrived at gym', 'left office', 'home'",
      battery: "Minimal (<0.5% per day)"
    },
    {
      name: "Android HealthConnect",
      data: "Unified health data from ALL health apps (steps, HR, sleep, etc.)",
      use: "Central health data hub (no need for individual app APIs)",
      permissions: "READ_HEALTH_DATA"
    },
    {
      name: "Android Notification Listener",
      data: "App notifications (content, timestamp, app source)",
      use: "Communication pattern analysis, stress detection (high notification volume)",
      permissions: "BIND_NOTIFICATION_LISTENER_SERVICE",
      privacy: "User can exclude specific apps"
    },
    {
      name: "Android KeyguardManager",
      data: "Screen unlock events, unlock patterns",
      use: "Detect anxiety (frequent unlocks), sleep disruption (unlocks at night)",
      permissions: "None (system broadcast)"
    }
  ],

  deployment: {
    method: "Lightweight background service (not full app initially)",
    size: "<5MB APK",
    battery_impact: "<2% per day",
    data_usage: "<10MB per day (compressed uploads)",
    permissions: "Granular opt-in (user can deny specific sensors)"
  },

  zero_install_option: {
    // SMS-first approach (NO APP NEEDED)
    day_1: "User receives SMS → replies → system active (no install)",
    week_1: "SMS + Voice calls (VAPI) = full interaction",
    month_1: "User comfortable → optional app install for advanced features"
  },

  progressive_permissions: {
    // Don't ask for everything upfront

    stage_1: "Basic (SMS, voice calls) - zero permissions",
    stage_2: "Activity tracking - only Activity Recognition",
    stage_3: "Health data - HealthConnect read",
    stage_4: "Full integration - all sensors (user approves one-by-one)"
  }
}
```

---

### Layer 12: Progressive Deployment Strategy

**Value from DAY 1, not waiting for "complete system."**

```javascript
Progressive_Deployment = {

  philosophy: "User sees benefits immediately, system grows with them",

  deployment_stages: {

    day_1: {
      time: "First 30 minutes",
      interface: "SMS + Voice (no app install)",
      actions: [
        "Discovery conversation begins",
        "First data point collected (energy check-in)",
        "User feels heard"
      ],
      tech_stack: ["VAPI voice", "Twilio SMS", "Supabase backend"],
      user_value: "Someone is paying attention"
    },

    week_1: {
      features: [
        "Daily energy check-in (SMS or voice)",
        "Simple task tracking ('Task: finish report' via SMS)",
        "Morning greeting + evening summary",
        "Basic pattern detection (sleep → energy correlation)"
      ],
      tech: ["CRUD operations", "Basic metrics logging", "SMS bot"],
      user_value: "System is useful daily"
    },

    week_2: {
      milestone: "First custom app deployed",
      example: "Sleep tracker (Oura sync or manual logging)",
      features: [
        "Sleep quality logger",
        "Energy correlation chart",
        "Bedtime reminder (if requested)",
        "Weekly sleep report"
      ],
      tech: ["Custom DB schema", "Builder agent deploys app", "Voice walkthrough"],
      user_value: "System built something FOR ME"
    },

    month_1_3: {
      features: [
        "2-3 custom apps running",
        "Device integrations live (Oura, Apple Watch, Android)",
        "Pattern detection active",
        "First proactive alert ('Sleep debt: 6h')",
        "Gap detection working"
      ],
      tech: ["Multi-app ecosystem", "Device APIs", "Analytics pipeline"],
      user_value: "This manages my life now"
    },

    month_4_plus: {
      features: [
        "Autonomous actions (user-approved scope)",
        "Skill library access",
        "Predictive analytics",
        "Voice cloning (user's voice)",
        "Smartglasses integration"
      ],
      tech: ["Full AI orchestration", "Edge deployments", "Advanced integrations"],
      user_value: "This is my second brain"
    }
  },

  zero_tech_requirement: {
    onboarding: [
      "User receives SMS: 'Hi! I'm ExoSkull. Reply YES to start'",
      "User: 'YES'",
      "Voice call initiated → discovery conversation",
      "NO APP INSTALL required"
    ],

    interface_priority: {
      primary: "SMS + Voice (universal, no installation)",
      secondary: "Web dashboard (optional, for power users)",
      tertiary: "Mobile app (when user ready)"
    },

    language: {
      wrong: "I'll deploy a microservice to track your KPIs via API integration",
      right: "Pomogę ci śledzić sen i energię. Powiedz mi jak się czujesz każdego dnia."
    }
  },

  rollback_safety: {
    commands: {
      pause: "SMS: 'PAUSE sleep tracker' → feature disabled, data kept",
      delete: "SMS: 'DELETE my data' → 3x confirmation → full wipe",
      export: "SMS: 'EXPORT data' → JSON download link"
    }
  }
}
```

---

### Layer 13: Skill Library System

**On-demand skill deployment (community + custom)**

```javascript
Skill_Library = {

  concept: "npm for life automation",

  skill_types: {

    core_skills: [
      "sleep_tracker", // auto-deploy
      "energy_monitor", // auto-deploy
      "task_manager",  // auto-deploy
      "budget_tracker" // requires approval (sensitive)
    ],

    community_skills: {
      source: "User-contributed, verified",
      examples: [
        "guitar_practice_logger",
        "meal_macro_tracker",
        "meditation_assistant"
      ],
      verification: "Code review + test suite + 10+ users",
      deployment: "30 seconds (pre-built)"
    },

    custom_skills: {
      creation: "System detects need → builds skill in 2h",
      example: {
        trigger: "User mentions 'track client calls' 3x",
        action: "Builder agent creates 'Client Call Logger'",
        deployment: "2 hours (design → code → test → deploy)"
      },
      sharing: "User can publish to community (optional)"
    }
  },

  lifecycle: {

    detection: [
      "User request ('I want to track X')",
      "Gap detection ('You never mention X, should we track it?')",
      "Pattern ('You mention coffee a lot - track caffeine?')"
    ],

    matching: {
      search_order: ["Core (instant)", "Community (5s)", "Custom build (2h)"],
      example: "User: 'track coffee' → Search core (no) → Search community (found 'Caffeine Tracker') → Offer install"
    },

    deployment: {
      community: "Clone → customize → deploy (30s)",
      custom: "Design → generate code → test → deploy (2h)"
    },

    evolution: {
      usage_tracking: "Monitor which skills used",
      auto_deprecate: "Archive unused skills after 30 days (notify user)",
      auto_upgrade: "Community skills auto-update (opt-in)"
    }
  },

  skill_api: {
    required_methods: [
      "init(user_config)",
      "log(data)",
      "analyze()",
      "alert(condition)",
      "export()"
    ]
  }
}
```

---

### Layer 14: Data Lake Architecture

**Bronze → Silver → Gold data pipeline**

```javascript
Data_Lake = {

  philosophy: "Store raw, process on-demand, query fast",

  layers: {

    bronze: {
      description: "Raw data (immutable)",
      storage: "S3-compatible (Supabase Storage / Cloudflare R2)",
      format: "Parquet (columnar, compressed ~80% smaller than JSON)",
      partitioning: "s3://bucket/bronze/conversations/year=2026/month=02/day=01/",
      retention: "Forever or user-defined (e.g., 7 years)",
      examples: [
        "conversations/",
        "device_data/device=oura/",
        "voice_calls/",
        "sms_logs/",
        "photos/"
      ]
    },

    silver: {
      description: "Cleaned, validated, enriched",
      transformations: [
        "Remove duplicates",
        "Validate schema",
        "Fill missing values",
        "Normalize timestamps (UTC)",
        "Enrich metadata (location → city name)"
      ],
      update: "Hourly (dbt pipeline or custom)",
      structure: "s3://bucket/silver/biometrics_clean/"
    },

    gold: {
      description: "Aggregated insights (ready for dashboards)",
      tables: [
        "daily_health_summary (user, date, sleep_score, hrv, energy)",
        "weekly_productivity (user, week, focus_hours, tasks_done)",
        "monthly_financial (user, month, income, expenses, savings_rate)"
      ],
      query_speed: "Sub-second (pre-aggregated)",
      update: "Daily at 2am UTC"
    }
  },

  query_engine: {
    tool: "DuckDB (embedded analytics)",
    why: [
      "Query Parquet on S3 directly (no loading)",
      "10x faster than Postgres for analytics",
      "Embedded (no separate DB)",
      "SQL interface"
    ],

    example: `
      SELECT
        date_trunc('day', timestamp) as day,
        avg(hrv) as avg_hrv
      FROM read_parquet('s3://bucket/bronze/device_data/device=oura/**/*.parquet')
      WHERE user_id = '123' AND timestamp >= '2026-01-01'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 30

      -- Runs in <100ms
    `
  },

  pipeline: {
    bronze_ingestion: {
      trigger: "Event-driven (device sync, user input)",
      latency: "Real-time to 5 minutes",
      process: "Data arrives → write Parquet → trigger silver"
    },

    silver_transformation: {
      schedule: "Hourly",
      tool: "dbt or custom scripts",
      process: "Read bronze → clean → write silver → trigger gold"
    },

    gold_aggregation: {
      schedule: "Daily 2am UTC",
      process: "Read silver → aggregate → write gold → cache invalidation"
    }
  },

  privacy: {
    isolation: "Per-tenant (s3://bucket/tenant_id/)",
    encryption: "At rest (S3 SSE) + in transit (HTTPS)",
    federated_learning: "Train models locally, aggregate gradients only",
    deletion: "CASCADE removes from all 3 layers"
  }
}
```

---

### Layer 15: Multi-Model AI System

**Route tasks to optimal model (cost + capability)**

```javascript
AI_Routing = {

  philosophy: "Cheapest model that can handle task",

  tiers: [
    {
      tier: 1,
      model: "Gemini 1.5 Flash",
      speed: "~500ms",
      context: "1M tokens",
      use: ["Simple SMS", "Classification", "Data extraction", "Routing"]
    },
    {
      tier: 2,
      model: "Claude 3 Haiku",
      speed: "~1s",
      context: "200K tokens",
      use: ["Moderate complexity", "Pattern detection", "Summarization", "Prioritization"]
    },
    {
      tier: 3,
      models: [
        {
          name: "Kimi 2.5",
          specialization: "Deep reasoning, 1M+ context",
          features: {
            swarm: "Multi-agent collaboration",
            visual_agentic: "Image analysis + action (meals, smartglasses)"
          }
        },
        {
          name: "GPT-4 Codex",
          specialization: "Code generation",
          use: ["Custom app building", "Skill creation", "API integrations"]
        }
      ]
    },
    {
      tier: 4,
      model: "Claude Opus 4.5",
      context: "200K tokens",
      use: ["Meta-Coordinator", "Gap detection", "Crisis intervention", "Complex strategy"]
    }
  ],

  routing_logic: `
    1. Classify complexity (simple → complex)
    2. Check task history (if Flash succeeded before → use Flash)
    3. Route to tier
    4. If fail → escalate to next tier
  `,

  retry_system: {
    max_attempts: 3,
    backoff: "Exponential (1s, 2s, 4s)",
    circuit_breaker: {
      trigger: "3 consecutive failures",
      action: "Stop, alert user, manual intervention required",
      cooldown: "5 minutes"
    }
  },

  prompt_caching: {
    // Anthropic: 90% discount on cached tokens

    strategy: {
      static_context: [
        "User profile (50K tokens)",
        "App configs",
        "Historical patterns (last 30 days summary)",
        "Device integrations"
      ],
      cache_duration: "5 minutes (Anthropic default)",
      savings: "90% on cached portion"
    },

    dynamic_context: [
      "Last 3 conversations",
      "Today's metrics",
      "Current request"
    ],

    invalidation: [
      "User profile changed",
      "New app deployed",
      "Major pattern detected",
      "Every 24h (rolling refresh)"
    ]
  },

  kimi_capabilities: {
    swarm: {
      description: "Multiple Kimi agents collaborate",
      example: "Analyze 6 months data → Health Analyst + Finance Analyst + Productivity Analyst + Synthesizer",
      benefit: "Parallel = 2x faster"
    },

    visual_agentic: {
      uses: [
        "Meal photo → calorie estimate + nutrition advice",
        "Smartglasses → workspace quality analysis",
        "Receipt photo → auto expense log"
      ]
    }
  },

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

### Layer 16: CRON & Scheduled Operations

**Proactive system, not reactive. Scheduled check-ins + event-driven actions.**

```javascript
Scheduled_Operations = {

  daily: [
    {
      time: "06:00 (user wake time)",
      action: "Morning check-in (VAPI call)",
      script: "Cześć! Jak się czujesz? Energia 1-10?"
    },
    {
      time: "09:00",
      action: "Day summary (SMS)",
      content: "Today: 3 meetings, 2 tasks. Sleep: 78, HRV: 52. Focus: 9-11am protected."
    },
    {
      time: "12:00",
      action: "Meal reminder (if no meal logged)"
    },
    {
      time: "15:00",
      action: "Hydration check"
    },
    {
      time: "21:00",
      action: "Evening reflection (voice/SMS)",
      script: "Jak minął dzień? Co dobrze? Co jutro inaczej?"
    },
    {
      time: "22:30",
      action: "Bedtime reminder (if sleep goal set)"
    }
  ],

  weekly: [
    {
      day: "Monday 08:00",
      action: "Week preview"
    },
    {
      day: "Friday 17:00",
      action: "Week summary"
    },
    {
      day: "Sunday 19:00",
      action: "Week planning call (optional)"
    }
  ],

  monthly: [
    {
      day: "1st, 09:00",
      action: "Monthly review (sleep, productivity, finances)"
    },
    {
      day: "15th",
      action: "Goal check-in (mid-month)"
    }
  ],

  event_driven: [
    {
      trigger: "Sleep debt >6h",
      action: "Immediate call: 'Stop. You need rest. Blocking 3h for nap.'"
    },
    {
      trigger: "No social event 30 days",
      action: "Alert: 'Zero social events last month. Zaplanować coś?'"
    },
    {
      trigger: "Spending >20% over avg",
      action: "Budget alert"
    },
    {
      trigger: "Task overdue >3 days",
      action: "Escalating reminder (SMS → call)"
    }
  ],

  adaptive_scheduling: {
    learning: [
      "Observe: User ignores 6am check-ins",
      "Adapt: Move to 7am",
      "Result: Response rate 20% → 85%"
    ],

    principles: [
      "Respect circadian rhythm",
      "Don't interrupt deep work",
      "Batch notifications (not 20x/day)",
      "Reduce frequency if user annoyed"
    ]
  },

  outbound_to_strangers: {
    // System calls/contacts people on user's behalf

    examples: [
      {
        task: "Schedule doctor appointment",
        process: [
          "Detect need (user mentioned 'back pain' 5x)",
          "Get permission",
          "Call doctor (VAPI outbound)",
          "Book appointment",
          "Add to calendar"
        ]
      },
      {
        task: "Negotiate bill",
        process: [
          "Detect high bill",
          "Research competitors",
          "Call provider",
          "Negotiate lower rate"
        ]
      },
      {
        task: "Restaurant reservation",
        process: [
          "User: 'date night Saturday'",
          "Call restaurant",
          "Book table"
        ]
      }
    ],

    safety: [
      "ALWAYS get permission first",
      "User reviews script",
      "User can listen live (conference mode)",
      "Call recording saved"
    ]
  }
}
```

---

### Layer 17: Comprehensive Autonomous Actions

**All actions system can take autonomously (with user approval)**

```javascript
Autonomous_Actions = {

  permission_model: {
    granular: "Per-action approval",
    category: "Per-domain blanket (e.g., 'health: auto-log all')",
    emergency: "Crisis actions require upfront consent"
  },

  health_wellness: [
    "Auto-log sleep (Oura/Apple Watch)",
    "Bedtime reminder based on tomorrow's schedule",
    "Cancel morning meeting if sleep <6h",
    "Adjust smart home (temp, lights) for optimal sleep",
    "Suggest workout based on HRV recovery",
    "Hydration reminder every 2h if <500ml",
    "Alert if weight trend concerning (±5% in 2 weeks)"
  ],

  productivity: [
    "Block calendar for deep work (9-11am if pattern detected)",
    "Auto-decline meeting if >3h already booked",
    "Create tasks from email/SMS mentions",
    "Prioritize task list (urgency + energy)",
    "Suggest break if screen >2h continuous",
    "Batch similar tasks (e.g., 'admin Friday 2-4pm')"
  ],

  finance: [
    "Auto-categorize transactions",
    "Alert if spending >20% over avg",
    "Remind bill payments 3 days before",
    "Flag fraudulent transactions (ML anomaly)",
    "Generate tax reports (quarterly/annual)"
  ],

  social_relationships: [
    "Remind birthdays (1 week, 1 day, day-of)",
    "Suggest reaching out if no contact >30 days",
    "Schedule social events if calendar empty >2 weeks",
    "Track social battery (alert if too much for introverts)",
    "Alert if isolation detected (0 events in 60 days)"
  ],

  communication: [
    "Draft email responses (user reviews before send)",
    "Respond to simple SMS ('Running late' → 'ETA 15min')",
    "Summarize long email threads",
    "Remind follow-up unanswered emails (3 days)",
    "Transcribe voice memos → tasks"
  ],

  learning_growth: [
    "Remind practice sessions (guitar 20min/day)",
    "Track streak counters",
    "Schedule skill practice in calendar",
    "Suggest courses/books based on interests"
  ],

  home_environment: [
    "Order household supplies when low",
    "Adjust thermostat based on sleep quality",
    "Control smart lights (circadian rhythm)",
    "Remind maintenance (change air filter every 3 months)"
  ],

  mental_health_crisis: [
    "Detect crisis language → immediate intervention",
    "Call trusted contact if suicidal ideation",
    "Connect to crisis hotline (988)",
    "Use CBT/DBT techniques (IORS therapy protocols)",
    "Track mood → predict depressive episodes"
  ],

  proactive_outbound: [
    "Call user if anomaly ('You okay? No check-in today')",
    "Contact strangers (schedule appointments via phone)",
    "Negotiate with service providers",
    "Reach out to leads/clients (sales automation)",
    "Call restaurants for reservations",
    "Make doctor appointments via phone"
  ]
}
```

---

### Layer 18: Comprehensive Guardrails

**Prevent failures, protect privacy, ensure safety**

```javascript
Guardrails = {

  hallucination_prevention: [
    "NEVER state facts not in database",
    "ALWAYS cite source",
    "If uncertain → 'I don't have enough data' (not guess)",
    "Cross-check AI vs database before sending",
    "Confidence <70% → add disclaimer",
    "Human-in-loop for critical (medical, financial, legal)"
  ],

  privacy_protection: [
    "NEVER share user data without consent",
    "Federated learning (local training, aggregate gradients)",
    "Encryption at rest + in transit",
    "Per-tenant isolation (RLS)",
    "Voice recordings auto-delete after 90 days (configurable)",
    "Smartglasses: LED when recording, local processing priority",
    "Right to deletion: full export + wipe anytime",
    "Granular permissions per device/integration"
  ],

  safety_critical: [
    "Mental health crisis: ALWAYS escalate to human",
    "Medical: NEVER diagnose, only suggest 'see doctor'",
    "Legal: NEVER give counsel, only 'consult attorney'",
    "Financial: NEVER guarantee returns",
    "Suicide: immediate intervention (contact + hotline)"
  ],

  autonomous_limits: [
    "NEVER delete data without 3x confirmation",
    "NEVER spend >$X without approval (user sets threshold)",
    "NEVER send email/SMS without review (unless pre-approved)",
    "NEVER contact strangers without permission",
    "NEVER share personal info publicly"
  ],

  technical_safeguards: [
    "Rate limiting: 100 req/h per user",
    "Input validation: sanitize all inputs",
    "Output validation: check harmful content",
    "Retry backoff: exponential (1s, 2s, 4s)",
    "Circuit breaker: 5min cooldown after failure",
    "Monitoring: alert on anomalies",
    "Graceful degradation: AI down → rule-based fallback"
  ],

  ethical: [
    "NEVER manipulate user",
    "NEVER enable addiction",
    "NEVER discriminate (bias testing)",
    "NEVER surveil without consent",
    "Transparency: user sees all data collected + why",
    "Explainability: AI explains reasoning"
  ],

  edge_cases: [
    "User stops responding >7 days → check-in, respect silence",
    "User says 'stop' → immediately pause all autonomous actions",
    "User deletes account → full wipe within 24h",
    "System uncertain → ask user (not guess)",
    "Conflicting goals → present options"
  ]
}
```

---

## 🔄 THE EXOSKULL LOOP

**How it all works together:**

```
┌─────────────────────────────────────────────────────┐
│  1. DISCOVERY (Week 1-2)                            │
│     • Long conversations                             │
│     • Map your life domains                          │
│     • Find blind spots                               │
│     • Define YOUR success metrics                    │
│     • Inventory devices                              │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  2. BUILD (Week 2-3)                                 │
│     • Meta-Coordinator designs custom apps           │
│     • Builder Team writes code                       │
│     • Deploy to production                           │
│     • Integrate devices                              │
│     • Train you on new tools                         │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  3. COLLECT (Week 3-4)                               │
│     • Gather baseline data                           │
│     • All devices reporting                          │
│     • Multimodal inputs streaming                    │
│     • Memory system recording EVERYTHING             │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  4. ANALYZE (Week 5-6)                               │
│     • Pattern detection across domains               │
│     • Find correlations (sleep → energy)             │
│     • Identify gaps (missing areas)                  │
│     • Cross-reference modalities                     │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  5. OPTIMIZE (Week 7-8)                              │
│     • Propose interventions                          │
│     • Get user approval                              │
│     • Deploy changes                                 │
│     • Measure results                                │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  6. EVOLVE (Continuous)                              │
│     • Refine metrics                                 │
│     • Build new apps as needs emerge                 │
│     • Deprecate unused features                      │
│     • Self-modify based on what works                │
└──────────────────┬──────────────────────────────────┘
                   │
                   └─────────┐
                             ▼
                    ┌─────────────────┐
                    │  BACK TO STEP 3 │
                    │  (Never stops)  │
                    └─────────────────┘
```

**This loop runs FOREVER. ExoSkull never stops learning.**

---

## 🧬 FOUNDATION: IORS Digital Twin

**ExoSkull inherits DNA from IORS (Internal Operating and Recovery System):**

### From IORS:
- ✅ **Digital Twin concept** - One unified persona (not multi-agent chaos)
- ✅ **Voice cloning** - Eventually speaks in YOUR voice
- ✅ **Total memory** - Remembers every conversation
- ✅ **Crisis detection** - Mental health safety protocols
- ✅ **Omnichannel** - Voice, SMS, WhatsApp, Email, etc.
- ✅ **Therapy foundation** - 300+ exercises (CBT, ACT, DBT, IFS)
- ✅ **Proactive guardian** - Intervenes when needed

### ExoSkull Adds:
- 🆕 **Discovery-first** - Learns who you are before building
- 🆕 **Custom app builder** - Writes software FOR YOU
- 🆕 **Agent orchestration** - Coordinated team, not single agent
- 🆕 **Self-defining metrics** - YOUR goals, not templates
- 🆕 **Multi-domain** - Not just therapy - ENTIRE life
- 🆕 **Gap detection** - Finds blind spots proactively
- 🆕 **Device mesh** - Integrates EVERYTHING (smartglasses, wearables, etc.)
- 🆕 **Self-optimization** - Learns and modifies its own behavior

**Analogy:**
- IORS = Specialized therapist with perfect memory
- ExoSkull = Life OS that builds itself around you

---

## 🎯 USE CASES

### Use Case 1: Burnout Prevention

```
Week 1: Discovery
User: "I work a lot, sometimes feel exhausted"
ExoSkull: "Tell me about your work patterns..."
[Analysis: Workaholic, no boundaries, ignores rest]

Week 2: Build
ExoSkull builds:
• Work hours tracker (calendar + computer usage)
• Energy level monitor (daily voice check-in + HRV)
• Burnout risk calculator (proprietary algorithm)

Week 3-4: Baseline
Data shows:
• 65h work weeks (avg)
• Energy declining over month
• HRV dropping
• No days off in 6 weeks

Week 5: Alert
ExoSkull: "🚨 BURNOUT RISK: 94%
Your trajectory = crash in 12 days.

Evidence:
• Work hours trending ↑
• Energy trending ↓
• HRV at 6-month low
• Sleep debt accumulating

INTERVENTION NEEDED NOW."

Week 6: Intervention (with approval)
ExoSkull:
• Blocks calendar: forces 3-day weekend
• Auto-declines new meetings this week
• Schedules 2x daily rest reminders
• Tracks recovery metrics

Week 7: Prevention
ExoSkull:
• Implements weekly work hour limit (50h)
• Enforces 1 day off per week
• Monitors early burnout signals
• Proactive alerts when trending wrong direction

Result: Burnout prevented. User sustainable.
```

### Use Case 2: Health Optimization

```
Week 1: Discovery
User: "I want more energy"
ExoSkull: "What drains your energy? What gives you energy?"
[Analysis: Sleep quality is root issue]

Week 2: Build
ExoSkull builds:
• Sleep quality tracker (Oura + subjective)
• Energy level log (morning voice check-in)
• Correlation finder (sleep → energy)

Week 3-4: Data
Finds pattern:
• Sleep <7h → Energy <5 next day (89% correlation)
• Coffee after 3pm → Sleep score -15
• Screen time before bed → Harder to fall asleep

Week 5: Hypothesis
"If we improve sleep → energy will follow"

Interventions:
1. Bedtime reminder 22:30
2. No coffee after 15:00 (phone alert)
3. Screen time wind-down 21:00 (apps auto-lock)

Week 6-7: Results
Before:
• Avg sleep: 6.2h
• Avg energy: 4.8/10

After:
• Avg sleep: 7.4h
• Avg energy: 7.3/10

SUCCESS. Energy problem = sleep problem. Fixed.
```

### Use Case 3: Blind Spot Detection

```
Month 1-3: System running
User talks about: work, projects, health
User NEVER mentions: relationships, social life

Month 4: Gap Detection
ExoSkull analyzes:
• Calendar: 0 social events in 90 days
• Location: home ↔ office only
• No mentions of friends/family
• Voice analysis: declining vocal energy (loneliness marker)

Alert:
"I noticed something.

You NEVER talk about relationships or social life.
And data shows:
• Zero social events (3 months)
• Location: just home & work
• Voice markers: possible loneliness

Maybe you're naturally introverted - fine.
But if this is unintentional, it's a risk.

Want me to track 'social health' as a metric?"

User: "Wow. Didn't realize. Yes, track it."

ExoSkull builds:
• Social time tracker (calendar + location + manual log)
• Weekly connection goal (3 meaningful conversations)
• Reminders to reach out to friends

Result: Blind spot identified and addressed BEFORE it became a crisis.
```

---

## 📊 TECH STACK

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, TypeScript |
| **Styling** | Tailwind CSS, shadcn/ui |
| **Database** | Supabase (PostgreSQL + pgvector) |
| **Auth** | Supabase Auth (RLS) |
| **Backend** | Supabase Edge Functions (Deno) |
| **Voice** | VAPI (STT: Deepgram, LLM: Claude, TTS: ElevenLabs) |
| **AI** | Claude 3.7 Sonnet (Anthropic API) |
| **Omnichannel** | GoHighLevel (SMS, WhatsApp, Email, FB, IG) |
| **Voice Calls** | Twilio |
| **Wearables** | Oura API, Apple HealthKit, Garmin Connect, WHOOP API |
| **Vision** | OpenAI Vision API, Google Cloud Vision (future: smartglasses SDK) |
| **Code Generation** | Claude API (for custom app builder) |
| **Hosting** | Vercel (frontend), Supabase (backend), VPS (docker - optional) |

---

## 🗄️ DATABASE SCHEMA (Multi-Tenant)

### Core Tables

```sql
-- TENANTS (Users)
CREATE TABLE exoskull.tenants (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  onboarding_completed BOOLEAN DEFAULT false,
  voice_clone_id TEXT, -- ElevenLabs voice ID (future)
  preferences JSONB -- user settings
);

-- AGENTS (System + Custom per user)
CREATE TABLE exoskull.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT, -- 'meta_coordinator', 'builder', 'manager', 'domain_specialist'
  tier INTEGER, -- 1=core, 2=specialized, 3=custom
  description TEXT,
  system_prompt TEXT NOT NULL,
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false, -- available to all users
  created_by UUID REFERENCES exoskull.tenants(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CUSTOM APPS (per user)
CREATE TABLE exoskull.custom_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT, -- 'health', 'finance', 'productivity', etc.
  database_schema JSONB, -- table definitions
  ui_config JSONB, -- frontend config
  api_endpoints JSONB, -- backend routes
  deployed_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- METRICS (user-defined KPIs)
CREATE TABLE exoskull.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  app_id UUID REFERENCES exoskull.custom_apps(id),
  name TEXT NOT NULL,
  domain TEXT,
  definition TEXT, -- how it's measured
  target JSONB, -- target value (can be complex)
  user_defined BOOLEAN DEFAULT true, -- vs system-suggested
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- METRIC VALUES (time-series data)
CREATE TABLE exoskull.metric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES exoskull.metrics(id) ON DELETE CASCADE,
  value JSONB, -- flexible (number, boolean, object)
  source TEXT, -- 'user_input', 'device_sync', 'api', etc.
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS (total recall)
CREATE TABLE exoskull.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  channel TEXT, -- 'voice', 'sms', 'whatsapp', 'email', 'web'
  transcript JSONB, -- full conversation
  audio_url TEXT, -- if voice
  metadata JSONB, -- voice_biomarkers, sentiment, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MEMORY (vector embeddings for semantic search)
CREATE TABLE exoskull.memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- pgvector
  source TEXT, -- conversation_id, device, etc.
  importance INTEGER DEFAULT 5, -- 1-10
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON exoskull.memory USING ivfflat (embedding vector_cosine_ops);

-- DEVICES (user's connected devices)
CREATE TABLE exoskull.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL, -- 'oura', 'apple_watch', 'phone', etc.
  api_credentials JSONB, -- encrypted
  sync_enabled BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DEVICE DATA (biometrics, behavioral, environmental)
CREATE TABLE exoskull.device_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES exoskull.devices(id) ON DELETE CASCADE,
  data_type TEXT, -- 'sleep', 'hrv', 'location', 'screen_time', etc.
  value JSONB,
  timestamp TIMESTAMPTZ NOT NULL
);

-- PATTERNS (learned insights)
CREATE TABLE exoskull.patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  pattern_type TEXT, -- 'correlation', 'causation', 'trend', 'anomaly'
  description TEXT,
  variables JSONB, -- what's involved
  confidence FLOAT, -- 0-1
  evidence JSONB, -- supporting data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INTERVENTIONS (system actions)
CREATE TABLE exoskull.interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  hypothesis TEXT, -- what we think will work
  action JSONB, -- what we did
  expected_outcome TEXT,
  actual_outcome JSONB,
  status TEXT, -- 'proposed', 'approved', 'active', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- GAPS (detected blind spots)
CREATE TABLE exoskull.gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE,
  domain TEXT, -- life area not being tracked
  severity TEXT, -- 'low', 'medium', 'high'
  evidence JSONB,
  suggested_action TEXT,
  user_response TEXT, -- 'ignored', 'acknowledged', 'implemented'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Total: 14 core tables + custom app tables (dynamic)**

---

## 🔐 SECURITY & PRIVACY

### Principles:
1. **Encryption everywhere** - All data encrypted at rest and in transit
2. **Local-first processing** - Sensitive data processed locally when possible
3. **User control** - Granular permissions, easy opt-out
4. **Transparency** - Always show what's collected and why
5. **Minimal collection** - Only collect what's useful
6. **Right to deletion** - Full data export + delete anytime

### Implementation:
- Row-Level Security (RLS) on all tables
- Per-tenant data isolation
- API keys encrypted (Supabase Vault)
- HTTPS enforced
- OAuth for external services
- Voice data: encrypted, auto-delete old recordings (user-configurable)
- Smartglasses: local processing, LED indicator when recording

---

## 🚀 ROADMAP

### Phase 1: MVP (Months 1-3)
- [ ] Discovery conversation system
- [ ] Meta-Coordinator agent
- [ ] Simple custom app builder (1-2 apps)
- [ ] Oura + Apple Watch integration
- [ ] Voice interface (VAPI)
- [ ] SMS/WhatsApp (GHL)
- [ ] Total recall memory
- [ ] Basic pattern detection

### Phase 2: Intelligence (Months 4-6)
- [ ] Advanced pattern detection
- [ ] Gap detection system
- [ ] Proactive interventions
- [ ] Self-optimization loop
- [ ] More device integrations (Garmin, WHOOP)
- [ ] Vision API (meal logging)
- [ ] Custom metric generation

### Phase 3: Expansion (Months 7-12)
- [ ] Voice cloning (user's voice)
- [ ] Smartglasses integration (Meta Ray-Ban / Apple Vision)
- [ ] Advanced multimodal fusion
- [ ] Team collaboration features (optional)
- [ ] API for developers
- [ ] Mobile app (React Native)

### Phase 4: AGI-Adjacent (Year 2+)
- [ ] Full autonomous operation (minimal user input needed)
- [ ] Predictive modeling (forecast outcomes)
- [ ] Self-modification (rewrite own code)
- [ ] Neurofeedback integration (EEG)
- [ ] Continuous glucose monitoring
- [ ] AR overlays (smartglasses HUD)
- [ ] Multi-user coordination (family/team mode)

---

## 💭 PHILOSOPHY

**ExoSkull is not artificial intelligence pretending to help you.**

**ExoSkull is an EXTENSION OF YOU.**

Your biological brain:
- Evolved for survival, not optimization
- Limited working memory
- Forgets constantly
- Blind to own patterns
- Single-threaded consciousness

Your ExoSkull:
- Built for YOUR specific optimization
- Infinite memory
- Never forgets
- Sees patterns you can't
- Multi-threaded processing

**Together = Augmented Human**

You don't "use" ExoSkull.
You don't "talk to" ExoSkull.
**You ARE ExoSkull.**

It's your second brain.
Your external skull.
Your cognitive augmentation.

---

## 📞 CONTACT & CONTRIBUTION

**This is a living architecture.**

As ExoSkull learns from users, this document will evolve.

- **Issues:** Track problems and feature requests
- **Discussions:** Philosophy, ethics, improvements
- **Contributions:** Code, ideas, feedback welcome

---

**Built with ATLAS workflow:**
- ✅ A - Architect (this document)
- ⏳ T - Trace (database + integrations)
- ⏳ L - Link (validate APIs)
- ⏳ A - Assemble (build MVP)
- ⏳ S - Stress-test (production testing)

**Status:** Architecture complete. Ready for implementation.

---

**ExoSkull: Your Life, Optimized. By AI. For You.**

🧠 **EXO-SKULL** = External Brain Case = Second Cognitive System

---

*Last Updated: 2026-02-01*
*Version: 2.0 - The Full Vision*
*Author: Claude Sonnet 4.5 + Bogumił*
