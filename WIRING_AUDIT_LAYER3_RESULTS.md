# A4 Warstwa 3 — E2E User Journey Audit Results

**Date:** 2026-02-17
**Scope:** 4 critical user flows traced end-to-end (frontend → API → DB → response)
**Method:** Source code analysis with file:line references

---

## 1. Flows Audited

| Flow | Files Read | Status |
|------|-----------|--------|
| Chat (message → stream → persist → history) | 12 | Complete |
| Canvas/CRON (ETL → gold → API → widgets) | 14 | Complete |
| Voice (record → transcribe → chat → TTS) | 14 | Complete |
| Autonomy (detect → propose → approve → execute) | 10 | Complete |

---

## 2. Cross-Flow Health Scores

| Metric | Chat | Canvas | Voice | Autonomy |
|--------|------|--------|-------|----------|
| Auth Consistency | D | C+ | D | B |
| Error Handling | C | C- | C | B |
| Race Conditions | D | B | C- | B+ |
| Data Freshness | B+ | D | B+ | B+ |
| Security | B | B+ | C+ | B+ |
| **Overall** | **C+** | **C** | **C** | **B** |

---

## 3. CRITICAL FINDINGS (Fix Now)

### F3.1 — Chat: No VPS Circuit Breaker [HIGH]
- **Location:** `app/api/chat/stream/route.ts:300-312`
- **Issue:** Every request tries VPS proxy with 5s timeout. If VPS is down, ALL users get +5s latency before fallback.
- **Impact:** 5s latency spike for all users during VPS outage
- **Fix:** Add circuit breaker (open after 3 failures, half-open after 30s)

### F3.2 — Voice: Auth Inconsistency Breaks Mobile [HIGH]
- **Location:** `/api/voice/chat`, `/api/voice/tts`, `/api/settings/voice`
- **Issue:** Transcribe uses `verifyTenantAuth()` (cookie + Bearer), but chat/tts/settings use legacy `getUser()` (cookie only)
- **Impact:** Mobile voice features completely broken (no Bearer token support)
- **Fix:** Migrate 3 voice routes to `verifyTenantAuth()`

### F3.3 — Autonomy: Guardian Not Invoked During Execution [HIGH]
- **Location:** `lib/autonomy/executor.ts:76-205` (executeIntervention)
- **Issue:** `verifyBenefit()` (guardian.ts:49) is defined but NOT called in `processQueue()` or `executeIntervention()`. Only in MAPE-K proposal phase.
- **Impact:** Approved interventions execute without safety re-check. If guardian rules change between approval and execution, stale approval stands.
- **Fix:** Add `guardian.verifyBenefit()` check before `dispatchAction()` in executor.ts

### F3.4 — Canvas: No Data Freshness Indicators [MEDIUM-HIGH]
- **Location:** All canvas hooks (`useOrbData.ts`, `useAutonomyData.ts`)
- **Issue:** Frontend fetches once on mount, NO polling, NO "last updated" timestamp, NO staleness warnings
- **Impact:** Users view data hours/days old without knowing. CRONs fail → no visible impact.
- **Fix:** Add `last_refreshed_at` to gold views, display in dashboard footer, add 30min polling

### F3.5 — Chat: Race Condition on Concurrent Writes [MEDIUM]
- **Location:** `lib/unified-thread.ts:104-112` (getOrCreateThread)
- **Issue:** Two simultaneous messages can create duplicate threads/conversations
- **Fix:** Use upsert with `ON CONFLICT (tenant_id)` or advisory lock

---

## 4. CHAT FLOW — Detailed Findings

### Happy Path
```
User types → sendMessage() [UnifiedStream:397]
  → POST /api/chat/stream [route.ts:268]
    → Auth: getUser() (LEGACY)
    → Rate limit check
    → Try VPS proxy (5s timeout) [route.ts:300]
    → Fallback: local gateway → runExoSkullAgent()
    → SSE stream: delta/thinking/tool/done events
  → appendMessage(user + assistant) → exo_unified_messages
  → Frontend: finalizeAIMessage() + speakText()
```

### Auth: **LEGACY** (`createClient + getUser`)
- `app/api/chat/stream/route.ts:268-271` — no Bearer token support
- `app/api/unified-thread/route.ts:14` — same legacy pattern
- `app/api/stream/events/route.ts:26` — same legacy pattern

