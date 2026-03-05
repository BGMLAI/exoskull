# ExoSkull Learnings

## V3 Agent Token Cost — Main Waste Sources (2026-03-05)

- **maxTurns too high** was the #1 waste. 15 turns × full context (system prompt + 34 tools + history) = up to 120K tokens per simple question. Most queries resolve in 1-3 turns.
- **Tool schemas are expensive** — 34 tools ≈ 3400 tokens overhead PER TURN. Multiply by turns for real cost.
- **Memory search on every query** is wasteful. "Cześć" doesn't need vector search. Gate it: only search if message >30 chars or contains memory-related keywords.
- **Duplicate routing** — stream/route.ts and agent.ts both classified queries and called Gemini independently. One classification point is enough.
- **Context cache 30s** was too short for conversational flow. 5 min covers most back-and-forth without stale data issues.
- **Prompt caching (`cache_control: ephemeral`)** saves ~90% on static system prompt across turns. Use it whenever system prompt >1K tokens.
- **DeepSeek is 11-14x cheaper than Sonnet** with comparable tool calling quality for standard tasks. Use expensive models only for complex generation (build_app).
- **Pattern:** For cost-sensitive agents, route by complexity BEFORE choosing model. Most queries are simple/medium and don't need the most expensive model.

## Next.js Route Files Can Only Export HTTP Handlers (2026-03-02)

- Putting helper functions (`registerConversation`, `getActiveConversationCount`) alongside `POST` handler in a route file caused TS error: `Property 'registerConversation' is incompatible with index signature`.
- Next.js App Router validates that route files only export: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, plus `config`, `generateStaticParams`, etc.
- **Solution:** Extract shared state/helpers to a separate module (`lib/chat/active-conversations.ts`) and import in the route.
- **Pattern:** Route files are API boundaries — keep them thin. Business logic, shared state, and utilities belong in `lib/`.

## Supabase Migration History Needs Manual Repair for Prod Drift (2026-03-02)

