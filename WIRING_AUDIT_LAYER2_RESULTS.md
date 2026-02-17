# A4 Warstwa 2 — API ↔ Frontend Audit Results

**Date:** 2026-02-17
**Scope:** Fetch mapping, auth consistency, dead endpoint detection
**Codebase:** 241 API routes, 902 source files

---

## 1. Health Scores

| Metric | Score | Details |
|--------|-------|---------|
| Fetch Mapping Coverage | **B+** | 148/241 routes actively referenced |
| Auth Consistency | **D** | Only 30/207 use correct `verifyTenantAuth()` pattern |
| Dead Endpoints | **C+** | ~45 potentially dead routes |
| **Overall Layer 2** | **C** | Auth migration is the critical issue |

---

## 2. Auth Pattern Distribution (207 user-facing routes)

| Pattern | Count | Status |
|---------|-------|--------|
| **CORRECT** (`verifyTenantAuth`) | 30 | Good |
| **LEGACY** (`createClient + getUser`) | 114 | Needs migration |
| **ADMIN** (`requireAdmin`) | 14 | Good |
| **CRON** (`withCronGuard`) | 38 | Good |
| **SERVICE** (`getServiceSupabase`) | 11 | Good (webhooks) |
| **NO AUTH** | 13 | Red flag — review needed |

### 2a. RED FLAG — 13 routes with NO auth check

| Route | Risk | Action |
|-------|------|--------|
| `/api/debug/ai-providers` | HIGH | Remove from prod or add admin auth |
| `/api/debug/ai-test` | HIGH | Remove from prod or add admin auth |
| `/api/emotion/analyze` | HIGH | Add verifyTenantAuth |
| `/api/voice/transcribe` | HIGH | Add verifyTenantAuth |
| `/api/mobile/push/send` | HIGH | Add verifyTenantAuth or API key |
| `/api/meta/data-deletion-status` | MEDIUM | Add verifyTenantAuth |
| `/api/agents` | MEDIUM | Add verifyTenantAuth or make intentionally public |
| `/api/models/search` | LOW | May be intentionally public |
| `/api/tools` | LOW | May be intentionally public |
| `/api/tools/search` | LOW | May be intentionally public |
| `/api/gateway/*` (5 routes) | OK | Webhook-style — verify via signature |
| `/api/integrations/composio/callback` | OK | OAuth callback — state-validated |
| `/api/rigs/[slug]/magic-connect` | OK | Magic link — token-validated |

### 2b. LEGACY AUTH (114 routes) — Migration Priority

**Current pattern (LEGACY):**
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Target pattern (CORRECT):**
```typescript
const auth = await verifyTenantAuth(request);
if (!auth.ok) return auth.response;
const tenantId = auth.tenantId;
```

**Why migrate:** `verifyTenantAuth` supports Bearer token auth (mobile), centralizes auth logic, provides consistent error responses.

**Top priority routes for migration (user-facing, high traffic):**
1. `/api/chat/stream` — main chat endpoint
2. `/api/canvas/data/*` (17 routes) — all dashboard widgets
3. `/api/user/profile` — user provider
4. `/api/settings/*` (8 routes) — all settings pages
5. `/api/autonomy/*` (4 routes) — autonomy system
6. `/api/conversations/*` — conversation management
7. `/api/voice/*` (5 routes) — voice features

---

## 3. Frontend Fetch Map — Key Observations

### 3a. Busiest Endpoints (most frontend consumers)
| Endpoint | Consumer Count | Files |
|----------|---------------|-------|
| `/api/chat/stream` | 6 | HomeChat, UnifiedStream, ConversationCenter, StudioPanel, emails, ConversationPanel |
| `/api/user/profile` | 5 | UserProvider, settings, QuickSettings, ContextPanel |
| `/api/canvas/data/values` | 3 | values page, ValueTreeWidget, useOrbData |
| `/api/knowledge/upload` | 3 | knowledge.ts, ModelPicker, SourcesPanel |
| `/api/voice/tts` | 4 | VoiceSettings, VoiceIDPanel, HomeChat, UnifiedStream |

