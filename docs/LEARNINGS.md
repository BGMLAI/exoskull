# ExoSkull Learnings

## Strategy Pipeline Debugging (2026-02-28)
- **Pattern:** When a feature "works but nothing happens" — trace the full lifecycle. Strategy generation worked, but approval/activation was never wired.
- **JSONB steps vs separate table:** ExoSkull stores strategy steps as JSONB array in `exo_goal_strategies.steps`, NOT in a separate `exo_goal_strategy_steps` table. Code querying a nonexistent table silently returned empty → `isStrategyStuck()` always returned false.
- **Auto-activation threshold:** Confidence ≥ 0.7 is the sweet spot. Lower (0.5) activates too many speculative strategies. Higher (0.9) blocks most AI-generated plans.
- **Feedback loop requires context:** Tasks must carry `goal_id` in their context for `onTaskCompleted()` to fire goal feedback. Without it, completed tasks are invisible to the goal system.

## Vercel CLI vs Git Integration (2026-02-28)
- **Vercel CLI `--prod`** runs a local build (4GB heap for Next.js) which can crash resource-constrained sessions.
- **Git Integration** auto-deploys on `git push origin main` — no CLI needed, builds on Vercel infra.
- **Preference:** Always use `git push` + Git Integration for ExoSkull deploys. Reserve CLI for one-off config changes.

## DeepSeek Provider (2026-02-28)
- **OpenAI-compatible:** Same pattern as Kimi — base URL + model name map. Tool calling uses OpenAI function format.
- **Model ID mapping:** `deepseek-v3` (internal) → `deepseek-chat` (API). The API model name is generic, not versioned.

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
