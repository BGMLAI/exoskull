# ExoSkull Learnings

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
