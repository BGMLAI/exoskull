# ExoSkull Learnings

## CLAUDE.md Musi Miec Wizje Produktu, Nie Tylko Techniczne Detale (2026-03-01)
**Pattern:** Claude Code gubil wizje produktu miedzy sesjami. Budowal "asystenta" zamiast "autonomicznego agenta SaaS". CLAUDE.md opisywal "second brain" i "goal executor" — zbyt ogolnikowo.
**Root cause:** CLAUDE.md mial ~100 linii aspiracyjnej prozy (Data Lake details, Android APIs, Skill API code) ale ZERO explicite wymienionych core capabilities. Stale dane (142 routes zamiast 219, deprecated Multi-Model Routing). Sekcja Frameworks zduplikowana z globalnego.
**Solution:** Przepisac CLAUDE.md z numerowana lista NON-NEGOTIABLE capabilities (autonomia, budowanie appek, self-modifying code, sub-agenty, outbound actions, superintegrator, self-build). Wizja produktu jako PIERWSZA sekcja.
**Lesson:** CLAUDE.md to nie dokumentacja techniczna — to BRIEFING dla nowego developera. Musi odpowiadac na "CO budujemy i DLACZEGO" zanim przejdzie do "JAK".

## MEMORY.md Musi Byc Indeksem, Nie Zbiorem Wszystkiego (2026-03-01)
**Pattern:** MEMORY.md uroslo do 253 linii (limit 200). Kazda sesja dostawala truncation warning. Szczegoly subsystemow (voice pipeline, cockpit HUD, email system) zasmiecaly glowny plik.
**Solution:** MEMORY.md jako zwiezly indeks (128 linii) z linkami do 6 topic files. Wizja produktu na gorze, gotchas w srodku, projekt structure na dole.
**Lesson:** Persistent memory files traktuj jak RAM — ograniczona pojemnosc. Szczegoly w osobnych plikach (jak swap), indeks w glownym.

## ExoSkull v2 — Separate Repo, Not Branch (2026-03-01)
**Pattern:** v1 monorepo grew to 120k+ LOC, 40+ tables, 18 layers. Refactoring inside the same repo would carry dead weight.
**Solution:** Clean repo (`exoskull-v2`) with Turborepo, shared packages (`types`, `engine`, `store`, `ui`), 4-layer architecture. Claude Code as nervous system, not a feature.
**Lesson:** When rewriting >80% of a codebase, start a new repo. Shared packages (`@exoskull/*`) allow cherry-picking working code from v1 without inheriting debt.

## 75% Dead Code = Rebuild, Not Refactor (2026-03-01)
**Pattern:** Dashboard audit found 81/108 components dead, 5 dead UI layers, 11 hidden pages. Patches on top of dead code kept growing.
**Solution:** Full purge (130+ files, -33k lines) + new architecture from scratch (Spatial Chat OS). Kept only stream renderers and API routes.
**Lesson:** When dead code exceeds 50%, refactoring costs more than rebuilding. Audit first, count dead %, then decide.

## Pointer-Events Layering for HUD Overlays (2026-03-01)
**Pattern:** Multiple transparent layers (3D scene, widgets, chat) need to pass clicks through while keeping interactive elements clickable.
**Solution:** Container `pointer-events-none` + interactive children `pointer-events-auto`. Z-index layers: scene(0) → widgets(8) → chat(10) → palette(50).
**Lesson:** Glass-morphism HUD overlays need explicit pointer-events management per layer.

## Agent Nie Ma Plan B — Powtarza Ten Sam Błąd w Nieskończoność (2026-02-28)
**Pattern:** User wgrał PNG ze screenshotem danych OVH. Agent 10+ razy powtórzył "wklej dane tekstowo" zamiast znaleźć rozwiązanie. Tworzył "OCR apps" które były pustymi formularzami. Referował do nieistniejącego dashboardu.
**Root cause:** Agent nie ma mechanizmu "fallback escalation". Gdy pierwsza metoda zawiedzie, powtarza ją w kółko. Brak: (1) Vision API integration, (2) OCR capability w systemie, (3) mechanizmu "jeśli nie umiem → zbuduj tool → użyj tool".
**Lesson:** System deklarujący autonomię MUSI umieć: (a) rozpoznać że obecna metoda nie działa po 2 próbach, (b) wygenerować alternatywne podejście, (c) zbudować brakujące narzędzie. Powtarzanie "wklej tekst" 10x to ANTI-PATTERN nr 1 agentowego systemu.

## build_app Tworzy Puste Formularze, Nie Działające Aplikacje (2026-02-28)
**Pattern:** User poprosił "zrób sobie aplikację OCR". Agent użył `build_app` → powstał pusty formularz DB, nie aplikacja z logiką. `build_app` tworzy: tabelę Postgres + widget Canvas. NIE tworzy: logiki biznesowej, integracji z API, przetwarzania danych.
**Root cause:** `generateApp()` generuje JSON spec → schema DB → widget render. Zero capability do generowania kodu backendowego.
**Lesson:** "App" w ExoSkull ≠ aplikacja. To formularz z tabelą. Prawdziwa app wymaga: logiki, API calls, przetwarzania. System kłamie użytkownikowi mówiąc "zbudowałem OCR app".

