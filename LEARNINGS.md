# ExoSkull Learnings

## Async Seeding Creates Race Conditions (2026-02-23)
**Pattern:** Fire-and-forget DB seeding means concurrent requests during first user check get inconsistent results (some granted, some denied).
**Solution:** Deduplicate with `Map<string, Promise>` — first call creates, others await same promise. After: invalidate cache → re-check DB → fallback to in-memory.
**Lesson:** "Seed on first use" needs: dedup guard + await + cache invalidation + DB re-check before fallback.

## Dynamic Imports Break Circular Dependencies (2026-02-23)
**Pattern:** Static imports between autonomy ↔ tasks create circular deps even when indirect.
**Solution:** `const { fn } = await import("@/lib/module")` at the call site. Use on the less-frequently-called side.
**Lesson:** Standard Next.js pattern. Already 5+ instances in codebase. Zero runtime cost after first call (module cached).

## Dual-Write Failures Must Be Visible (2026-02-23)
**Pattern:** `dualWriteTask()` returns `dual_write_success: false` but callers only checked `id` — silent partial failures.
**Solution:** `logger.warn` when `id` exists but `dual_write_success` is false, in both task-service and action-executor.
**Lesson:** Any dual-write system must surface partial failures. Silent degradation masks data inconsistency.

## Sentry Wrapper Causes Build OOM (2026-02-21)
**Pattern:** `withSentryConfig()` wrapping `nextConfig` causes JS heap OOM (~1.5GB) during `next build`, even when no Sentry auth token is set.
**Solution:** Conditionally apply `withSentryConfig` only when `SENTRY_AUTH_TOKEN` is present. Also increase Node heap to 4GB in build script.
**Lesson:** Heavy build-time wrappers (Sentry, Datadog) should be conditional. Don't pay the cost when the integration isn't configured.

## Error Responses Leak Internal Details (2026-02-21)
**Pattern:** 39 API routes included `stack: error.stack` or `details: error.message` in JSON error responses sent to clients. Exposes file paths, code structure, and dependency versions.
**Solution:** Systematic removal of all `stack` and `details` fields from `NextResponse.json()` error payloads. Server-side `logger.error()` preserved for debugging.
**Lesson:** Always audit error responses for information leakage. Pattern: `logger.error(full_details)` + `NextResponse.json({ error: "generic message" })`. Never return raw error messages to clients.

## Webhook Signature Validation Must Be Enforced, Not Logged (2026-02-21)
**Pattern:** Twilio voice webhook had signature validation disabled (log-only) because previous 403s caused English error messages instead of Polish TwiML.
**Solution:** Re-enable enforcement, return proper TwiML error response (not raw HTTP) so Twilio plays the correct language error.
**Lesson:** When disabling security for debugging, never leave it disabled. Use proper error responses that match the protocol (TwiML for Twilio, not JSON).

## Empty Permission Table = Dead Autonomy (2026-02-20)
**Pattern:** Entire autonomy system (41 CRONs, MAPE-K, Conductor, interventions) was architecturally complete but produced zero autonomous actions.
**Root cause:** `user_autonomy_grants` table was empty. Every `isActionPermitted()` call returned `false`.
**Solution:** Default grants seeded on first permission check (async DB seed + immediate in-memory fallback). Migration seeds existing tenants.
**Lesson:** Permission systems must have sane defaults. "Deny all" as initial state blocks the entire pipeline silently — no errors, just nothing happens.

## System Tenant FK Constraint (2026-02-20)
**Pattern:** `exo_tenants` contains a system row with UUID `00000000-0000-0000-0000-000000000000` that doesn't exist in `auth.users`.
**Solution:** Filter migrations with `AND id IN (SELECT id FROM auth.users)` to skip non-auth tenants.
**Lesson:** Always filter by FK existence when iterating over tenant tables. Null/system UUIDs are common.

