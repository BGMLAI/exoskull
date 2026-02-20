# ExoSkull Learnings

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

## Bash in Claude Code on Windows

- Many commands return exit code 1 with no output — use dedicated tools (Glob, Read, Grep) when possible.
- `wc -l` can fail with piped input on Git Bash — use `wc -w`.
- Always use forward slashes in paths.