## Agent Referuje do Nieistniejącego UI (2026-02-28)
**Pattern:** Agent mówił "wgraj na dashboard", "widget OCR na dashboardzie" — user odpowiedział "KURWA NIE MAM ŻADNEGO DASHBOARDU IDIOTO". Agent hallucynuje UI features które nie istnieją.
**Root cause:** Agent ma w kontekście ARCHITECTURE.md z "✅ LIVE" statusami, które kłamią. Agent ufa dokumentacji zamiast weryfikować stan faktyczny.
**Lesson:** Agent MUSI weryfikować czy feature istnieje ZANIM go zasugeruje. Nie ufaj "✅ LIVE" w docs — sprawdź endpoint/komponent.

## Autonomous Loops Must Share Tables (2026-02-28)
**Pattern:** 5 loops individually coded but Gap Detector writes `learning_events`, Ralph/Impulse read `exo_proactive_log`. Zero cross-loop visibility.
**Solution:** Bridge writes — upsert gaps to `exo_proactive_log` alongside `learning_events`.
**Lesson:** Table schema is the contract between autonomous loops. If loops don't share a table, they can't communicate.

## Failed Retries Need Distinct Tracking (2026-02-28)
**Pattern:** Impulse dedup checked `auto_build:` (success) but not failures. Same broken gap retried every 30min forever.
**Solution:** Log `auto_build_fail:{id}` on failure, apply exponential backoff `min(2^(n-1), 14)` days.
**Lesson:** Any retry system needs BOTH success and failure tracking. Success-only dedup creates invisible infinite loops.

## Stuck Counter Needs Escape State (2026-02-28)
**Pattern:** Ralph stuck counter checks `outcome === "skipped" || "failed"`. Lateral thinking (3+ cycles) logs "skipped" → counter never resets.
**Solution:** Escalation logs `"escalated"` — breaks consecutive count. SMS user for direction.
**Lesson:** If all failure paths map to the same state that triggers the failure check, you have a livelock. Add a distinct "gave up" state.

---

## WSL Git on NTFS Needs Local User Config (2026-02-25)
**Pattern:** `git commit` fails with "Author identity unknown" even though previous commits exist.
**Solution:** `git config user.name "X" && git config user.email "x@y"` per-repo. WSL doesn't inherit Windows git global config.
**Lesson:** Always check `git config user.name` before first commit in WSL repo.

## WSL HTTPS Git Push Needs Windows Credential Helper (2026-02-25)
**Pattern:** `git push` to HTTPS remote fails with "could not read Username" in WSL.
**Solution:** `git config credential.helper "/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe"` — use Windows Git credential manager from WSL.
**Lesson:** WSL doesn't have its own credential store. Bridge to Windows GCM for HTTPS repos.

## Symlinks vs Copy for Shared Config (2026-02-25)
**Pattern:** User wants same skills/plugins in project .claude/ as in global ~/.claude/.
**Solution:** `ln -s ~/.claude/skills project/.claude/skills` — symlink, not copy. Zero duplication, auto-sync.
**Lesson:** Prefer symlinks for shared config across directories. Copies drift immediately.

## CLAUDE.md 200-Line Limit (2026-02-25)
**Pattern:** MEMORY.md and CLAUDE.md are truncated after 200 lines in context.
**Solution:** Compress aggressively — merge sections, inline code blocks, remove empty lines. Use progressive disclosure (Level 2 in references/).
**Lesson:** Budget lines carefully. Every line in CLAUDE.md costs context. Move details to references/.

## Disk Full Kills Git Operations on NTFS/WSL (2026-02-25)
**Pattern:** `git add` fails with "unable to write loose object file: Input/output error" — disk at 100%.
**Solution:** Free space first. npm cache (782MB), node_modules, .tmp screenshots. Then retry git ops.
**Lesson:** Check `df -h /mnt/c/` before large git operations on WSL. NTFS I/O errors are misleading — often just disk full.

---

## Tauri ICO Files Must Be Proper Format (2026-02-24)
**Pattern:** Renaming PNG to `.ico` works on Linux Tauri build but fails on Windows with `error RC2175: resource file not in 3.00 format` or `Unsupported PNG bit depth: One`.
**Solution:** Use Pillow (`PIL`) to generate proper ICO with RGBA 32-bit depth: `img.convert('RGBA').save('icon.ico', format='ICO', sizes=[...])`. ImageMagick `convert` produces 1-bit colormap PNGs inside ICO.
**Lesson:** Always validate icon format with `file` command. Tauri Windows expects standard ICO with 8-bit/color RGBA PNGs inside.

## Tauri Requires HashRouter, Not BrowserRouter (2026-02-24)
**Pattern:** Desktop app shows blank white window. No errors, no console output.
**Solution:** `BrowserRouter` → `HashRouter` in React app. Tauri serves files via `tauri://` protocol, not HTTP — no server to handle client-side routing fallback.
**Lesson:** All Tauri/Electron/Capacitor apps must use `HashRouter` (or `MemoryRouter`). `BrowserRouter` only works with HTTP servers.

## GitHub Actions Release Upload Needs permissions: contents: write (2026-02-24)
**Pattern:** `softprops/action-gh-release@v2` fails with "Resource not accessible by integration" even though release exists.
**Solution:** Add `permissions: contents: write` at workflow level.
**Lesson:** Default `GITHUB_TOKEN` in Actions has read-only contents permission. Release upload = write.

## Windows Release Builds Hide Crashes (2026-02-24)
**Pattern:** `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` in Rust hides console in release mode. App crashes produce no visible output — no stderr, no dialog, nothing.
**Solution:** Add `std::panic::set_hook` + file-based crash log at the very start of `main()`, BEFORE any initialization. Write to `~/.exoskull/crash.log`.
**Lesson:** Windows GUI subsystem apps need explicit crash logging. Always add panic hook that writes to file in release mode.

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
