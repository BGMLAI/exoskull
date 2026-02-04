# ExoSkull - Test Paths

> 133 sciezki testowe w 18 kategoriach. Uzywaj z `scripts/test-all-routes.ts` lub recznie w Postman/curl.

## Legenda

- **Auth**: `No` = public, `Yes` = Supabase Bearer token, `Twilio` = Twilio signature, `Cron` = CRON_SECRET header, `Admin` = service role
- **Expected**: HTTP status code + opis odpowiedzi

---

## 1. PAGES (Browser GET)

| # | Path | Auth | Expected |
|---|------|------|----------|
| 1 | `GET /` | No | 200 Landing page |
| 2 | `GET /login` | No | 200 Login form |
| 3 | `GET /onboarding` | Yes | 200 Onboarding wizard |
| 4 | `GET /dashboard` | Yes | 200 Main dashboard |
| 5 | `GET /dashboard/chat` | Yes | 200 Chat interface |
| 6 | `GET /dashboard/health` | Yes | 200 Health metrics |
| 7 | `GET /dashboard/knowledge` | Yes | 200 Knowledge base |
| 8 | `GET /dashboard/schedule` | Yes | 200 Schedule view |
| 9 | `GET /dashboard/settings` | Yes | 200 Settings page |
| 10 | `GET /dashboard/tasks` | Yes | 200 Tasks view |

---

## 2. AUTH & USER API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 11 | POST | `/api/auth/signout` | Yes | - | 200, session cleared |
| 12 | GET | `/api/user/profile` | Yes | - | 200, user object |
| 13 | PATCH | `/api/user/profile` | Yes | `{ "preferred_name": "Test", "timezone": "Europe/Warsaw" }` | 200, updated profile |
| 14 | GET | `/api/user/profile` | No | - | 401, unauthorized |

---

## 3. CONVERSATIONS API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 15 | GET | `/api/conversations?limit=10&offset=0` | Yes | - | 200, array of conversations |
| 16 | POST | `/api/conversations` | Yes | `{ "title": "Test conversation" }` | 201, new conversation |
| 17 | GET | `/api/conversations/{id}/messages` | Yes | - | 200, messages array |
| 18 | POST | `/api/conversations/{id}/messages` | Yes | `{ "content": "Hello", "role": "user" }` | 201, message created |
| 19 | POST | `/api/chat/send` | Yes | `{ "message": "Hello", "conversation_id": "{id}" }` | 200, AI response |

---

## 4. VOICE API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 20 | POST | `/api/voice/chat` | Yes | `{ "audio": "base64...", "session_id": null }` | 200, `{ text, audio_url }` |
| 21 | GET | `/api/voice/sessions` | Yes | - | 200, last 20 sessions |
| 22 | POST | `/api/voice/transcribe` | Yes | `{ "audio": "base64..." }` | 200, `{ text }` |
| 23 | POST | `/api/voice/notes` | Yes | `{ "content": "Test note", "source": "voice" }` | 201, note saved |
| 24 | GET | `/api/voice/tools` | Yes | - | 200, tools list |
| 25 | POST | `/api/voice/tools` | Yes | `{ "tool_name": "list_tasks", "params": {} }` | 200, tool result |
| 26 | POST | `/api/voice/analyze-image` | Yes | `{ "image": "base64..." }` | 200, analysis |

---

## 5. TWILIO WEBHOOKS

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 27 | GET | `/api/twilio/voice` | No | - | 200, status info |
| 28 | POST | `/api/twilio/voice` | Twilio | `CallSid=CA123&From=%2B48123456789&action=start` | 200, TwiML XML |
| 29 | POST | `/api/twilio/voice` | Twilio | `CallSid=CA123&SpeechResult=hello&action=process` | 200, TwiML XML |
| 30 | POST | `/api/twilio/voice` | Twilio | `CallSid=CA123&action=end` | 200, TwiML XML |
| 31 | POST | `/api/twilio/voice/delegate` | Yes | `{ "callSid": "CA123", "input": "test" }` | 200 |
| 32 | POST | `/api/twilio/outbound` | Yes | `{ "tenant_id": "{id}", "type": "test" }` | 200, call initiated |
| 33 | POST | `/api/twilio/outbound` | Yes | `{ "tenant_id": "{id}", "type": "checkin" }` | 200 |
| 34 | POST | `/api/twilio/outbound` | Yes | `{ "tenant_id": "{id}", "type": "intervention" }` | 200 |
| 35 | GET | `/api/twilio/outbound` | No | - | 200, info endpoint |
| 36 | POST | `/api/twilio/status` | Twilio | `CallSid=CA123&CallStatus=completed` | 200 |

