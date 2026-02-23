# ExoSkull Learnings

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

## Bash in Claude Code on Windows

- Many commands return exit code 1 with no output — use dedicated tools (Glob, Read, Grep) when possible.
- `wc -l` can fail with piped input on Git Bash — use `wc -w`.
- Always use forward slashes in paths.
