# Voice Conversation Workflow

> Glosowa interakcja z uzytkownikiem - glowny interfejs ExoSkull.

---

## Cel

Prowadzic naturalne rozmowy glosowe z uzytkownikiem.
Voice jest PRIMARY interface - SMS/chat to fallback.

---

## Triggery

| Trigger | Source | Context |
|---------|--------|---------|
| Inbound call | VAPI webhook | User calls ExoSkull |
| Outbound call | CRON dispatcher | Scheduled check-in |
| User SMS "zadzwon" | GHL webhook | User requests call |
| Intervention trigger | Pattern detection | System initiates |

---

## Narzedzia

| Tool | Path | Usage |
|------|------|-------|
| System Prompt Builder | `lib/voice/system-prompt.ts` | Build full prompt |
| Model Router | `lib/ai/model-router.ts` | Route to appropriate tier |
| Mod Executors | `lib/mods/executors/` | Execute actions (tasks, mood) |
| GHL Client | `lib/ghl/` | CRM, messaging, calendar |
| Highlight Extractor | `lib/agents/specialized/highlight-extractor.ts` | Post-call analysis |
| Memory/Highlights | `lib/memory/highlights.ts` | Load/save highlights |
| Security | `lib/security/safety-guardrails.ts` | Crisis detection |

---

## Conversation Flow

### 1. Pre-Call Setup

```
1. Load user profile (exo_tenants)
2. Load dynamic context:
   - Current time (user timezone)
   - Recent tasks (count, overdue)
   - User mood (if recent data)
   - Last conversation topic
   - Active role (if any)
   - User highlights (auto-learned memory)
   - MITs (Most Important Things)
3. Build system prompt:
   - Static (PSYCODE + core prompt) → cached
   - Dynamic (context) → fresh each call
4. Initialize VAPI call with tools
```

### 2. During Call

```
1. Receive user speech (VAPI STT)
2. Route to appropriate AI tier:
   - Simple response → Tier 1 (Gemini Flash)
   - Pattern/analysis → Tier 2 (Haiku)
   - Complex reasoning → Tier 3 (Kimi)
   - Crisis/meta → Tier 4 (Opus)
3. Execute tools if needed:
   - get_tasks, create_task, complete_task
   - ghl_send_message
   - log_mood, log_habit
   - get_schedule, create_checkin
4. Generate response
5. Speak response (VAPI TTS)
6. Log exchange to buffer
```

### 3. Post-Call

```
1. Save full transcript to Bronze (R2)
2. Extract highlights (preferences, patterns, goals, insights)
3. Integrate highlights to user profile
4. Update conversation metadata (duration, topics)
5. Schedule follow-ups if needed
```

---

## System Prompt Structure

```
┌─────────────────────────────────────────┐
│  PSYCODE (Personality Foundation)       │  ← Static, cached
│  - Core identity                        │
│  - Vibe and boundaries                  │
├─────────────────────────────────────────┤
│  STATIC PROMPT (~2500 tokens)           │  ← Static, cached
│  - WYKONAWCA identity                   │
│  - Tools reference                      │
│  - Voice rules                          │
│  - Guardrails                           │
├─────────────────────────────────────────┤
│  DYNAMIC CONTEXT                        │  ← Fresh each call
│  - Time of day                          │
│  - User profile (name, style)           │
│  - Active role (if any)                 │
│  - Tasks count                          │
│  - User mood                            │
│  - Patterns (sleep debt, isolation)     │
│  - Highlights (memory)                  │
│  - MITs (top 3 objectives)              │
│  - Last conversation topic              │
└─────────────────────────────────────────┘
```

---

## Tools Available

### Task Tools

| Tool | Trigger | Params |
|------|---------|--------|
| `get_tasks` | "Co mam?", "Lista zadan" | - |
| `create_task` | "Dodaj...", "Zapisz..." | title, priority?, due_date? |
| `complete_task` | "Zrobilem...", "Skonczylem..." | task_id |

### Communication Tools

