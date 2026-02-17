# Session Log

## [2026-02-18] Full Audit Roadmap Execution (P0 → P2)

### Tasks

- P2 Mind Map Persistence (5 PATCH routes + hook + MindMap3D callbacks): **SUCCESS**
- P0 F3.1 VPS Circuit Breaker (3-state: closed/open/half_open): **SUCCESS**
- P0 F3.5 Thread Race Fix (upsert ON CONFLICT): **SUCCESS**
- P0 F3.2 Voice Auth (verified already migrated): **SUCCESS** (no-op)
- P0 F3.3 Guardian Re-check (verified already in executor.ts): **SUCCESS** (no-op)
- P1 Unified-thread Auth Migration (getUser → verifyTenantAuth): **SUCCESS**
- P1 Voice Recording Guard (disabled prop + isSpeaking): **SUCCESS**
- P1 Data Freshness (30min polling + lastRefreshed + DataFreshness component): **SUCCESS**
- P2 N+1 Notes Fix (batch GROUP BY instead of per-entity COUNT): **SUCCESS**
- P2 Action Whitelist (ALLOWED_ACTION_TYPES set, 14 valid types): **SUCCESS**
- P2 Frontend Mutation Retry (fetchWithRetry utility, applied to useOrbData): **SUCCESS**
- TypeScript: 0 errors throughout
- Tests: 134/134 pass throughout

### Commits

| Commit                | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `ebff047`             | feat: mind map persistence (11 files, +238 lines)      |
| `3e6bc7f`             | fix: VPS circuit breaker + thread race fix             |
| `6fcf8e2`             | feat: unified-thread auth, voice guard, data freshness |
| `941c070`             | feat: N+1 fix, action whitelist, mutation retry        |
| + 4 CHANGELOG commits | docs updates per sprint                                |

### Key Decisions

- VPS circuit breaker: fail-open (if check errors, allow request through), 3 failures → open, 30s cooldown
- Thread upsert: ignoreDuplicates + fallback select (handles Supabase PostgREST edge case)
- Guardian re-check: fail-open (guardian error → proceed with execution)
- Action whitelist: reject + mark failed + remove from queue (not just ignore)
- fetchWithRetry: 2 retries, linear backoff (1s, 2s), only on 500/502/503/504
- DataFreshness component created but not yet wired into dashboard panels (available for future use)

### Parallel Agent Execution

- Sprint P0: 4 agents parallel (circuit breaker, voice auth, guardian, thread race)
- Sprint P1: 3 agents parallel (unified-thread, voice guard, data freshness)
- Sprint P2: 3 agents parallel (N+1 fix, action whitelist, mutation retry)

---

## [2026-02-17] Claude Code Merge into Main Dashboard Chat

### Tasks

- Always-on CODING_CONFIG for web chat: **SUCCESS**
- Coding workspace prompt in system message: **SUCCESS**
- `__SSE__` file_change directives in code_write_file/code_edit_file: **SUCCESS**
- file_change handler in UnifiedStream → Zustand store: **SUCCESS**
- CodeSidebar component (file browser + code panel): **SUCCESS**
- Zustand store extension (codeSidebarOpen, lastChangedFile, actions): **SUCCESS**
- CyberpunkDashboard integration (both view modes): **SUCCESS**
- Tool activity badge in HomeChat: **SUCCESS**
- TypeScript build: **SUCCESS** (0 errors)
- E2E test — code_read_file via SSE: **SUCCESS** (44 events, 23.6s)
- E2E test — code_write_file + file_change event: **SUCCESS** (13.8s)
- Puppeteer screenshot — mindmap view: **SUCCESS**
- Puppeteer screenshot — classic view with WebGL: **SUCCESS** (2 retries — SwiftShader flags)
- Button position fix (hidden behind ChannelOrbs): **SUCCESS**
- Vercel production deploy: **SUCCESS** (commits `8c9ef7c`, `73353a9`)

### Retries

