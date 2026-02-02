# Daily Check-in Workflow

> Proaktywne check-iny z uzytkownikiem - poranne, wieczorne, custom.

---

## Cel

Utrzymywac regularny kontakt z uzytkownikiem przez zaplanowane check-iny.
Check-iny to glowny mechanizm proaktywnosci ExoSkull.

---

## Triggery

| Trigger | Source | Action |
|---------|--------|--------|
| Scheduled time | CRON dispatcher | Initiate call/SMS |
| User request | Voice: "zadzwon do mnie o 7" | Schedule new check-in |
| Pattern detection | Sleep debt, isolation, overdue | Trigger intervention check-in |
| Missed check-in | User didn't answer | Fallback to SMS |

---

## Narzedzia

| Tool | Path | Usage |
|------|------|-------|
| CRON Dispatcher | `lib/cron/dispatcher.ts` | Schedule and trigger check-ins |
| Timezone Utils | `lib/cron/timezone-utils.ts` | Convert to user timezone |
| Voice System | `lib/voice/system-prompt.ts` | Build check-in prompt |
| GHL Messaging | `lib/ghl/messaging.ts` | SMS fallback |
| VAPI | External | Voice calls |

---

## Check-in Types

### Morning Check-in (Default)

**Time:** User-configured (default 08:00)
**Channel:** Voice (SMS fallback)
**Duration:** 2-5 minutes

**Flow:**
1. Call user
2. Open: "Dzien dobry {name}! Jak sie czujesz?"
3. Capture mood/energy (1-10)
4. Share today's agenda (tasks, meetings)
5. Ask about priorities
6. Close: "Powodzenia! Do uslyszenia."

**System Prompt Additions:**
```
To jest poranny check-in.
- Badz energiczny ale nie nachalny
- Zapytaj o samopoczucie i energie (1-10)
- Przekaz plan dnia krotko
- Max 3 minuty
```

### Evening Check-in (Optional)

**Time:** User-configured (default 21:00)
**Channel:** Voice or SMS
**Duration:** 3-7 minutes

**Flow:**
1. Call/message user
2. Open: "Jak minal dzien?"
3. Review: What got done, what didn't
4. Reflection: Highlights, learnings
5. Tomorrow preview (optional)
6. Close: "Dobranoc."

**System Prompt Additions:**
```
To jest wieczorny check-in.
- Badz cieplejszy, wolniejszy
- Pytaj o dzien, nie o zadania
- Pomoz przetworzyc
- Nie naciskaj na jutrzejsze plany jesli zmeczony
```

### Custom Check-in

**Time:** User-defined
**Channel:** User-defined
**Purpose:** Specific (e.g., "remind me to drink water")

**Flow:**
1. Trigger at scheduled time
2. Deliver configured message
3. Optional: Capture response

---

## Input

| Data | Source | Required |
|------|--------|----------|
| User profile | `exo_tenants` | Yes |
| Schedule config | `exo_checkin_schedules` | Yes |
| Timezone | Profile | Yes |
| Tasks for today | `exo_tasks` | For morning |
| Calendar events | Rigs (Google/Microsoft) | If connected |
| Sleep data | Rigs (Oura/Fitbit) | If connected |
| Previous conversation | `exo_conversations` | For context |

---

## Output

| Output | Destination | When |
|--------|-------------|------|
| Conversation transcript | Bronze (R2) | Always |
| Mood/energy log | `exo_mood_logs` | If captured |
| Task updates | `exo_tasks` | If tasks discussed |
| Highlights extracted | Silver (Supabase) | Post-call |
| Next action items | `exo_tasks` | If created |

---

## Edge Cases

### User doesn't answer

```
Attempt 1: Call
Wait 30 seconds
Attempt 2: Call again
If no answer:
  - Send SMS: "Nie udalo mi sie dodzwonic. Wszystko ok?"
  - Log: missed_checkin
  - Don't call again today (unless critical)
```

### User says "not now"

```
- "Ok, kiedy lepiej?"
- If gives time: reschedule
- If "not today": skip, don't ask why
- Log: declined_checkin
```

### Detected crisis signals

```
If user mentions suicide, self-harm, crisis:
  - STOP normal check-in flow
  - Switch to crisis protocol (see hardprompts/intervention-design.md)
  - Escalate to Tier 4 (Opus)
  - Provide resources
```

### User is very brief

```
If responses are very short (1-word):
  - Don't probe
  - "Rozumiem, krotko dzis. Masz jakas jedna rzecz do zrobienia?"
  - End quickly
  - Note: user_brief, may be busy/tired
```

---

## Guardrails

**NEVER:**
- Call before 6:00 or after 23:00 (user timezone)
- Call more than 2x if no answer
- Push for detailed answers if user is brief
- Ignore crisis signals

**ALWAYS:**
- Respect user's "not now"
- Log all check-ins (success/failed/declined)
- Adapt tone to time of day
- Have SMS fallback ready

---

## Metrics

| Metric | Track |
|--------|-------|
| Check-in completion rate | % of scheduled check-ins that happened |
| Average duration | How long are check-ins |
| User initiated reschedules | Are times wrong? |
| Decline rate | Too many check-ins? |
| Mood trend | From captured data |

---

## Configuration

User configures via voice or settings:

```typescript
interface CheckinSchedule {
  id: string
  tenant_id: string
  name: string // "morning", "evening", "custom"
  time: string // "08:00" in user timezone
  frequency: "daily" | "weekdays" | "weekends" | "weekly"
  channel: "voice" | "sms"
  enabled: boolean
  message?: string // For custom check-ins
  created_at: string
  updated_at: string
}
```

---

## Related

- `goals/voice-conversation.md` - Full voice conversation flow
- `hardprompts/intervention-design.md` - Pattern-triggered check-ins
- `lib/cron/dispatcher.ts` - Implementation
- `args/mods.yaml` - Check-in configuration