- `supabase db push` fails when remote has migration versions not found locally (e.g., applied directly via SQL Editor or different branch).
- Error: "Remote migration versions not found in local migrations directory."
- **Solution:** `supabase migration repair --status reverted <version>` for remote-only entries, `--status applied <version>` for objects that already exist.
- Always use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DO $$ BEGIN CREATE POLICY ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` for idempotent migrations.
- **Pattern:** Production databases drift from migration files. Make every migration idempotent (IF NOT EXISTS everywhere) so re-running is safe.

## Vercel Outages Block Git-Based Deploys But Code Is Safe (2026-03-02)

- Vercel "internal error" during "Deploying outputs" = platform issue, not code issue. Build succeeds, deployment fails.
- 6 redeploy attempts over 20 minutes — all same error. Redeploying old known-good builds also fails.
- Code is in git → will auto-deploy when Vercel recovers.
- **Pattern:** For CI/CD, always have a way to verify: (1) code compiles, (2) tests pass — independently of the deployment platform. Don't block E2E testing on a single deploy target if you can test subsets against existing prod.

## Autonomous Loops Must Share Tables, Not Just Concepts (2026-02-28)

- 5 independent loops (MAPE-K, Ralph, Impulse, Gap Detection, Dynamic Skills) were individually coded but **wrote to different tables** — Gap Detector → `learning_events`, Ralph/Impulse → `exo_proactive_log`. Zero cross-loop visibility.
- **Solution:** Bridge writes — Gap Detector now upserts to `exo_proactive_log` in addition to `learning_events`. Ralph's OBSERVE already queries `exo_proactive_log`, so gaps become visible immediately.
- **Pattern:** When building multi-loop autonomous systems, the TABLE SCHEMA is the contract between loops, not the code. If two loops don't share a table, they can't communicate. Always audit table reads/writes across all loops before assuming they connect.

## Exponential Backoff Prevents Dead-Gap Blocking (2026-02-28)

- Impulse Handler F's dedup only checked `auto_build:` (success) entries, not failures. A gap that failed `generateApp()` would be retried every 30 minutes forever, blocking all other gaps (one action per cycle).
- **Solution:** Log failures as `auto_build_fail:{gap.id}` in `exo_proactive_log`. On next cycle, check failure count and apply backoff: `min(2^(n-1), 14)` days. After 4 failures → 14-day max backoff.
- **Pattern:** Any retry system needs both success AND failure tracking. Success-only dedup creates invisible infinite loops. Always: log failures → count → backoff → eventually retry.

## Stuck Counter Reset Requires Distinct Outcome Values (2026-02-28)

- Ralph Loop's stuck counter checks `outcome === "skipped" || outcome === "failed"` in last 5 journal entries. Lateral thinking (cycles 3+) logs with outcome "skipped" → counter never resets → infinite death spiral.
- **Solution:** Escalation at 6+ cycles logs with outcome `"escalated"` — neither "skipped" nor "failed" — which breaks the consecutive count.
- **Pattern:** Finite state machines need explicit "escape" states. If all failure paths map to the same state that triggers the failure check, you have a livelock. Add a distinct state for "gave up and asked for help."

## Async Seeding Creates Race Conditions (2026-02-23)

- Fire-and-forget DB seeding (`seedDefaultGrants().catch(...)`) means concurrent requests during first user check get inconsistent results.
- Some requests see in-memory fallback (granted), others hit empty DB (denied), others hit partially-seeded DB (inconsistent).
- **Solution:** Deduplicate concurrent seeds with `Map<string, Promise>` — first call creates the promise, subsequent calls await the same promise. After resolution: invalidate cache, re-check DB, then fall back to in-memory.
- **Pattern:** Any "seed on first use" system needs: (1) dedup guard, (2) await completion, (3) cache invalidation, (4) DB re-check before fallback.

## Dynamic Imports Break Circular Dependencies (2026-02-23)

- Static `import { createTask } from "@/lib/tasks/task-service"` in autonomy modules creates circular deps when task-service also imports from autonomy (even indirectly).
- **Solution:** `const { createTask } = await import("@/lib/tasks/task-service")` at the call site. Already standard pattern in the codebase (5+ instances).
- **When to use:** Any cross-module dependency where A→B and B→A (directly or transitively). Dynamic import on the less-frequently-called side.

## Dual-Write Failures Must Be Visible (2026-02-23)

- `dualWriteTask()` returns `{ id, dual_write_success, error }` but callers only checked `id` — partial failures (written to one store but not the other) were completely silent.
- **Solution:** `logger.warn` whenever `id` exists but `dual_write_success` is false. Added in both `task-service.ts` (generic) and `action-executor.ts` (autonomy-specific).
- **Lesson:** Any dual-write/dual-read system must surface partial failures. Silent degradation prevents debugging and masks data inconsistency.

## Middleware Auth: Cookie + Bearer in One Place (2026-02-23)

- Next.js middleware runs BEFORE route handlers. If it only checks cookies, all API/mobile clients get 401 — even if the route handler has its own Bearer auth.
- **Solution:** Check both in middleware: `supabase.auth.getUser()` for cookies, then `createClient().auth.getUser(token)` for Bearer.
- Route-level auth (`verifyTenantAuth`) is still needed for tenantId resolution, but middleware unblocks the request first.
- `createAuthClient()` is cookie-only (SSR helper) — never use it in API routes that need Bearer support. Always use `verifyTenantAuth()`.

## BGML Classifier Must Be Bilingual (2026-02-23)

- English-only keywords → Polish user messages ALL classified as "general" complexity 1 → no frameworks, no DIPPER, no MoA triggered.
- Domain keywords need BOTH languages: "strategia"/"strategy", "zadanie"/"task", "napisz kod"/"write code".
- Complexity indicators especially critical in Polish: "przeanalizuj" (analyze), "zaprojektuj" (design), "5-letni plan" (5-year plan).
- Use stemmed/partial keywords ("cenow" matches "cenowa/cenowy/cenowe") for inflected languages.

## Circular Dependencies in IORS Tool Registry (2026-02-23)

- `discovery-tools.ts` → `index.ts` (IORS_EXTENSION_TOOLS) → `discovery-tools.ts` = circular import crash.
- **Solution:** Use `shared.ts` exports (`getRegisteredTools()`) instead of barrel `index.ts`.
- General rule: tools should never import from the tool registry barrel file.

## E2E Testing with Playwright on Root/Server (2026-02-23)

- Chromium refuses to run as root without `--no-sandbox` flag.
- MCP Playwright wrapper doesn't support custom launch args → use direct Playwright API.
- `networkidle` wait is more reliable than `domcontentloaded` for SPA navigation.
- `waitForTimeout` needed for SSE/streaming responses — no DOM element to wait for.

## BGML Pipeline Design Patterns (2026-02-23)

- **Complexity-based routing is key:** Don't run expensive multi-model ensembles for simple queries. Tier system (1-2: direct, 3: framework, 4: DIPPER, 5: MoA) keeps costs at $0.001-$0.05 per query.
- **Multi-model diversity > single-model ensemble:** Using different models per perspective (Gemini for analytical, Sonnet for creative, Haiku for practical) gives genuinely different insights vs same model 3x.
- **Quality gates prevent quality regression:** Auto-escalation from DIPPER→MoA when quality < 50, and LLM judge as final arbiter. Never ship a response below threshold.
- **Pre-search before planning, not after:** Running memory + web search BEFORE the planner means the plan already knows what context exists. Avoids wasted tool calls.
- **Voice latency constraint:** BGML pipeline adds ~2-5s for DIPPER, ~5-10s for MoA. Voice must cap at framework-only (complexity 3). Web can run full pipeline.
- **Byzantine consensus is advisory:** Never block on consensus failure. If validators can't agree or API fails, proceed with logging. Safety is defense-in-depth, not a single gate.

## Smart Tool Filtering Prevents Prompt Bloat (2026-02-23)

- 150+ tools in system prompt = ~30K tokens wasted. 25 core + intent-activated packs = ~5K tokens.
- Keyword-to-pack mapping (English + Polish) lets planner activate relevant tools without scanning all descriptions.
- `discover_tools` as always-available tool lets the agent find tools not in current pack.

## Empty Permission Table = Dead Autonomy (2026-02-20)

- `user_autonomy_grants` empty → all `isActionPermitted()` returns false → zero autonomous actions
- Solution: `default-grants.ts` seeds 9 conservative grants per tenant on first check
- Permission model falls back to in-memory defaults while DB seed runs async
- Lesson: Always have default permissions. "Deny all" as initial state kills the entire pipeline silently.

## Supabase Migration FK Gotcha (2026-02-20)

- `exo_tenants` has system row `00000000-...` not in `auth.users` → FK violation on `user_autonomy_grants.user_id`
- Fix: `AND id IN (SELECT id FROM auth.users)` in migration SELECT
- Lesson: Always filter tenant iterations by FK existence

## ESM vs CJS in Next.js Scripts

- ExoSkull uses ESM (`import`/`export`) throughout. Inline `tsx -e` with `require()` fails.
- **Solution**: Standalone `.mjs` files with `fetch()` for scripts needing env vars but not Next.js module resolution.
- For scripts needing ExoSkull lib imports: `.ts` file with proper `import` + `tsx` runner (not inline).

## Supabase REST API for Direct DB Access

- Service role key bypasses RLS. Use `Prefer: resolution=merge-duplicates` header for upserts.
- Auth: `Authorization: Bearer ${SERVICE_ROLE_KEY}` + `apikey: ${SERVICE_ROLE_KEY}`.
- No `exec_sql` RPC by default — run migrations via `supabase db push` or direct SQL connection.

## Google OAuth Token Management

- Two parallel token refresh systems:
  1. `lib/rigs/oauth.ts` → `ensureFreshToken()` → `exo_rig_connections` (rig integrations)
  2. `lib/autonomy/token-refresh.ts` → `checkAndRefreshExpiring()` → `exo_email_accounts` (email integrations)
- `expires_in` is seconds → `expires_at = Date.now() + expires_in * 1000`.
- Google may or may not return new `refresh_token` — only update DB if present.

## exo_rig_sync_log Schema Drift

- Table (migration): `status`, `error_message`, `sync_type`, `data_range`.
- Route.ts inserts: `connection_id`, `success`, `error`, `duration_ms`, `metadata`.
- Mismatch → route INSERT silently fails. Fix: migration `20260218100001_sync_log_columns.sql`.

## Google Fit API Data Types

| Data Type                      | Aggregation | Value Field |
| ------------------------------ | ----------- | ----------- |
| `com.google.step_count.delta`  | steps       | `intVal`    |
| `com.google.heart_rate.bpm`    | avg HR      | `fpVal`     |
| `com.google.calories.expended` | total kcal  | `fpVal`     |
| `com.google.sleep.segment`     | duration    | varies      |
| `com.google.distance.delta`    | meters      | `fpVal`     |

- Bucket by `86400000` ms (1 day) for daily aggregates.
- Insert 100ms delay between API calls for rate limiting.

## Sync Endpoint Auth Gap

- `POST /api/rigs/[slug]/sync` requires `verifyTenantAuth` (Supabase session cookie).
- Cannot be called from CRON or service scripts.
- **Solution**: Dedicated CRON endpoint `app/api/cron/rig-sync/route.ts` with `withCronGuard` + service role Supabase.

## Headless Chrome WebGL

- 3D scenes need: `--enable-webgl --use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
- Without these flags, 3D canvas renders "Ładowanie..." indefinitely.