---

## 6. ONBOARDING API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 37 | GET | `/api/onboarding` | Yes | - | 200, `{ status, step }` |
| 38 | POST | `/api/onboarding/chat` | Yes | `{ "message": "My name is Test", "history": [] }` | 200, AI response |
| 39 | POST | `/api/onboarding/extract` | Yes | `{ "conversation_id": "{id}" }` | 200, extracted profile data |
| 40 | POST | `/api/onboarding/save-profile` | Yes | `{ "preferred_name": "Test", "goals": ["health"] }` | 200, profile saved |
| 41 | POST | `/api/onboarding/complete` | Yes | - | 200, onboarding marked done |

---

## 7. KNOWLEDGE API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 42 | GET | `/api/knowledge?category=notes&status=active` | Yes | - | 200, documents array |
| 43 | DELETE | `/api/knowledge` | Yes | `{ "document_id": "{id}" }` | 200, deleted |
| 44 | POST | `/api/knowledge/upload` | Yes | FormData: `file=test.pdf` | 201, document record |
| 45 | GET | `/api/knowledge/notes` | Yes | - | 200, notes array |
| 46 | POST | `/api/knowledge/notes` | Yes | `{ "content": "Test note", "title": "Test" }` | 201, note created |
| 47 | GET | `/api/knowledge/campaigns` | Yes | - | 200, campaigns |
| 48 | POST | `/api/knowledge/campaigns` | Yes | `{ "name": "Test campaign" }` | 201 |
| 49 | GET | `/api/knowledge/loops` | Yes | - | 200, loops |
| 50 | POST | `/api/knowledge/loops` | Yes | `{ "name": "Test loop" }` | 201 |
| 51 | GET | `/api/knowledge/quests` | Yes | - | 200, quests |
| 52 | POST | `/api/knowledge/quests` | Yes | `{ "name": "Test quest" }` | 201 |
| 53 | GET | `/api/knowledge/ops` | Yes | - | 200, ops |
| 54 | POST | `/api/knowledge/ops` | Yes | `{ "name": "Test op" }` | 201 |
| 55 | POST | `/api/knowledge/tyrolka` | Yes | `{ "data": "test" }` | 200 |

---

## 8. AUTONOMY API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 56 | GET | `/api/autonomy` | Yes | - | 200, grants grouped by category |
| 57 | POST | `/api/autonomy` | Yes | `{ "action_pattern": "health.*", "category": "health", "permission_level": "auto" }` | 201, grant created |
| 58 | PATCH | `/api/autonomy` | Yes | `{ "grant_id": "{id}", "active": false }` | 200, updated |
| 59 | DELETE | `/api/autonomy` | Yes | `{ "grant_id": "{id}" }` | 200, revoked |
| 60 | POST | `/api/autonomy/check` | Yes | `{ "action_type": "log_sleep", "category": "health" }` | 200, `{ permitted: true/false }` |
| 61 | POST | `/api/autonomy/execute` | Yes | `{ "action_type": "log_sleep", "params": { "hours": 7 } }` | 200, execution result |

---

