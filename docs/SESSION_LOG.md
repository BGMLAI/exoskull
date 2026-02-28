# ExoSkull Session Log

## 2026-02-28 — Fix: Agent Amnesia & Apologetic Behavior

**Status:** SUCCESS
**Duration:** ~10 min
**Retries:** 0

### Tasks
1. Diagnose agent "forgetting" and apologizing behavior: SUCCESS
2. Remove memory disclaimer injection from system prompt: SUCCESS
3. Fix error handler — remove "Przepraszam" hardcoded text: SUCCESS
4. Increase Gemini fallback system prompt from 8K to 64K chars: SUCCESS
5. Upgrade knowledge pre-fetch failure logging to WARN: SUCCESS

### Root Cause Analysis
Agent had 4 compounding issues:
- Empty memory search → disclaimer in system prompt → agent parroted "nie pamiętam"
- Error handler text violated own "NIGDY nie przepraszaj" rule
- Gemini fallback received only 8K of system prompt → lost personality entirely
- Knowledge search failures invisible (DEBUG level)

### Learnings
- System prompt injections (like memory disclaimers) are parroted by the model as its own conclusions
- Error fallback text must follow the same personality rules as the main system prompt
- Gemini 2.5 Flash supports 1M context — no reason to limit system prompt to 8K

---

## 2026-02-28 — Strategy→Task Pipeline Fix + DeepSeek V3

**Status:** SUCCESS
**Duration:** ~60 min
**Retries:** 2 (git push rejected → rebase, Vercel CLI crash → discovered Git Integration auto-deploy)

### Tasks
1. Health analysis of autonomy pipeline: SUCCESS
2. Fix `isStrategyStuck()` (broken table query): SUCCESS
3. Auto-activate strategies (confidence ≥ 0.7): SUCCESS
4. Add `goal_id` to task context (4 places): SUCCESS
5. Create 3 IORS goal-strategy tools: SUCCESS
6. Register tools in IORS index: SUCCESS
7. Commit + push strategy pipeline fix: SUCCESS
8. Add DeepSeek V3 provider (OpenAI-compatible): SUCCESS
9. Update types, config, model-router for DeepSeek: SUCCESS
10. Commit + push DeepSeek changes: SUCCESS
11. Deploy to production (Git Integration auto-deploy): SUCCESS
12. Update Vercel spending limit: SUCCESS (user action)

### Commits
- `d0b1b52` — feat: wire strategy→task execution pipeline — auto-activate goals
- `d8542ac` — feat: add DeepSeek V3 as primary Tier 1+2 model, replacing Gemini

### Decisions
- Auto-activate at confidence ≥ 0.7 (not 0.5) — avoids activating low-quality strategies
- DeepSeek over Kimi — cheaper ($0.27 vs $0.60/1M input), OpenAI-compatible, better coding benchmarks
- Gemini kept as fallback in tier arrays (not removed)

---

## 2026-02-24 — ExoSkull Desktop v0.1.0 + Download Page + CI

**Status:** PARTIAL (builds pass, Windows app not launching — debugging)
**Duration:** ~90 min
**Retries:** 3 (ICO format, release permissions, HashRouter fix)

### Tasks
1. Deploy /download page to Vercel: SUCCESS
2. Build Linux binaries (deb, rpm, AppImage): SUCCESS
3. Create GitHub Release v0.1.0: SUCCESS
4. Fix download URLs (exoskull-ai → BGMLAI): SUCCESS
5. GitHub Actions CI for Windows + macOS: SUCCESS (3 attempts)
   - Attempt 1: icon.ico was PNG renamed → RC2175 error
   - Attempt 2: ICO had 1-bit PNG depth → proc macro panic
   - Attempt 3: Pillow-generated RGBA 32-bit ICO → PASS
6. macOS universal build (.dmg): SUCCESS
7. Windows build (.exe + .msi): SUCCESS
8. Release permissions fix (contents: write): SUCCESS
9. App launch fix (HashRouter + visible window + file logging): IN PROGRESS
10. Crash handler (panic hook → crash.log): IN PROGRESS

### Release Assets (v0.1.0)
- `ExoSkull_0.1.0_x64-setup.exe` — Windows NSIS (5.4 MB)
- `ExoSkull_0.1.0_x64_en-US.msi` — Windows MSI (8 MB)
- `ExoSkull_0.1.0_universal.dmg` — macOS Universal (16.6 MB)
- `ExoSkull_0.1.0_amd64.AppImage` — Linux (10.9 MB)
- `ExoSkull_0.1.0_amd64.deb` — Debian/Ubuntu (11.3 MB)
- `ExoSkull-0.1.0-1.x86_64.rpm` — Fedora/RHEL (11.3 MB)

### Known Issues
- Windows: app installs but doesn't show window (crash.log build pending)
- SmartScreen warning: no code signing certificate (EV cert needed ~300$/yr)

---

## 2026-02-24 — P1 Event Dedup + VPS Knowledge Access

**Status:** SUCCESS
**Duration:** ~15 min
**Retries:** 1 (TS type fix in knowledge-documents route + VPS executor json typing)

### Tasks
1. P1 Event Dedup SQL Migration: SUCCESS
2. Knowledge Pre-fetch (Phase 1): SUCCESS
3. Internal Knowledge API Endpoints (Phase 2a): SUCCESS
4. VPS Agent Knowledge Tools (Phase 2b): SUCCESS
5. Middleware Bypass Update: SUCCESS
6. Documentation: SUCCESS

### Build Verification
- `exoskull-app`: `tsc --noEmit` PASS
- `vps-executor`: `tsc --noEmit` PASS

### Deploy Steps Remaining
1. Apply migration: `supabase db push` (or apply via dashboard)
2. Deploy Vercel: `cd /root/exoskull && vercel --prod`
3. Rebuild VPS Docker: `cd /root/exoskull/vps-executor && docker compose up -d --build`
