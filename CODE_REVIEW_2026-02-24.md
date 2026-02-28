# Code Review Report — ExoSkull

**Date:** 2026-02-24
**Scope:** Full codebase (`exoskull-app`, `exoskull-desktop`, `vps-executor`, `infrastructure`)
**Branch:** `main` @ `1861a9f`
**Files analyzed:** 1,962 | **Quality score:** 86.8/100 (Grade B) | **Code smells:** 11,300

---

## Verdict: BLOCK — 11 CRITICAL + 15 HIGH issues

The codebase has **critical security vulnerabilities** that must be resolved before any further deployment. The most urgent: production secrets are exposed in a non-gitignored file, and the VPS executor has multiple command injection and privilege escalation vectors.

---

## CRITICAL Issues (11)

### C1. Production Secrets in Plaintext — `.env.local.backup` NOT Gitignored
**Files:** `exoskull-app/.env.local.backup`
**Impact:** ALL production API keys exposed (Anthropic, OpenAI, Stripe LIVE, Supabase service role, Twilio, Telegram, Discord, Slack, R2, email encryption key, VPS executor secret, and more)
**Root cause:** `.gitignore` covers `.env*.local` but `.env.local.backup` doesn't match that glob
**Fix:** Delete the file, add `.env.local.backup` to `.gitignore`, **rotate ALL credentials immediately**, check `git log --all -- "**/.env*"` for prior commits

### C2. Shell Command Injection in VPS Executor
**File:** `vps-executor/src/services/code-executor.ts:216-217`
**Impact:** User-supplied `pattern` in grep/glob is interpolated into shell commands with inadequate escaping. `maxResults` is also unvalidated.
**Fix:** Use `execFile()` with argument arrays instead of shell interpolation

### C3. Client-Controlled `isAdmin` Flag → Privilege Escalation
**Files:** `vps-executor/src/routes/agent-code.ts:26,65,89,97,113,123,143,152` + `exoskull-app/app/api/chat/stream/route.ts:183`
**Impact:** Any caller with the shared VPS secret can send `isAdmin: true` to access the full production codebase. The Next.js app hardcodes `isAdmin: true` for all authenticated users.
**Fix:** Maintain server-side admin tenant list; never trust client-supplied `isAdmin`

### C4. Path Traversal via `tenantId`
**File:** `vps-executor/src/services/agent-executor.ts:91-96`
**Impact:** `tenantId: "../exoskull"` resolves to admin workspace; `"../../etc"` escapes entirely
**Fix:** Validate `tenantId` as UUID format before path construction

### C5. Hardcoded VPS IP with HTTP Fallback
**Files:** `exoskull-app/app/api/claude-code/chat/route.ts:18`, `workspace/route.ts:18`
**Impact:** Internal VPS IP disclosed in source; HTTP fallback sends bearer tokens in plaintext
**Fix:** Remove fallback, fail fast if env var missing

### C6. Unvalidated `sortBy` Parameter in Admin Users API
**File:** `exoskull-app/app/api/admin/users/route.ts:15,40`
**Impact:** User-supplied column name passed directly to Supabase `.order()` — schema probing risk
**Fix:** Add column allowlist

### C7. Hardcoded Supabase Credentials in Desktop Binary
**File:** `exoskull-desktop/src-tauri/src/api.rs:6-7`
**Impact:** Anon key + project URL baked into compiled binary; rotation requires full release
**Fix:** Use `env!()` macro for build-time injection

### C8. Token Refresh Race Condition (Desktop)
**File:** `exoskull-desktop/src-tauri/src/commands.rs:107-148`
**Impact:** Concurrent commands can race on single-use refresh tokens, invalidating each other and forcing re-login
**Fix:** Protect `get_valid_token` with `tokio::sync::Mutex` in `AppState`

### C9. Stateless Engine Pattern — Mismatched State
**File:** `exoskull-desktop/src-tauri/src/commands.rs:319-344, 430-444`
**Impact:** `start_recall` and `stop_recall` create fresh engine instances; `DictationEngine` start/stop use different instances with potentially different `sample_rate`
**Fix:** Store engine instances in `AppState` behind a `Mutex`