## Closed-Loop Feedback Required (2026-02-20)
**Pattern:** System executed interventions but never measured if they worked. No feedback = no optimization.
**Solution:** Outcome tracker (48h window: did user respond? did goal progress? → effectiveness score) + learning engine (aggregate → update preferences).
**Lesson:** Open-loop systems don't improve. Always build: act → measure → learn → adapt.

## Puppeteer on Windows — ESM vs CJS (2026-02-17)
**Pattern:** Puppeteer ESM imports fail on Windows when module resolution conflicts.
**Solution:** CJS fallback with `puppeteer-core` + explicit Chrome path: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
**Headless WebGL:** Requires `--enable-webgl --use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.

## Agent SDK Incompatible with Vercel Serverless (2026-02-17)
**Pattern:** Claude Agent SDK `query()` spawns subprocess via `child_process.spawn` — doesn't work on Vercel.
**Solution:** Direct Anthropic Messages API + manual tool execution loop. Works everywhere.
**Impact:** Replaced across all 8 call sites. Agent SDK deprecated.

## Proactive Notifications — Silent DB Problem (2026-02-18)
**Pattern:** 70% of proactive systems wrote to DB without notifying users. Systems "worked" in logs but users never knew.
**Root cause:** `sendProactiveMessage()` not called — only DB writes and intervention pipeline.
**Lesson:** Always verify notification reaches user, not just that data is persisted. Test from user's perspective.

## N+1 Query in Values API (2026-02-17)
**Pattern:** Per-entity notes count queries scaled linearly with number of entities.
**Solution:** Batch `GROUP BY` aggregation — 1-2 queries regardless of entity count.
**Lesson:** Watch for N+1 patterns whenever loading hierarchical data with counts.

## Self-Modification Safety (2026-02-18)
**Pattern:** Code self-modification needs multiple safety layers.
**Solution:** Kernel guard validates ALL diffs: no auth bypass, no data deletion, no env mutation, no secrets, no migration drops.
**Architecture:** Source engine → diff generator → kernel guard → PR pipeline → audit log.
**Lesson:** Never trust AI-generated diffs without validation. Log everything.

## MeshBasicMaterial for Unlit 3D Scenes (2026-02-17)
**Pattern:** MeshStandardMaterial in Three.js requires lighting setup. Without lights, objects appear black.
**Solution:** MeshBasicMaterial doesn't need lighting — renders flat colors. Better for UI-style 3D.
**When:** Any 3D scene where you want objects visible without light setup.

## CRON Cascade Blockage (2026-02-15)
**Pattern:** CRON dependency check (e.g., gold-etl depends on silver-etl) can permanently block if dependency fails.
**Solution:** 24h staleness bypass — if CRON hasn't succeeded in >24h and deps aren't met, bypass and run anyway.
**Lesson:** All dependency chains need circuit breaker / staleness bypass.

## Twilio SMS Limits (2026-02-18)
**Pattern:** Twilio SMS max ~1600 chars. Long AI responses get truncated.
**Solution:** Truncate at 1500 chars with "..." suffix. For long content, send summary + link.
**Pattern:** Rate limit proactive messages (8/day/tenant) + quiet hours (23:00-07:00).

## Thread Race Condition (2026-02-17)
**Pattern:** Two concurrent messages from same tenant → duplicate threads.
**Solution:** Atomic `upsert(onConflict, ignoreDuplicates)` + fallback select.
**Lesson:** Always use upsert for "get or create" patterns in concurrent systems.

## Windows ARM64 — Native Modules Fail (2026-02-14)
**Pattern:** `better-sqlite3` npm install fails on Windows ARM64 (native compile).
**Solution:** JSON file store instead of SQLite for simple state persistence.
**Lesson:** Avoid native compilation dependencies on Windows ARM64. Use pure JS alternatives.

## Build OOM on Large Next.js Apps (2026-02-16)
**Pattern:** Full `next build` can OOM even with 8GB heap on large codebases.
**Solution:** Use `tsc --noEmit` for type checking + dev server for verification instead of full build.
**Workaround:** Kill zombie node processes (can accumulate to 1.3GB+).