## Chat Routing Classifier: Whitelists > Blacklists (2026-02-23)

- Generic file extension regex `/\.\w{1,4}$/` causes false positives (`.pro`, `.com`, `.io`, `.app` all match)
- **Solution:** Explicit whitelist of 40+ known code extensions. Misses nothing real, blocks all false positives.
- Polish word "plik" (file) in CODE_KEYWORDS is fine, but upload confirmations `[Wgrałem plik: ...]` need explicit exclusion before keyword check.
- Lesson: Message classifiers need negative patterns (what NOT to match) as much as positive ones.

## Proactive Message Dedup: Centralize, Don't Distribute (2026-02-23)

- 5+ separate CRONs call `sendProactiveMessage()` — adding dedup to each caller is fragile and incomplete.
- **Solution:** Put rate limit + per-trigger dedup INSIDE `sendProactiveMessage()` itself. All callers protected automatically.
- 6-hour window per trigger_type prevents repeat spam. Daily cap (8 msgs) prevents overall flood.
- Watch for double execution: `impulse` and `intervention-executor` CRONs both processed pending interventions → removed from impulse.

## Whisper Hallucination Patterns in Polish (2026-02-23)

- Whisper generates YouTube outro phrases on silence/noise: "Dziękuję za oglądanie", "Praca na farmie w Danii", "Nie zapomnijcie zasubskrybować"
- These arrive as real messages in web_chat (not just voice pipeline)
- **Solution:** Share `isHallucination()` between voice transcription AND chat stream — single source of truth
- Repetition detection gotchas:
  - Short words ("nie", "to") must be counted (filter `>1` char, not `>2`)
  - Punctuation must be stripped before word splitting
  - Threshold `>=0.5` catches "word word word other" (3/4 = 75%)
  - Single "Halo?" is legitimate — require `{3,}` repetitions for short greetings