## 9. RIGS (INTEGRATIONS) API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 62 | GET | `/api/rigs/notion/connect` | Yes | - | 302, OAuth redirect |
| 63 | POST | `/api/rigs/notion/callback` | Yes | `{ "code": "oauth_code" }` | 200, connected |
| 64 | GET | `/api/rigs/notion/sync` | Yes | - | 200, sync status |
| 65 | POST | `/api/rigs/notion/sync` | Yes | - | 200, sync triggered |
| 66 | GET | `/api/rigs/todoist/connect` | Yes | - | 302, OAuth redirect |
| 67 | POST | `/api/rigs/todoist/sync` | Yes | - | 200, sync triggered |
| 68 | GET | `/api/rigs/google/connect` | Yes | - | 302, OAuth redirect |
| 69 | POST | `/api/rigs/google/sync` | Yes | - | 200, sync triggered |
| 70 | GET | `/api/rigs/microsoft-365/connect` | Yes | - | 302, OAuth redirect |
| 71 | POST | `/api/rigs/microsoft-365/sync` | Yes | - | 200, sync triggered |
| 72 | POST | `/api/rigs/oura/connect` | Yes | - | 302, OAuth redirect |
| 73 | POST | `/api/rigs/oura/callback` | Yes | `{ "code": "oauth_code" }` | 200, connected |
| 74 | POST | `/api/rigs/oura/sync` | Yes | - | 200, health data synced |
| 75 | POST | `/api/rigs/health-connect/sync` | Yes | `{ "data": { "steps": 5000 } }` | 200, data saved |

---

## 10. MODS API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 76 | GET | `/api/mods` | Yes | - | 200, installed mods array |
| 77 | GET | `/api/mods/sleep-tracker` | Yes | - | 200, mod details + config |
| 78 | PATCH | `/api/mods/sleep-tracker` | Yes | `{ "settings": { "bedtime_goal": "23:00" } }` | 200, updated |
| 79 | GET | `/api/mods/sleep-tracker/data?range=7d` | Yes | - | 200, data points |
| 80 | GET | `/api/mods/mood-tracker` | Yes | - | 200, mod details |
| 81 | GET | `/api/mods/habit-tracker` | Yes | - | 200, mod details |
| 82 | GET | `/api/mods/task-manager` | Yes | - | 200, mod details |
| 83 | POST | `/api/mods/install` | Yes | `{ "slug": "sleep-tracker" }` | 201, mod installed |

---

## 11. REGISTRY API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 84 | GET | `/api/registry?type=mod&category=health` | Yes | - | 200, health mods |
| 85 | GET | `/api/registry?type=rig` | Yes | - | 200, all rigs |
| 86 | GET | `/api/registry?type=quest` | Yes | - | 200, all quests |
| 87 | GET | `/api/registry?search=sleep` | Yes | - | 200, filtered results |
| 88 | GET | `/api/registry/sleep-tracker` | Yes | - | 200, item details |

---

## 12. INSTALLATIONS API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 89 | GET | `/api/installations` | Yes | - | 200, grouped by type |
| 90 | POST | `/api/installations` | Yes | `{ "type": "mod", "slug": "sleep-tracker" }` | 201, installed |
| 91 | GET | `/api/installations/{id}` | Yes | - | 200, installation details |
| 92 | PATCH | `/api/installations/{id}` | Yes | `{ "active": false }` | 200, deactivated |
| 93 | DELETE | `/api/installations/{id}` | Yes | - | 200, removed |

---

## 13. SCHEDULING & CRON API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 94 | GET | `/api/schedule` | Yes | - | 200, jobs + prefs |
| 95 | PUT | `/api/schedule` | Yes | `{ "job_id": "{id}", "enabled": true, "time": "07:00" }` | 200, updated |
| 96 | POST | `/api/schedule` | Yes | `{ "job_type": "morning_checkin" }` | 200, manually triggered |
| 97 | GET | `/api/schedule/custom` | Yes | - | 200, custom jobs |
| 98 | POST | `/api/schedule/custom` | Yes | `{ "name": "Test job", "cron": "0 9 * * *", "action": "sms" }` | 201, created |
| 99 | PUT | `/api/schedule/custom` | Yes | `{ "id": "{id}", "enabled": false }` | 200, updated |
| 100 | GET | `/api/cron/master-scheduler` | Cron | - | 200, scheduler status |
| 101 | POST | `/api/cron/master-scheduler` | Cron | - | 200, jobs dispatched |
| 102 | POST | `/api/cron/bronze-etl` | Cron | - | 200, raw data ingested |
| 103 | POST | `/api/cron/silver-etl` | Cron | - | 200, data cleaned |
| 104 | POST | `/api/cron/gold-etl` | Cron | - | 200, insights aggregated |
| 105 | POST | `/api/cron/post-conversation` | Cron | `{ "conversation_id": "{id}" }` | 200, analyzed |
| 106 | POST | `/api/cron/highlight-decay` | Cron | - | 200, highlights decayed |
| 107 | POST | `/api/setup-cron` | Admin | - | 200, CRON jobs initialized |

