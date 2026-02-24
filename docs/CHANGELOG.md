# ExoSkull Changelog

## 2026-02-24 — P1 Event Dedup + VPS Knowledge Access

### Fix: P1 Event Spam (Petla dedup)
- **Root cause:** Dedup unique index only covered `status = 'pending'`. Once events transitioned to `claimed`/`dispatched`, same `dedup_key` could be reinserted, causing Petla CRON (1/min) to process duplicates.
- **Fix:** Broadened unique index to cover `pending + claimed + dispatched`. Only `ignored` allows re-emission.
- **Migration:** `supabase/migrations/20260224000001_fix_petla_dedup_index.sql`
- **Cleanup:** Existing duplicate dispatched events marked as `ignored`.

### Feature: VPS Knowledge Access (Phase 1 + Phase 2)
- **Phase 1:** Chat stream pre-fetches top 3 knowledge results before VPS proxy, prepends `[KNOWLEDGE CONTEXT]` block. Non-blocking try/catch.
- **Phase 2a:** Internal API endpoints (`/api/internal/knowledge-search`, `/api/internal/knowledge-documents`) with `VPS_AGENT_SECRET` auth.
- **Phase 2b:** VPS agent-executor gains `search_knowledge` and `list_documents` tools. Calls back to Vercel internal endpoints.
- **Middleware:** `/api/internal/` added to public bypass list.
- **Docker:** `EXOSKULL_API_URL` env var added to `docker-compose.yml`.

### Files Changed
| File | Action |
|------|--------|
| `supabase/migrations/20260224000001_fix_petla_dedup_index.sql` | NEW |
| `exoskull-app/app/api/chat/stream/route.ts` | MODIFIED |
| `exoskull-app/app/api/internal/knowledge-search/route.ts` | NEW |
| `exoskull-app/app/api/internal/knowledge-documents/route.ts` | NEW |
| `exoskull-app/lib/supabase/middleware.ts` | MODIFIED |
| `vps-executor/src/services/agent-executor.ts` | MODIFIED |
| `vps-executor/docker-compose.yml` | MODIFIED |

## 2026-02-23 — Architecture Fixes + Auth + E2E Testing

See git log for details.
