# MODUL 3: Voice Pipeline - COMPLETED

**Agent:** Claude Opus 4.5
**Date:** 2026-02-03
**Status:** DONE

---

## Summary

Built a complete Voice Pipeline using Twilio + ElevenLabs + Claude (WITHOUT VAPI for phone calls).

---

## Files Created

### lib/voice/

| File | Description |
|------|-------------|
| `lib/voice/twilio-client.ts` | TwiML generation, outbound calls, Twilio SDK wrapper |
| `lib/voice/elevenlabs-tts.ts` | ElevenLabs Text-to-Speech with caching |
| `lib/voice/elevenlabs-stt.ts` | ElevenLabs Speech-to-Text with Deepgram fallback |
| `lib/voice/conversation-handler.ts` | Claude conversation with tools, session management |
| `lib/voice/index.ts` | Module exports |

### app/api/twilio/

| File | Description |
|------|-------------|
| `app/api/twilio/voice/route.ts` | Main webhook (start, process, end actions) |
| `app/api/twilio/status/route.ts` | Call status callbacks |
| `app/api/twilio/outbound/route.ts` | Initiate outbound calls |

### app/api/voice/

| File | Description |
|------|-------------|
| `app/api/voice/sessions/route.ts` | Fetch voice session history |

### Database

| File | Description |
|------|-------------|
| `supabase/migrations/20260202000027_voice_sessions.sql` | exo_voice_sessions table + voice-audio bucket |

### Dashboard

| File | Changes |
|------|---------|
| `app/dashboard/voice/page.tsx` | Added "Test Phone Call" button, voice sessions history |

---

## Architecture

```
Voice Flow (HTTP Turn-by-Turn):
1. User calls +48732144112
2. Twilio → POST /api/twilio/voice?action=start
3. Server returns <Gather> with ElevenLabs TTS greeting
4. User speaks → Twilio STT → POST /api/twilio/voice?action=process
5. Claude generates response (with tools: add_task, complete_task, list_tasks)
6. ElevenLabs TTS → audio uploaded to Supabase Storage
7. Return <Play> + <Gather> for next turn
8. Loop until "do widzenia" detected or hangup
```

---

## Features Implemented

- [x] Twilio webhook handlers (voice, status, outbound)
- [x] ElevenLabs TTS with caching (reduces API costs)
- [x] ElevenLabs STT with Deepgram fallback
- [x] Claude conversation with tools (add_task, complete_task, list_tasks)
- [x] Session state persistence (exo_voice_sessions table)
- [x] Audio storage in Supabase (voice-audio bucket)
- [x] Phone call test from dashboard
- [x] Voice sessions history display
- [x] End call detection ("do widzenia", "pa pa", etc.)
- [x] Error handling with Twilio Say fallback

---

## Dependencies Added

```json
{
  "twilio": "^5.0.0"
}
```

---

## Environment Variables Used

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER (+48732144112)
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID (Qs4qmNrqlneCgYPLSNQ7)
ANTHROPIC_API_KEY
DEEPGRAM_API_KEY (fallback STT)
NEXT_PUBLIC_APP_URL
```

---

## How to Test

1. **Run migration:**
   ```bash
   supabase db push
   ```

2. **Set Twilio webhook:**
   - Configure Twilio phone number webhook to:
   - Voice URL: `https://your-app.vercel.app/api/twilio/voice?action=start`
   - Status URL: `https://your-app.vercel.app/api/twilio/status`

3. **Test inbound call:**
   - Call +48732144112
   - You should hear greeting from ElevenLabs TTS
   - Speak commands like "dodaj zadanie kupic mleko"
   - Say "do widzenia" to end call

4. **Test outbound call:**
   - Go to Dashboard → Voice
   - Click "Zadzwon do mnie"
   - Receive call on your phone

---

## Notes

- Web voice (dashboard button "Rozpocznij rozmowe") still uses VAPI SDK
- Phone voice uses custom Twilio + ElevenLabs + Claude pipeline
- Hybrid approach: best of both worlds

---

## Related Files (Not Modified)

- `lib/voice/system-prompt.ts` - Reused existing PSYCODE + system prompt
- `lib/voice/audio-cache.ts` - Existing audio caching (referenced but not modified)

---

## Rollback Plan

If issues arise:
1. Keep Twilio webhook pointed to Supabase Edge Function (`exoskull-voice`) as fallback
2. Both implementations can coexist with different webhook URLs