---

## 14. HEALTH & METRICS API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 108 | GET | `/api/health/metrics?type=sleep&days=7` | Yes | - | 200, sleep time-series |
| 109 | GET | `/api/health/metrics?type=steps&days=14` | Yes | - | 200, steps data |
| 110 | GET | `/api/health/metrics?type=hrv&days=30` | Yes | - | 200, HRV data |
| 111 | GET | `/api/health/metrics?type=heart_rate&days=7` | Yes | - | 200, heart rate |
| 112 | GET | `/api/health/metrics?type=calories&days=7` | Yes | - | 200, calories |

---

## 15. TOOLS & AGENTS API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 113 | GET | `/api/tools` | Yes | - | 200, tools manifest |
| 114 | POST | `/api/tools` | Yes | `{ "tool_name": "add_task", "tenant_id": "{id}", "params": { "title": "Test" } }` | 200, result |
| 115 | GET | `/api/tools/search?q=task` | Yes | - | 200, matching tools |
| 116 | POST | `/api/tools/search` | Yes | `{ "query": "task management" }` | 200, matching tools |
| 117 | GET | `/api/agents` | Yes | - | 200, agents sorted by tier |

---

## 16. AUDIO & GREETING API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 118 | POST | `/api/generate-greeting` | Yes | `{ "user_name": "Test" }` | 200, greeting text |
| 119 | POST | `/api/audio/generate-cache` | Yes | `{ "text": "Hello world", "voice_id": "default" }` | 200, audio_url |

---

## 17. SYSTEM & UTILITY API

| # | Method | Path | Auth | Body/Params | Expected |
|---|--------|------|------|-------------|----------|
| 120 | GET | `/api/pulse` | No | - | 200, `{ status: "ok" }` |
| 121 | POST | `/api/pulse` | No | - | 200 |
| 122 | POST | `/api/run-migrations` | Admin | - | 200, migrations applied |
| 123 | GET | `/api/ghl/tools` | Yes | - | 200, GHL tools list |
| 124 | POST | `/api/webhooks/ghl` | GHL Sig | `{ "event": "contact.created", "data": {} }` | 200 |

---

## 18. ERROR / EDGE CASES (Negative Tests)

| # | Method | Path | Auth | Expected |
|---|--------|------|------|----------|
| 125 | GET | `/api/user/profile` | No | 401 Unauthorized |
| 126 | GET | `/api/conversations` | No | 401 Unauthorized |
| 127 | POST | `/api/conversations/00000000-0000-0000-0000-000000000000/messages` | Yes | 404 Not Found |
| 128 | GET | `/api/mods/nonexistent-mod-xyz` | Yes | 404 Not Found |
| 129 | GET | `/api/registry/nonexistent-item-xyz` | Yes | 404 Not Found |
| 130 | POST | `/api/autonomy/execute` | Yes (no grant) | 403 Forbidden |
| 131 | POST | `/api/rigs/oura/sync` | Yes (not connected) | 400 Bad Request |
| 132 | GET | `/api/health/metrics?type=invalid_metric` | Yes | 400 Bad Request |
| 133 | POST | `/api/tools` | Yes | `{ "tool_name": "nonexistent_tool" }` -> 404 |

---

## Jak uzywac

### Automatycznie (recommended)
```bash
cd exoskull-app
npx tsx scripts/test-all-routes.ts
```

### Recznie z curl
```bash
# Public endpoint
curl -s http://localhost:3000/api/pulse | jq

# Authenticated endpoint
curl -s http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" | jq

# POST with body
curl -s -X POST http://localhost:3000/api/conversations \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test"}' | jq
```

### Zmienne do podmienienia
- `{id}` - UUID z bazy danych (conversation, installation, etc.)
- `{tenant_id}` - UUID uzytkownika/tenanta
- `YOUR_SUPABASE_TOKEN` - token z `supabase.auth.getSession()`
