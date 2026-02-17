# Changelog — ExoSkull Local Agent

## [0.2.0] — 2026-02-17

### Changed
- **Upload backend**: Supabase Storage → R2 presigned URLs (3-step flow: `get-url` → PUT → `confirm`)
- **MIME types**: whitelist (19 types) → blacklist approach (~130 supported MIME types)
- **Scanner/Watcher**: skip 17 junk directories (`.tox`, `.turbo`, `$RECYCLE.BIN`, `__MACOSX` etc.)

### Server-side (exoskull-app)
- `app/api/agent/upload/route.ts` — R2 presigned URL endpoint
- `lib/storage/r2-client.ts` — `generateDocumentPath()`, `getPresignedPutUrl()`, `headObject()`
- `lib/knowledge/document-processor.ts` — `r2://` path support + Supabase fallback

## [0.1.0] — 2026-02-15

### Added
- CLI (`exo-agent`) with commands: `login`, `logout`, `start`, `stop`, `sync`, `status`, `add`, `remove`
- Chokidar file watcher with 2s debounce and `awaitWriteFinish`
- SHA-256 file dedup (skip already-synced hashes)
- Exponential backoff retry (3 attempts per step)
- JSON state store (`~/.exoskull/state.json`) — no native deps
- YAML config (`~/.exoskull/config.yaml`) with folder management
- Daemon mode with PID file management
- Structured logger (console + file)
- Concurrent upload queue (default 3 workers)
- Glob-based include/exclude filters per folder