### C10. VM Sandbox Escape via Prototype Chain
**File:** `exoskull-app/lib/skills/sandbox/restricted-function.ts:133-219`
**Impact:** Host Node.js constructors injected into VM context enable prototype chain traversal to `Function` constructor
**Fix:** Use `isolated-vm` or `quickjs-emscripten` instead of `vm.createContext` with shared builtins

### C11. Service Role Key Used in Skill Sandbox
**File:** `exoskull-app/lib/skills/sandbox/supabase-proxy.ts:65-68`
**Impact:** Dynamically generated skill code runs with a Supabase client that bypasses all RLS policies
**Fix:** Use anon key with impersonated user session so RLS enforces isolation

---

## HIGH Issues (15)

| # | File | Issue |
|---|------|-------|
| H1 | `vps-executor/src/server.ts:23` | Fallback secret `"dev-secret-change-me"` if env var missing |
| H2 | `.env.local:147` | VPS executor over plain HTTP — bearer token in transit unencrypted |
| H3 | `api/rigs/[slug]/callback/route.ts:74-89` | OAuth state fails open under duplicate row condition |
| H4 | `api/internal/knowledge-search/route.ts:17` | Secret comparison not timing-safe (multiple files) |
| H5 | `lib/code-generation/vps-executor.ts:71-75` | Module-level circuit breaker resets per serverless invocation |
| H6 | `lib/security/ssrf-guard.ts:48-100` | SSRF guard doesn't resolve DNS — bypassed by DNS rebinding |
| H7 | `recall/indexer.rs:76-98` | Unescaped LIKE wildcards in user-controlled filter |
| H8 | `lib.rs:20` | `.unwrap()` on `Path::parent()` — panics before panic hook installed |
| H9 | `commands.rs:451` | Empty-string token silently passed to paid TTS API |
| H10 | `assistant/tts.rs:88-95` | PowerShell command injection via unescaped `text` in system TTS |
| H11 | `commands.rs:499-509` | `add_watched_folder` accepts any path — can watch `C:\` or `/` |
| H12 | `commands.rs:293-305` | `upload_file` reads arbitrary paths, bypasses Tauri FS scope |
| H13 | `commands.rs:349`, `capture.rs:85-87` | `stop_recall` returns before task stops — double-start possible |
| H14 | `vps-executor/src/server.ts:57,204` | In-memory job store unbounded growth + ID overwrite |
| H15 | `infrastructure/vps-setup.sh:139` | `curl | bash` without checksum verification |

---

## Code Quality Summary (Automated Scanner)

| Metric | Value |
|--------|-------|
| Files analyzed | 1,962 |
| Average quality score | 86.8 / 100 |
| Overall grade | **B** |
| Total code smells | 11,300 |
| SOLID violations | 37 |

### Worst Files (by quality score)

| Score | File | Primary Issues |
|-------|------|----------------|
| 0 (F) | `exoskull-app/scripts/test-all-routes.ts` | 604-line function, complexity 30 |

The majority of code smells are `magic_number` (low severity) and `long_function` (medium). The structural quality is acceptable for a rapidly-developed product, but the security issues above override any quality grade.

---

## Priority Action Plan

### Immediate (Today)
1. **Delete `.env.local.backup`** and add to `.gitignore`
2. **Rotate ALL credentials** in that file (Anthropic, OpenAI, Stripe, Supabase, Twilio, Telegram, Discord, Slack, R2, email encryption key, VPS secret)
3. **Check git history** for prior commits of secret files
4. Fix VPS executor command injection (`C2`)
5. Fix `isAdmin` privilege escalation (`C3`)
6. Fix `tenantId` path traversal (`C4`)

### This Week
7. Remove hardcoded VPS IP (`C5`)
8. Add `sortBy` allowlist (`C6`)
9. Move Supabase key out of desktop binary (`C7`)
10. Fix token refresh race condition (`C8`)
11. Fix sandbox escape vectors (`C10`, `C11`)
12. Fix PowerShell command injection in TTS (`H10`)
13. Add TLS to VPS executor (`H2`)
14. Make VPS secret required, remove fallback (`H1`)

### Next Sprint
15. Fix all remaining HIGH issues (H3-H15)
16. Address code quality findings (long functions, complexity)

---

*Generated by ExoSkull Code Reviewer — 3 parallel review agents*