| Tool | Trigger | Params |
|------|---------|--------|
| `ghl_send_message` | "Wyslij SMS do..." | type, message |
| `ghl_get_conversations` | "Ostatnie wiadomosci" | limit |

### CRM Tools

| Tool | Trigger | Params |
|------|---------|--------|
| `ghl_create_contact` | "Dodaj kontakt..." | name, phone, email |
| `ghl_create_appointment` | "Umow spotkanie..." | title, time, contact |

### Schedule Tools

| Tool | Trigger | Params |
|------|---------|--------|
| `get_schedule` | "Moj harmonogram" | - |
| `create_checkin` | "Przypominaj mi o..." | name, time, frequency, channel |
| `toggle_checkin` | "Wylacz check-in" | checkin_name, enabled |

### Tracking Tools

| Tool | Trigger | Params |
|------|---------|--------|
| `log_mood` | "Czuje sie..." | level (1-10), notes? |
| `log_habit` | "Zrobilem [habit]" | habit_id, completed |

---

## Input

| Data | Source | Required |
|------|--------|----------|
| User profile | `exo_tenants` | Yes |
| Dynamic context | Multiple sources | Yes |
| User highlights | `exo_highlights` | If available |
| MITs | `exo_objectives` | If configured |
| Active role | `exo_tenants.active_role_id` | If set |
| Recent conversations | `exo_conversations` | For context |

---

## Output

| Output | Destination | When |
|--------|-------------|------|
| Conversation transcript | Bronze (R2 Parquet) | Always |
| Highlights extracted | `exo_highlights` | Post-call |
| Actions executed | Various tables | If tools used |
| AI usage tracking | `exo_ai_usage` | Always |

---

## Edge Cases

### User speaks different language

```
If user switches to English:
  - Detect language
  - Switch response language
  - Note in profile
  - Continue naturally
```

### Long silence

```
If silence > 5 seconds:
  - "Jestes tam?"
If silence > 10 seconds:
  - "Rozumiem, odezwe sie pozniej."
  - End call gracefully
```

### User asks something outside scope

```
If user asks for:
  - Medical advice: "To pytanie do lekarza. Moge umowic wizyte?"
  - Legal advice: "Skonsultuj z prawnikiem."
  - Financial advice: "Moge pokazac wzorce, ale to nie porada inwestycyjna."
```

### Crisis detected

```
If safety-guardrails.ts detects crisis keywords:
  1. STOP normal flow
  2. Escalate to Tier 4 (Opus)
  3. Switch to crisis protocol
  4. "Martwię się o Ciebie. Czy jesteś bezpieczny?"
  5. Provide resources (116 123)
```

### Tool failure

```
If tool fails:
  1. Try once more
  2. If still fails:
     - "Cos poszlo nie tak. Sprobuje jeszcze raz."
     - Log error with context
  3. If critical:
     - Apologize and offer alternative
```

---

## Guardrails

**NEVER:**
- Diagnose medical conditions
- Give legal/financial advice
- Send messages to strangers without permission
- Hallucinate data not in database
- Ignore crisis signals

**ALWAYS:**
- Verify data before stating facts
- Confirm actions: "Dodane.", "Wyslane."
- Adapt tone to context
- Log everything
- Escalate crisis to Tier 4

---

## Voice-Specific Rules

```
MAX 3 sentences per response
NO lists (don't enumerate)
NO emoji
NO formatting words ("przecinek", "nowa linia")
Natural transitions: "No wiec...", "Sluchaj...", "Wiesz co..."
Short confirmations: "Jasne.", "Ok.", "Mam."
```

---

## Metrics

| Metric | Track |
|--------|-------|
| Call duration | Average, trend |
| Tool usage | Which tools, how often |
| Tier escalations | How often Tier 1 → 2 → 3 → 4 |
| User satisfaction | Implicit from conversation |
| Error rate | Tool failures, escalations |

---

## Related

- `goals/daily-checkin.md` - Scheduled check-ins
- `hardprompts/discovery-interview.md` - First conversation
- `context/tone.md` - Communication style
- `lib/voice/system-prompt.ts` - Implementation
- `lib/voice/PSYCODE.md` - Personality foundation
