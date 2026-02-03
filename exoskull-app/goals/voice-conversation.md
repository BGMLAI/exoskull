# Goal: Voice Conversation

Naturalna rozmowa glosowa przez telefon.

---

## Objective

Umozliwic uzytkownikowi naturalny dialog glosowy z ExoSkull:
- Odpowiadaj na pytania
- Wykonuj akcje (zadania, notatki, kalendarz)
- Zbieraj informacje (mood, energy, insights)

---

## Trigger

| Trigger | Opis |
|---------|------|
| Inbound call | User dzwoni na numer ExoSkull |
| Outbound call | System dzwoni (scheduled check-in, alert) |
| Voice in dashboard | Web-based voice interface |

---

## Architecture

```
User Phone
    |
    v
Twilio (telephony)
    |
    v
/api/twilio/voice (webhook)
    |
    v
ElevenLabs STT (speech-to-text)
    |
    v
Claude Opus (conversation + tools)
    |
    v
ElevenLabs TTS (text-to-speech)
    |
    v
Twilio (audio playback)
```

---

## Inputs

### Per-call Context
- tenant_id (from phone number lookup)
- User profile (name, preferences, timezone)
- Recent conversations (last 5)
- Active tasks (pending, due_today)
- Today's calendar
- Health data (if available)
- Tyrolka context (Ja/Nie-Ja, active Quests)

### Real-time
- Audio stream from user
- Conversation history (this call)
- Tool results (if tools executed)

---

## Tools Available in Voice

| Tool | Voice Command Examples |
|------|------------------------|
| task | "Dodaj zadanie kupic mleko" |
| calendar | "Co mam w kalendarzu jutro?" |
| web_search | "Wyszukaj restauracje w poblizu" |
| note | "Zapisz notatke: pomysl na projekt..." |

---

## Outputs

1. **Verbal response** - natural Polish speech
2. **Actions** - tasks created, calendar updated, notes saved
3. **Data logged** - conversation transcript, extracted insights
4. **Follow-ups** - scheduled reminders if needed

---

## Flow: Inbound Call

```
1. Twilio receives call on +48732144112
2. Webhook → /api/twilio/voice
3. Lookup tenant by phone number
4. Load context:
   - User profile
   - Recent conversations
   - Active tasks, calendar
   - Tyrolka context (via get_tyrolka_context())
5. Build system prompt (lib/voice/system-prompt.ts)
6. Greet user: "Czesc [name], jak moge pomoc?"
7. LOOP:
   a. ElevenLabs STT → transcribe user speech
   b. Claude → generate response + tool calls
   c. IF tool_call: execute tool, include result
   d. ElevenLabs TTS → synthesize response
   e. Twilio → play audio to user
   f. CONTINUE until user hangs up or says "do widzenia"
8. End call:
   - Save transcript to exo_conversations
   - Extract insights (mood, tasks mentioned, etc.)
   - Log to analytics
```

---

## Flow: Outbound Call (Scheduled)

```
1. CRON triggers job (e.g., morning_checkin)
2. Fetch users with enabled job + consent
3. For each user:
   a. Initiate Twilio outbound call
   b. Load context (same as inbound)
   c. Deliver scripted opening (from hardprompts/)
   d. Listen for response
   e. Continue conversation as normal
   f. If no answer: log, retry later or send SMS
```

---

## System Prompt Structure

```
[PSYCODE.md - Personality]
+
[User Context]
  - Name, preferences, timezone
  - Recent history summary
  - Current tasks, calendar
  - Health data (sleep, HRV)
+
[Tyrolka Context]
  - Active Loops (life areas)
  - Active Quests (projects)
  - Recent Notes (insights)
+
[Available Tools]
  - task, calendar, web_search, note
+
[Conversation History]
  - Last 5 messages this call
```

---

## Edge Cases

| Przypadek | Obsluga |
|-----------|---------|
| User nie mowi | Prompt: "Nic nie slyszalem. Jestes tam?" |
| Tool fails | "Przepraszam, nie udalosie. Sprobuj pozniej." |
| Unknown phone | "Nie rozpoznaje numeru. Podaj imie?" |
| Long silence | End call after 30s silence with goodbye |
| Background noise | Request: "Trudno cie zrozumiec. Mozesz powtorzyc?" |
| Emergency keywords | Escalate (see Crisis Detection) |

---

## Voice Personality

Defined in `lib/voice/PSYCODE.md`:
- **Zwiezly** - nie gadaj za duzo
- **Pomocny naprawde** - dzialaj, nie performuj
- **Miej opinie** - nie badz bezosobowy
- **Adaptacyjny** - wykrywaj stan usera

---

## Performance Targets

| Metric | Target |
|--------|--------|
| STT latency | < 500ms |
| LLM response | < 2s |
| TTS generation | < 1s |
| End-to-end | < 3s |

---

## Config Reference

```yaml
# lib/voice configuration
voice:
  stt_provider: "elevenlabs"  # or "deepgram"
  tts_provider: "elevenlabs"
  voice_id: "Qs4qmNrqlneCgYPLSNQ7"  # User's cloned voice
  language: "pl"
  model: "claude-opus-4-5-20251101"
  max_conversation_turns: 50
  silence_timeout_ms: 30000
```

---

## Files Reference

| Plik | Rola |
|------|------|
| lib/voice/twilio-client.ts | Twilio SDK wrapper |
| lib/voice/elevenlabs-stt.ts | Speech-to-text |
| lib/voice/elevenlabs-tts.ts | Text-to-speech |
| lib/voice/conversation-handler.ts | Session management |
| lib/voice/system-prompt.ts | Prompt builder |
| lib/voice/PSYCODE.md | Personality definition |
| app/api/twilio/voice/route.ts | Webhook handler |

---

VERSION: 1.0
UPDATED: 2026-02-03