### Race Conditions
| Issue | Location | Severity |
|-------|----------|----------|
| Concurrent thread creation | unified-thread.ts:104 | MEDIUM |
| Message finalized before DB save | gateway.ts:295 vs UnifiedStream:514 | MEDIUM |
| Duplicate event IDs (hist-{ts} vs ai-{ts}) | UnifiedStream:431 | LOW |

### Error Gaps
| Issue | Location | Severity |
|-------|----------|----------|
| No VPS circuit breaker | route.ts:300-312 | HIGH |
| Generic "Blad serwera" error | route.ts:245 | LOW |
| No error telemetry (console only) | route.ts:248 | MEDIUM |
| No retry after partial stream | UnifiedStream:933 | LOW |

---

## 5. CANVAS/CRON FLOW — Detailed Findings

### Data Pipeline
```
CRON daily@02:00 → silver-etl → gold-etl (5 materialized views)
CRON daily@05:00 → business-metrics (gold-etl dependency)
CRON daily@03:00 → loop-daily (reclassify, coaching, maintenance)

Canvas APIs:
  GET /api/canvas/data/values → direct source tables (real-time)
  GET /api/canvas/data/health → exo_daily_health + exo_predictions
  GET /api/canvas/data/ops → user_ops (real-time)
  GET /api/canvas/widgets → exo_canvas_widgets
```

### Auth: All canvas APIs use **LEGACY** (`createClient + getUser`)
- `app/api/canvas/data/values/route.ts:16-25`
- `app/api/canvas/data/health/route.ts` — same pattern
- `app/api/canvas/data/ops/route.ts` — same pattern

### Staleness Risks
| Data Type | Update Freq | Max Staleness | UI Display |
|-----------|-------------|---------------|------------|
| Values/Quests | Real-time | <1s | None |
| Health | 1-24h (integrations) | 24h+ | None |
| Gold summaries | Daily @02:00 | 22h | None |
| Business metrics | Daily @05:00 | 19h | None |

### Performance Issues
| Issue | Location | Impact |
|-------|----------|--------|
| N+1 notes count queries | values/route.ts:239-243 | Slow for large trees |
| Full tree re-fetch after every mutation | useOrbData.ts:609 | Expensive |
| No pagination on ops | ops/route.ts LIMIT 20 | Truncated data |
| Sequential gold view refresh | gold-etl.ts:171 | Slower than needed |

---

## 6. VOICE FLOW — Detailed Findings

### Happy Path
```
Mic button → MediaRecorder (WebM Opus, 100ms chunks) [VoiceRecorder.tsx:34]
  → POST /api/voice/transcribe (verifyTenantAuth ✅)
    → Tier 1: OpenAI Whisper (pl, verbose_json)
    → Tier 2: Groq Whisper (fallback)
    → Hallucination detection (20+ patterns)
  → Auto-feed to POST /api/voice/chat (LEGACY auth ❌)
    → Gemini 3 Flash (voice-optimized, 1500 tokens, 15 tools)
    → 38s timeout
  → TTS: Browser Web Speech API (default) or Cartesia Sonic 3 (server)
  → Cache: MD5(voiceId:text) in Supabase Storage
```

### Auth Inconsistency
| Endpoint | Auth | Mobile |
|----------|------|--------|
| `/api/voice/transcribe` | `verifyTenantAuth()` ✅ | YES |
| `/api/voice/chat` | `getUser()` ❌ | NO |
| `/api/voice/tts` | `getUser()` ❌ | NO |
| `/api/settings/voice` | `getUser()` ❌ | NO |

### Race Conditions
| Issue | Severity | Mitigation |
|-------|----------|------------|
| Recording + TTS playback collision | MEDIUM | None — audio loopback risk |
| Component unmount during transcription | MEDIUM | AbortController in HomeChat only |
| Session consistency (fire-and-forget appendMessage) | LOW | Logged but not awaited |

### Gaps
| Issue | Severity |
|-------|----------|
| No timeout on OpenAI/Groq API calls | MEDIUM |
| No max recording duration | LOW |
| No circuit breaker on provider failures | MEDIUM |
| Empty transcript indistinguishable from silence | LOW |
| Voice settings limited to voiceId only | LOW |

---

## 7. AUTONOMY FLOW — Detailed Findings