### 3b. API Client Centralization
| Module | Purpose | Endpoints Covered |
|--------|---------|-------------------|
| `lib/api/knowledge.ts` | Knowledge CRUD | 18 functions covering loops, campaigns, quests, ops, notes |
| `components/dashboard/autonomy/useAutonomyData.ts` | Autonomy state | autonomy, execute, guardian |
| `lib/extensions/hooks.ts` | Mods/Apps/Skills | mods, apps, installations, registry |

### 3c. Patterns Found
- **Canvas widgets** poll individual `/api/canvas/data/*` endpoints (12+ variants) — could benefit from batching
- **Settings pages** each have their own endpoint (`/api/settings/voice`, `/api/settings/personality`, etc.) — good separation
- **Knowledge module** properly centralized in `lib/api/knowledge.ts`
- **Voice features** scattered across 5+ endpoints — consider consolidation

---

## 4. Dead/Orphan Endpoints (~45)

### 4a. Confirmed Dead (safe to remove)
| Endpoint | Reason |
|----------|--------|
| `/api/debug/ai-providers` | Dev-only, no frontend refs |
| `/api/debug/ai-test` | Dev-only, no frontend refs |
| `/api/knowledge/import-url` | Replaced by upload-url |

### 4b. Likely Dead (verify before removing)
| Endpoint | Notes |
|----------|-------|
| `/api/knowledge/challenges` | No refs — planned feature? |
| `/api/knowledge/missions` | No refs — planned feature? |
| `/api/knowledge/multipart-upload` | May be used by large file flow |
| `/api/swarm/execute` | Experimental — no frontend refs |
| `/api/messages/[id]/to-task` | Experimental — no frontend refs |
| `/api/schedule/custom` | No frontend refs |
| `/api/voice/analyze-image` | Experimental — no frontend refs |
| `/api/audio/generate-cache` | May be CRON-triggered |

### 4c. Admin Routes — Partially Dead
10/16 admin routes have no detected frontend refs. However, they may be called from admin pages via dynamic routing or the admin overview page's API calls. **Do not remove without manual verification.**

### 4d. External-Only (NOT dead)
These have no frontend refs but are called externally:
- All `/api/cron/*` (38 routes)
- All `/api/gateway/*` (5 routes)
- All `/api/webhooks/*` (3 routes)
- All `/api/twilio/*` (4 routes)

---

## 5. Recommendations

### Sprint Next — Critical (auth security)
1. **Add auth to 5 HIGH-risk no-auth routes** (debug, emotion/analyze, voice/transcribe, mobile/push/send, meta/data-deletion-status)
2. **Remove debug endpoints from production** or gate behind admin auth

### Sprint +1 — High (auth migration)
3. **Migrate top 30 LEGACY routes** to `verifyTenantAuth()` — start with chat/stream, canvas/data/*, user/profile
4. **Create migration script/template** for remaining 84 LEGACY routes

### Sprint +2 — Medium (cleanup)
5. **Remove confirmed dead endpoints** (3 routes)
6. **Verify and archive likely dead endpoints** (8 routes)
7. **Consolidate voice endpoints** into fewer routes

### Backlog
8. **Canvas data batching** — reduce 12+ individual widget polls to 1-2 batch calls
9. **Complete LEGACY→CORRECT auth migration** (remaining 84 routes)

---

## 6. Cross-Reference with Previous Audits

| Finding | Source | Status |
|---------|--------|--------|
| F2: knowledge/ops broken auth | A2 §6 | **FIXED** (commit 3ec09d0) |
| F8-F10: voice/notes, schedule, emotion/history | A2 | Already correct (verified) |
| 13 NO_AUTH routes | A4 Layer 2 | **NEW — needs fix** |
| 114 LEGACY auth routes | A4 Layer 2 | **NEW — migration needed** |
| ~45 dead endpoints | A4 Layer 2 | **NEW — cleanup needed** |
