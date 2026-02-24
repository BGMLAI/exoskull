# ExoSkull Learnings

## Petla Event Dedup (2026-02-24)
- **Pattern:** Partial unique indexes must cover ALL active lifecycle states, not just the initial one.
- **Gotcha:** PostgreSQL `ON CONFLICT` clause must exactly match the index WHERE clause — if the index covers `status IN ('pending', 'claimed', 'dispatched')`, the ON CONFLICT must use the same predicate.
- **Dedup keys already include timestamps** (dates/hours), so they naturally expire — no TTL cleanup needed.

## VPS-Vercel Service-to-Service Auth (2026-02-24)
- **Pattern:** VPS agent reuses `VPS_EXECUTOR_SECRET` for callbacks to Vercel internal endpoints. Single secret, bidirectional trust.
- **Middleware bypass:** Internal routes use `/api/internal/` prefix, added to public API bypass list. Each route validates `VPS_AGENT_SECRET` header independently.
- **Supabase service client:** Use `getServiceSupabase()` from `lib/supabase/service.ts`, not `createClient()` (which is `@supabase/supabase-js` direct import, not the project wrapper).

## Knowledge Pre-fetch Strategy (2026-02-24)
- **Phase 1 (quick win):** Inject knowledge context into VPS message body. Zero VPS changes needed. Adds ~200-500ms latency (embedding generation).
- **Phase 2 (complete):** Give VPS agent tools to query knowledge on-demand. More flexible but requires Docker rebuild + new API routes.
- **Non-blocking pattern:** Knowledge pre-fetch wrapped in try/catch with `logger.debug` — if OpenAI embedding fails, VPS still gets the original message.