## .vercelignore Patterns Are Recursive Like .gitignore (2026-03-02)

- `supabase/` in `.vercelignore` matches ALL directories named `supabase` at ANY depth — including `lib/supabase/` which contains `client.ts`, `server.ts`, `middleware.ts`.
- Similarly, `tools/` matches `lib/iors/tools/` — the entire IORS tool library.
- **Solution:** Prefix with `/` for root-only matching: `/supabase/`, `/tools/`, `/scripts/`.
- **Pattern:** `.vercelignore` (like `.gitignore`) treats bare directory names as recursive patterns. Always use `/dirname/` (leading slash) for top-level-only exclusions. This silently broke the build with "Module not found" errors.

## Vercel Deploys From Specific GitHub Repo (2026-03-02)

- Two remotes: `origin` (exoskull.git) and `v3-origin` (exoskull-v3.git). Vercel project `exoskull-v3` deploys from `v3-origin`, NOT `origin`.
- Pushing to `origin/v3` does NOT trigger Vercel deployment. Must push to `v3-origin/main`.
- **Pattern:** Always verify which remote/branch Vercel is connected to before assuming deployment was triggered. Check `exoskull-app/.vercel/project.json` for project ID, then cross-reference with Vercel dashboard.

## Bash in Claude Code on Windows

- Many commands return exit code 1 with no output — use dedicated tools (Glob, Read, Grep) when possible.
- `wc -l` can fail with piped input on Git Bash — use `wc -w`.
- Always use forward slashes in paths.
