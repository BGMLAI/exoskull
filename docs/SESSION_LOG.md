# ExoSkull Session Log

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