### Happy Path
```
MAPE-K Loop (or CRON every 15min):
  Monitor → Analyze → Plan:
    → guardian.verifyBenefit() (throttle, score, history)
    → propose_intervention() RPC → exo_interventions (status: proposed)

User sees pending:
  → GET /api/autonomy/execute?type=pending
  → POST /api/autonomy/execute {operation: "approve", interventionId}
    → Auth: JWT tenant_id check ✅
    → Status: must be "proposed" ✅
    → RPC approve_intervention() → status: approved → add to queue

CRON every 15min:
  → processTimeouts() → auto-approve if scheduled_for passed
  → processQueue(10) → executeIntervention()
    → dispatchAction() → send_sms/make_call/create_task/proactive_message
    → Mark completed, delete from queue, notify user
```

### Security Analysis
| Check | Status | Location |
|-------|--------|----------|
| Tenant isolation (API) | ✅ `.eq("tenant_id", tenantId)` | execute/route.ts:263 |
| Tenant isolation (RLS) | ✅ `USING (tenant_id = auth.uid())` | migration:105-118 |
| Status validation | ✅ Must be "proposed" | execute/route.ts:274 |
| Guardian pre-check | ❌ NOT in execution path | executor.ts (missing) |
| RPC tenant check | ❌ approve_intervention() no tenant_id | migration:267 |
| Action whitelist | ❌ No validation on action_payload.action | executor.ts:310 |

### Auto-Approval Risk
- `processTimeouts()` auto-approves interventions past `scheduled_for` timestamp
- Implicit consent: user must ACTIVELY reject within window
- **Mitigation:** Guardian throttle limits 10/day; low-effectiveness types auto-disabled

---

## 8. AUTH MIGRATION PRIORITIES (from E2E analysis)

### Tier 1: High-Traffic User-Facing (breaks mobile)
| Route | Current | Traffic |
|-------|---------|---------|
| `/api/chat/stream` | LEGACY | Highest |
| `/api/voice/chat` | LEGACY | High |
| `/api/voice/tts` | LEGACY | High |
| `/api/unified-thread` | LEGACY | High |

### Tier 2: Dashboard (breaks mobile dashboard)
| Route | Current |
|-------|---------|
| `/api/canvas/data/values` | LEGACY |
| `/api/canvas/data/health` | LEGACY |
| `/api/canvas/data/ops` | LEGACY |
| `/api/canvas/widgets` | LEGACY |
| `/api/settings/voice` | LEGACY |

### Tier 3: Already Correct
| Route | Pattern |
|-------|---------|
| `/api/voice/transcribe` | verifyTenantAuth ✅ |
| `/api/emotion/analyze` | verifyTenantAuth ✅ |
| `/api/autonomy/execute` | JWT + tenant check ✅ |

---

## 9. RECOMMENDATIONS — Prioritized

### Sprint Next (P0 — Security + Reliability)
1. **F3.1** Add VPS circuit breaker to chat/stream (prevents 5s latency spike)
2. **F3.2** Migrate voice/chat, voice/tts, settings/voice to `verifyTenantAuth()`
3. **F3.3** Add `guardian.verifyBenefit()` call before `dispatchAction()` in executor.ts
4. **F3.5** Add upsert/lock on thread creation to prevent duplicates

### Sprint +1 (P1 — UX + Data Quality)
5. **F3.4** Add data freshness indicators to dashboard (last_refreshed_at)
6. Migrate chat/stream + unified-thread to `verifyTenantAuth()`
7. Add VoiceInterface recording guard (prevent recording during TTS)
8. Add timeouts to OpenAI/Groq transcription calls

### Sprint +2 (P2 — Performance + Polish)
9. Fix N+1 notes count in canvas values API (batch query)
10. Add 30min polling for CRON-generated data
11. Add retry logic to frontend mutations
12. Add action_payload whitelist to autonomy executor

---

## 10. Cross-Reference with Previous Audits

| Finding | Source | Status |
|---------|--------|--------|
| 114 LEGACY auth routes | A4 Layer 2 | Confirmed — chat/voice/canvas all LEGACY |
| 13 NO_AUTH routes | A4 Layer 2 | 4 fixed (4dc9411), 9 remaining |
| Debug endpoints | A4 Layer 2 | Fixed (verifyAdmin added) |
| loop-daily optimization | F4 | Fixed (17f8b69) |
| Guardian safety gap | A4 Layer 3 | **NEW — needs fix** |
| VPS circuit breaker | A4 Layer 3 | **NEW — needs fix** |
| Voice auth inconsistency | A4 Layer 3 | **NEW — needs fix** |
| Data freshness indicators | A4 Layer 3 | **NEW — needs fix** |