- Headless Chrome WebGL: 2 retries — 3D scene stuck on "Ładowanie..." → fixed with `--enable-webgl --use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
- Button visibility: 1 retry — `top-14 right-4 z-40` hidden behind ChannelOrbs (`top:44px right:16px z-12`) → moved to `top-4 right-44 z-50`
- CDN propagation: 1 retry — screenshot showed old position → re-verified after propagation

### Commits

- `8c9ef7c` — feat: merge Claude Code into main dashboard chat (7 files)
- `73353a9` — fix: move code sidebar toggle to visible top-row position

### Key Decisions

- Zustand store over prop drilling: file_change events flow via `useCockpitStore` (UnifiedStream → CodeSidebar) instead of prop chains through CockpitHUDShell
- Adapted plan: UnifiedStream handles file_change events (not CockpitHUDShell as originally planned) because CenterViewport uses UnifiedStream for chat
- Reused existing claude-code components: WorkspaceFileBrowser + CodePanel — zero new API routes needed
- Always CODING_CONFIG: removed isCodingIntent regex — all web messages get 25 turns / 120s (was 10/55s)

### Issues Found & Fixed

- Plan said CockpitHUDShell at `components/dashboard/` — actually at `components/cockpit/`
- Plan said modify CockpitHUDShell for file events — actual data flow is UnifiedStream → Zustand → CodeSidebar
- Bearer token auth rejected by production middleware for /api/chat/stream — used local dev server with cookie auth for testing
- Code sidebar button overlapped by ChannelOrbs in Classic view — repositioned

---

## [2026-02-17] 3D Mind Map Workspace Implementation

### Tasks

- MindMap3D force-directed 3D graph: **SUCCESS**
- WorkspaceLayout three-panel layout: **SUCCESS**
- SourcesPanel with correct API mapping: **SUCCESS** (2 retries — fixed `data.items` → `data.documents`)
- StudioPanel AI summary via SSE: **SUCCESS**
- NodeContextMenu + NodeDetailPanel: **SUCCESS**
- ModelPicker (Sketchfab + upload + URL): **SUCCESS**
- RichContentCard + SearchResults: **SUCCESS**
- ArwesProvider wired into layout: **SUCCESS**
- Node renderers (Orb, Image, Model3D, Card): **SUCCESS**
- graph-converter + useMindMapStore: **SUCCESS**
- View mode toggle (classic <-> mindmap): **SUCCESS**
- Build verification: **SUCCESS** (0 errors)
- Puppeteer dashboard test: **SUCCESS** (all panels visible, 3D renders)
- Vercel production deploy: **SUCCESS** (commit `9629097`)

### Commits

`9629097` — feat: 3D Mind Map Workspace (30 files, +3915 lines)

### Key Decisions

- Default view: `"mindmap"` (classic cockpit as secondary)
- Floating chat: UnifiedStream embedded in bottom of WorkspaceLayout (not separate overlay)
- SourcesPanel maps to `exo_user_documents` columns directly (original_name, file_type, summary, status)
- StudioPanel streams AI summary via `/api/chat/stream` SSE with local fallback on error
- Node renderers use THREE.js directly (not R3F) for react-force-graph-3d compatibility
- ModelRenderer uses LRU cache (max 50 GLTFs) with dispose on eviction
- ArwesProvider is CSS-only wrapper (full Arwes framework not stable for React 18)

### Issues Found & Fixed

- SourcesPanel used `data.items || data.sources` — API returns `data.documents` → fixed
- ArwesProvider created but not wired into layout.tsx → fixed
- StudioPanel summary was stub text → connected to real `/api/chat/stream` API
- Chat missing from workspace view → added UnifiedStream as floating resizable panel

---

## [2026-02-17] Cockpit Redesign + UX Audit + Memory Unification + Agent Fixes

### Tasks

- VPS Code API (8 IORS tools + sandbox): **SUCCESS**
- Agent upload → R2 presigned URLs: **SUCCESS**
- Agent SDK → Direct Anthropic API: **SUCCESS**
- Sign-out button: **SUCCESS**
- Conversation history in agent: **SUCCESS**
- Unified memory search (4 sources): **SUCCESS**
- P0+P1 UX audit (landing PL, login tabs, pricing, reset): **SUCCESS**
- Cockpit HUD redesign (BottomPanelGrid, ActionBar, Reactions): **SUCCESS**
- MCP bridge tools (512 lines): **SUCCESS**

### Commits

`63d4e81` → `3a5de59` → `2ae668c` → `1fe3ae8` → `8d2907b` → `93036b7` → `87a2b9f` → `982a3e1` → `20a7fb8`

### Key Decisions

- Agent SDK `query()` broken on Vercel (spawns subprocess) → direct Anthropic Messages API
- R2 over Supabase Storage: no size limit, presigned URLs
- Unified memory: single entry point with score normalization > 4 separate searches
- Cockpit: full-viewport 3D + bottom panels > wings/drawer

---

## [2026-02-16] Orb CRUD + Brighter Dashboard + Delete Fix

### Tasks

- Fix white dashboard (`:root` CSS race condition): **SUCCESS**
- Brighten dashboard (CSS + 3D + HUD — 8 files, 25 edits): **SUCCESS**
- Add missions + challenges API routes: **SUCCESS**
- Add useOrbData mutations (addNode/removeNode/updateNode): **SUCCESS**
- Add OrbFormDialog + OrbDeleteConfirm: **SUCCESS**
- Add 3D context menu (OrbContextMenu + OrbContextMenuOverlay): **SUCCESS**
- Add "+" button to LeftWing: **SUCCESS** (later removed per user request)
- Remove "Wartości" header from LeftWing: **SUCCESS**
- Fix DELETE/PATCH broken for values/loops/quests/ops (ID field mismatch): **SUCCESS**
- Fix ops DELETE auth (verifyTenantAuth): **SUCCESS**
- Deploy to production: **SUCCESS**

### Retries

- Dev server port conflicts: 3 retries (killed 4 orphan servers, switched ports)
- Dev server hanging: 1 retry (cleared .next cache)

### Commits

- `85469df` — feat: brighter dashboard + orb CRUD
- `16d89d1` — fix: remove 'Wartości' section header from LeftWing
- `61c7bb2` — fix: orb delete/update — correct ID field names per API route

### Execution Method

- Wave 1: 3 parallel agents (CSS brightness, API routes, useOrbData mutations)
- Wave 2: 3 parallel agents (OrbFormDialog, context menu, LeftWing button)
- Wave 3: manual fixes (delete bug, LeftWing cleanup)
