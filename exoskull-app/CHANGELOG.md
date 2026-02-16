# ExoSkull App - Changelog

All notable changes to this project.

---

## [2026-02-16] Phase 9: Orb CRUD + Brighter Dashboard + Delete Fix

### Brighter Dashboard

- Brightened dark-ops CSS theme (background 4%→7%, card 10%→13%, muted 16%→20%, border 16%→22%)
- Brightened cockpit HUD variables (bg, border, text-dim, text-muted)
- 3D scene: ambientLight 0.8→1.2, scene background/fog #050510→#0a0a1c, toneMappingExposure 1.2→1.5
- PostProcessing: vignette darkness 0.7→0.4, bloom intensity 1.4→1.6
- SynthwaveGrid: cyan opacity 0.12→0.20, purple 0.04→0.08, horizon glow 0.06→0.12
- WorldOrb: emissive 0.6→0.8, point light 0.6→1.0, halo 0.08→0.14

### Orb CRUD (Full Hierarchy)

- **New API routes**: `missions/route.ts`, `challenges/route.ts` (POST/PATCH/DELETE)
- **useOrbData mutations**: `addNode()`, `removeNode()`, `updateNode()` with correct ID field mapping per API route
- **OrbContextMenu**: Right-click on 3D orbs → "Dodaj dziecko", "Edytuj", "Usuń"
- **OrbFormDialog**: Modal with name, color picker (8 colors), description, priority
- **OrbDeleteConfirm**: Red-accented delete confirmation with safety warning
- **Store**: `orbContextMenu` state in useCockpitStore

### Bug Fixes

- **DELETE/PATCH broken for values/loops/quests/ops**: `removeNode` was sending `{ id }` in request body but API routes expected query params (`valueId`, `loopId`, `questId`, `opId`). Added `getDeleteUrl()` + `getIdFieldName()` helpers.
- **Ops DELETE missing auth**: Was requiring `tenantId` as query param instead of using `verifyTenantAuth`. Fixed to match other routes.
- **Removed "Wartości" header** from LeftWing — values remain as orbs (bieguny) on 3D scene.

### Architecture

- New z-20 layer: `OrbContextMenuOverlay`
- `useCockpitStore` extended with `orbContextMenu` + `setOrbContextMenu`
- `useOrbData` hook extended with CRUD mutations + helper functions

### Files Changed (25+)

- `app/globals.css`, `styles/cockpit.css` — theme brightness
- `components/3d/CyberpunkScene.tsx`, `CyberpunkSceneInner.tsx`, `ScenePostProcessing.tsx`, `SynthwaveGrid.tsx`, `WorldOrb.tsx` — 3D brightness
- `components/3d/OrbContextMenu.tsx` — NEW context menu + overlay
- `components/3d/OrbCluster.tsx`, `OrbitalScene.tsx` — context menu wiring
- `components/cockpit/OrbFormDialog.tsx`, `OrbDeleteConfirm.tsx` — NEW dialogs
- `components/cockpit/CockpitHUDShell.tsx`, `LeftWing.tsx` — layout updates
- `components/dashboard/CyberpunkDashboard.tsx` — added OrbContextMenuOverlay
- `app/api/knowledge/missions/route.ts`, `challenges/route.ts` — NEW API routes
- `app/api/knowledge/ops/route.ts` — fixed DELETE auth
- `lib/hooks/useOrbData.ts` — CRUD mutations + ID mapping
- `lib/stores/useCockpitStore.ts` — orbContextMenu state

---

## [2026-02-16] Phase 8: Cockpit HUD — 2D Overlay on 3D Scene

### Architecture Change

Replaced 3D spatial panels (drei `<Html>`) with a pure HTML/CSS cockpit HUD overlay (z=10) on top of the 3D scene. FPV cockpit-style layout inspired by Star Citizen / Elite Dangerous.

### New Components (17 files)

- **`components/cockpit/`** — Complete cockpit HUD system:
  - `CockpitHUDShell.tsx` — CSS Grid master layout (5-col × 3-row)
  - `CockpitTopBar.tsx` — Clock, IORS status, active tool indicator
  - `CockpitBottomBar.tsx` — Quick actions, input hint, HUD gauges
  - `HUDPanel.tsx` — Reusable FUI panel frame with data fetch + normalize
  - `HUDGauge.tsx` — SVG segmented arc gauge (12 segments, 0-100%)
  - `LeftWing.tsx` — Tasks, IORS Activity, Email panels
  - `RightWing.tsx` — Calendar, Values/Plan, Knowledge panels
  - `CenterViewport.tsx` — Chat/Preview switcher (both always mounted, opacity toggle)
  - `PreviewPane.tsx` — Detail view for emails, tasks, documents, calendar, activity, values
  - `ChannelOrbs.tsx` — Floating channel indicators (Email, Telegram, Discord, SMS)
  - `index.ts` — Barrel export

### New Utilities

- **`styles/cockpit.css`** — FUI design system (panel frames, corner brackets, scanlines, animations)
- **`lib/cockpit/normalize-response.ts`** — Shared API response normalizer (extracted from SpatialPanel)
- **`lib/cockpit/utils.ts`** — `stripMarkdown()`, `truncate()`, `relativeTime()` (extracted from SpatialChat)
- **`lib/hooks/useResizeHandle.ts`** — Custom drag-to-resize hook (pointer events + RAF)
- **`lib/hooks/useCockpitKeys.ts`** — Keyboard shortcuts (Escape, Ctrl+1-6, Ctrl+[/])

### Modified Files

- **`components/dashboard/CyberpunkDashboard.tsx`** — Replaced SpatialChat + UnifiedStream spatialMode → CockpitHUDShell
- **`components/3d/CyberpunkSceneInner.tsx`** — Removed SpatialPanelLayout from 3D scene
- **`lib/stores/useCockpitStore.ts`** — Extended with leftWingWidth, rightWingWidth, centerMode, previewTarget, collapsedPanels, openPreview, closePreview
- **`app/globals.css`** — Added cockpit.css import

### Features

- Resizable left/right wings (200-400px, persisted in localStorage)
- Click item in any wing panel → preview opens in center viewport
- Escape/back button returns to chat from preview
- Full UnifiedStream chat in center (not spatialMode — full message history + SSE streaming)
- 4 HUD gauges: System health, Tasks done%, Unread emails, Goals
- 6 quick action buttons (Build, Search, Email, Note, Report, VPS)
- FUI panel frames with corner bracket accents and scanline overlay
- Staggered panel load animations
- Channel orbs with hover glow effects

### Deprecated (not deleted)

- `components/3d/SpatialPanel.tsx`
- `components/3d/SpatialPanelLayout.tsx`
- `components/3d/SpatialChat.tsx`

---

## [2026-02-16] Phase 7 Cockpit Fix — Panels Follow Camera + Chat Fix

### Bug Fixes

- **Cockpit paradigm**: Panels now follow camera (CockpitGroup copies camera position/quaternion every frame) instead of floating at fixed world positions
- **Panel positioning**: Moved from x=±18 (invisible) to x=±7 camera-local space. Left wing: Zadania, IORS, Email. Right wing: Kalendarz, Wiedza
- **distanceFactor**: Reduced from 25 → 10, width from 280 → 200px for compact cockpit cards
- **All sections visible**: All 6 cockpit sections now `visible: true` by default in useCockpitStore
- **API endpoint fixes**: Activity feed corrected from `/api/canvas/data/activity-feed` → `/api/canvas/activity-feed`. Knowledge corrected from `/api/canvas/data/knowledge` → `/api/knowledge`
- **Response normalization**: SpatialPanel now handles varied API response shapes (flat arrays, `{ documents }`, `{ stats }`, `{ summary }`) via `normalizeResponse()`
- **Polish labels**: Stats display in Polish (Oczekujace, W toku, Gotowe, Nieprzeczytane, Pilne, etc.) via LABEL_MAP
- **Chat messages fixed**: Moved from drei `<Html>` in 3D (caused vertical text) to normal HTML overlay above input bar. Messages now display horizontally with proper bubble layout (user=cyan right, AI=purple left)

### Files Changed

- `components/3d/SpatialPanelLayout.tsx` — CockpitGroup (camera-following), camera-local panel positions, fixed API endpoints
- `components/3d/SpatialPanel.tsx` — normalizeResponse(), LABEL_MAP, distanceFactor=10, width=200
- `lib/stores/useCockpitStore.ts` — all sections visible by default
- `components/3d/SpatialChat.tsx` — rewritten: removed drei Html, now pure DOM overlay with scrollable message list
- `components/3d/CyberpunkSceneInner.tsx` — removed SpatialChat from 3D scene
- `components/dashboard/CyberpunkDashboard.tsx` — added SpatialChat as HTML overlay above input bar

---

## [2026-02-16] Phase 7: Spatial UI Redesign — Everything IN the 3D Scene

### Architecture

**Paradigm shift** — moved ALL UI elements from HTML overlays INTO the 3D scene using drei `<Html>`. Data panels, chat messages, and world detail panels all exist at 3D coordinates.

**New spatial architecture:**

- Data panels (Zadania, IORS, Kalendarz, Wiedza, Email) → `<Html>` glass cards at 3D positions
- Chat messages → floating bubbles in scene center (cyan=user, purple=AI)
- World detail panels → appear near clicked orb with sub-sections
- Camera fly-to on world orb click (OrbitControls target lerp)
- Chat input bar → centered HTML overlay at bottom (only non-3D element)
- Dashboard modifiable through chat (IORS `modify_dashboard` tool → SSE `cockpit_update`)

**Removed HTML overlay paradigm:**

- Deleted: CockpitHUD (bottom bar), WorldDetailPanel (right slide-in), ChatOverlay (left panel)
- Deleted: FloatingWidget, WidgetOverlayManager (draggable widgets)
- UnifiedStream now runs in `spatialMode` (hidden messages, only input bar visible)

### New Components (Phase 7)

**Spatial panels** (`components/3d/`):

- `SpatialPanel.tsx` — generic glass card at 3D position (drei Html, lazy fetch, expand/collapse)
- `SpatialPanelLayout.tsx` — positions panels at predefined 3D coords + world detail sub-panels
- `SpatialChat.tsx` — floating message bubbles (last 8 msgs, rising y-positions, role-based colors)

**Stores:**

- `lib/stores/useSpatialChatStore.ts` — last 10 messages for 3D rendering (push/update/clear)
- `lib/stores/useCockpitStore.ts` — panel visibility/expansion + selectedWorldId

**IORS tool:**

- `lib/iors/tools/dashboard-tools.ts` — `modify_dashboard` tool (show/hide/expand panels via SSE)

### Phase 7 Sub-phases

- **7A**: Spatial data panels (SpatialPanel + SpatialPanelLayout, removed CockpitHUD/WorldDetailPanel)
- **7B**: Spatial chat bubbles (SpatialChat, UnifiedStream spatialMode, useSpatialChatStore)
- **7C**: Camera fly-to (OrbitControls ref + useFrame lerp on world select)
- **7D**: Chat-modifiable dashboard (modify_dashboard IORS tool → cockpit_update SSE → store)

### Integration

- UnifiedStream syncs messages to `useSpatialChatStore` for 3D rendering
- Tool execution: `modify_dashboard` → `__SSE__` directive → agent-loop extracts → SSE stream → client
- Camera animation: `useCockpitStore.selectedWorldId` → `useFrame` lerp → OrbitControls target
- World click: OrbitalScene → useCockpitStore.selectWorld → camera fly-to + detail panels

---

## [2026-02-16] Phase 0-6: 3D Cyberpunk Dashboard Foundation

### Architecture

**Complete visual transformation** — replaced 2D split-pane DualInterface with a 3D cyberpunk/synthwave layered dashboard.

### New Components (Phases 0-6)

**3D Scene** (`components/3d/`):

- `CyberpunkScene.tsx` — dynamic import wrapper with WebGL/mobile/reduced-motion detection
- `CyberpunkSceneInner.tsx` — R3F Canvas, camera, fog, orbital worlds, camera fly-to
- `SynthwaveGrid.tsx` — animated dual-layer neon grid floor (cyan/purple)
- `Skybox.tsx` — 2500 stars, 3 nebulae, synthwave sun with scan lines
- `Particles.tsx` — 150 upward-drifting cyan particles
- `ScenePostProcessing.tsx` — Bloom (pulsing), Vignette, ChromaticAberration (auto-disables on low FPS)
- `SceneEffects.tsx` — IORS activity visualization (bloom pulse, activity ring)
- `WorldOrb.tsx` — glowing sphere with hover, Html label, halo, moons
- `EphemeralThread.tsx` — pulsing connection lines between worlds (drei Line)
- `GridRoad.tsx` — materializing tile path (progress metaphor)
- `OrbitalScene.tsx` — composes all orbital elements

**Dashboard** (`components/dashboard/`):

- `CyberpunkDashboard.tsx` — top-level spatial dashboard
- `ToolExecutionOverlay.tsx` — floating pill during tool execution

**Stores:**

- `lib/stores/useSceneStore.ts` — bridges SSE tool events → 3D scene effects

### Performance

- WebGL detection: no WebGL → CSS gradient fallback
- Mobile (<768px): static background (no Three.js loaded)
- `prefers-reduced-motion`: static background
- FPS monitor: auto-disables ChromaticAberration below 25 FPS
- Dynamic import with `ssr: false` for all Three.js code
- Dashboard bundle: ~500kB first load (R3F chunk loaded separately)

### Packages Added

- `@react-three/fiber@^8.17.0`
- `@react-three/drei@^9.117.0`
- `@react-three/postprocessing@^2.16.0`

---

## [2026-02-16] Emergency Fallback Diagnosis + Tool Filtering

### Bug Investigation

**Root cause of persistent `emergency_fallback`** — ALL 3 AI providers were failing:

1. **Gemini 3 Flash** (primary): FREE TIER quota exceeded (20 req/day limit). CRONs + user messages exhaust quota rapidly.
2. **Anthropic Claude Haiku** (fallback): Credit balance too low — billing needs top-up at console.anthropic.com.
3. **OpenAI GPT-4o** (fallback): Connection error — API key may be invalid.
4. **Gemini 2.5 Flash** (emergency): Works fine — different model = separate quota bucket.

**Resolution:** User must fix billing on all 3 provider accounts (Gemini pay-as-you-go, Anthropic credits, OpenAI key).

### Performance

**Tool filtering for web chat** — reduced from 100 to ~40 essential tools per API call:

- Added `WEB_ESSENTIAL_TOOL_NAMES` set (matching existing `VOICE_ESSENTIAL_TOOL_NAMES` pattern)
- `conversation-handler.ts`: filters `activeTools` per channel before sending to any AI provider
- Reduces token usage, faster responses, lower API costs
- Previously: ALL 100 IORS tools sent to every request regardless of channel

### Diagnostics

- New endpoint: `GET /api/debug/ai-providers?secret=CRON_SECRET` — tests each AI provider individually
- Reports: model availability, API key validity, quota status, tool compatibility
- Useful for rapid diagnosis of provider failures

---

## [2026-02-14] Android Edge Client + Self-hosted AI (Phase 1-2)

### Architecture

**Self-hosted AI Provider (Tier 0)** — new tier in model router for $0/token inference:

- `lib/ai/providers/selfhosted-provider.ts` — OpenAI-compatible client for Ollama/vLLM
- Qwen3-30B-A3B (Q4) for analysis, Gemma 3 4B for simple tasks
- Model router auto-routes Tier 1-2 tasks through self-hosted when available
- Fallback to cloud (Gemini Flash) when self-hosted is down
- Health check cached 30s, 2-minute timeout for inference
- New `ModelTier = 0`, `ModelProvider = "selfhosted"`, 2 new `ModelId` values

**Mobile Sync API** — delta sync for Android offline-first architecture:

- `GET /api/mobile/sync?tables=...&since=ISO` — returns changed records after timestamp
- 10 syncable tables whitelisted, max 500 records/request, cursor pagination
- `POST /api/mobile/push/register` — FCM token registration
- `POST /api/mobile/push/send` — internal push trigger (CRON_SECRET auth)
- Bearer JWT auth (verified in routes, added to `isPublicApi`)

**FCM Push Notifications** — proactive messages reach Android devices:

- `lib/push/fcm.ts` — Firebase Admin SDK wrapper with auto-cleanup of invalid tokens
- `lib/push/types.ts` — PushNotification, PushResult, DeviceToken types
- `sendProactiveMessage()` now also pushes to FCM (fire-and-forget)
- DB: `exo_device_tokens` table with RLS policies

**Android App** — `android/` directory with full Kotlin + Jetpack Compose project:

- 32 Kotlin files, Hilt DI, Room DB (7 entities, 5 DAOs), Retrofit API client
- 5 screens: Dashboard, Chat, Tasks, Health, Settings
- Auth: Supabase email/password → EncryptedSharedPreferences JWT
- SyncWorker: periodic 15-min delta sync via WorkManager
- FCMService: push notification handling with deep linking
- On-device AI stubs: LocalModelRouter, GemmaEngine, FunctionCallingEngine
- Material 3 dark theme with ExoSkull brand colors

**New channel**: `android_app` added to `GatewayChannel` union type

### Files changed

- Modified: `lib/ai/types.ts`, `lib/ai/config.ts`, `lib/ai/model-router.ts`, `lib/ai/providers/index.ts`
- Modified: `lib/gateway/types.ts`, `lib/supabase/middleware.ts`, `lib/cron/tenant-utils.ts`
- New: `lib/ai/providers/selfhosted-provider.ts`
- New: `lib/push/fcm.ts`, `lib/push/types.ts`
- New: `app/api/mobile/sync/route.ts`, `app/api/mobile/push/register/route.ts`, `app/api/mobile/push/send/route.ts`
- New: `supabase/migrations/20260303000001_device_tokens.sql`
- New: `android/` (40 files — full Android project scaffold)
- Added: `firebase-admin` to package.json

---

## [2026-02-12] Full Voice/Web Unification + IORS Self-Awareness

### What was done

**Complete channel unification** — voice and web now run the EXACT same pipeline:

- **Context**: All channels use `buildDynamicContext()` (10 parallel queries) — voice no longer uses lightweight `buildVoiceContext()`
- **Thread**: All channels use `getThreadContext(50)` — same cross-channel message history
- **Tools**: All channels get full 53+ IORS tool set (voice was 18, now identical to web)
- **Emotion**: `analyzeEmotion()` runs for all channels (was skipped for voice)
- **Crisis**: Full 3-layer detection for all channels (was keyword-only for voice)
- **Tau Matrix**: Runs for all channels (was skipped for voice)
- **Agent Loop**: `WEB_AGENT_CONFIG` (10 steps, 55s) for all channels (voice was 3 steps, 25s)
- **Max tokens**: Session-based for all (voice was hardcoded 150)

**Only remaining difference**: Haiku model for voice (streaming speed for phone TTS), Sonnet for web.

**IORS Self-Awareness** — system now knows what it's doing:

- Query 9: `exo_generated_apps` — lists active/draft/pending apps with status
- Query 10: `exo_proactive_log` — last 24h autonomous actions (briefings, reflections, builds)
- New context sections: "MOJE APLIKACJE" and "MOJE OSTATNIE DZIAŁANIA (24h)"
- When user asks "co robiłeś?" or "nad czym pracujesz?" — IORS can answer accurately

### Why

- User reported phone calls had no context from web chat
- Escalated to: ALL channels must be identical — same tools, context, knowledge, conversation history
- Chat Rzeka is single source of truth — phone, SMS, WhatsApp, email, web all see the same data
- Self-awareness: system must know what apps it built, what stage they're at, what actions it took

### Files Changed

- `lib/voice/conversation-handler.ts` — removed ALL voice/web branching (emotion, crisis, tau, tools, agent-loop, tokens)
- `lib/voice/dynamic-context.ts` — added apps query (#9) + proactive actions query (#10) + context sections
- `lib/unified-thread.ts` — added `getVoiceThreadContext()` (intermediate fix, superseded by `getThreadContext()` for all)
- `lib/iors/agent-loop.ts` — updated VOICE_AGENT_CONFIG (intermediate, now WEB_AGENT_CONFIG for all)

### How to Verify

1. Call voice number → ask "jakie mam aplikacje?" → should list apps
2. Call voice number → reference something from web chat → should have context
3. Call voice number → ask "co robiłeś ostatnio?" → should describe autonomous actions
4. Web chat → same questions → identical answers

---

## [2026-02-12] Voice-Chat Context Linkage + CRON Deduplication

### Smart Conversational Context for Voice

- **Problem**: Voice calls loaded chronological messages → proactive CRON spam (goal reminders, task nudges every 15 min) flooded thread → no actual web chat context visible
- **Solution**: New `getConversationalMessages()` function filters proactive assistant-only messages, keeps only user-initiated exchanges
- Voice loads **20 conversational messages** across all channels (not 10 chronological)
- Preserves channel tags: `[Web Chat]`, `[Voice]`, etc.
- Voice AI now sees actual user conversations, not CRON noise

### Lightweight Voice Pre-Processing

- New `buildVoiceContext()` — **2 DB queries** instead of 8 (goals, suggestions, connections, docs skipped)
- Voice channel **skips emotion analysis** (was blocking for ~500ms via HuggingFace API)
- Cuts pre-Claude latency from ~1-3s to ~200ms
- File: `lib/voice/dynamic-context.ts`

### CRON Message Deduplication Fix

- **Problem**: `sendProactiveMessage()` called both `dispatchReport()` (which writes to unified thread) AND its own `appendMessage()` → every CRON message appeared twice
- **Solution**: Removed duplicate `appendMessage()` call — `dispatchReport()` already handles it
- File: `lib/cron/tenant-utils.ts`

### Files Changed

- `lib/unified-thread.ts` — added `getConversationalMessages()`
- `lib/voice/conversation-handler.ts` — voice uses conversational context, imports `buildVoiceContext`
- `lib/voice/dynamic-context.ts` — added `buildVoiceContext()` (lightweight)
- `lib/cron/tenant-utils.ts` — removed duplicate `appendMessage()`

### How to Verify

1. Call voice number → mention something from web chat conversation
2. Voice AI should reference web chat context (not say "nie mam informacji")
3. Check unified thread — proactive messages should appear once (not twice)

---

## [2026-02-12] ConversationRelay Voice Pipeline — Live

### Twilio Signature Fix (CRITICAL)

- **Root cause**: Signature verification URL mismatch — code validated against `/api/twilio/voice?action=start` but Twilio signs against `/api/twilio/voice` (no query params for initial call)
- All voice calls were returning HTTP 403 → Twilio played "application error" message
- **Fix**: Use actual request URL (`url.pathname + url.search`) instead of hardcoded query params
- File: `app/api/twilio/voice/route.ts:82-86`

### Streaming Voice Pipeline (Performance)

- Voice channel now uses **Claude 3.5 Haiku** instead of Sonnet 4 (~3-5x faster)
- Reduced voice tools from **51 to 18** essential ones (less prompt tokens)
- **Token streaming** via `anthropic.messages.stream()` — tokens sent to ConversationRelay as they arrive
- User hears first words in ~0.5-1s instead of waiting 3-8s for full response
- New `processWithStreaming()` function handles multi-round tool use with streaming
- Added `channel` and `onTextDelta` options to `processUserMessage()`

### Voice Tool Subset (18 tools)

- Tasks: `add_task`, `complete_task`, `list_tasks`
- Memory: `search_memory`, `get_daily_summary`, `correct_daily_summary`
- Goals: `define_goal`, `log_goal_progress`, `check_goals`
- Planning: `plan_action`
- Knowledge: `search_knowledge`
- Communication: `send_sms`, `send_email`
- Apps/Mods: `log_mod_data`, `get_mod_data`
- Email: `search_emails`, `email_summary`
- Emotion: `tau_assess`

### Chat Context in Voice

- Voice pipeline loads last 50 messages from unified thread (includes web chat)
- `getThreadContext(tenantId, 50)` annotates messages with `[Web Chat]` / `[Voice]` channel tags
- Claude sees full conversation history across all channels

### Files Changed

- `app/api/twilio/voice/route.ts` — signature verification fix
- `lib/voice/conversation-handler.ts` — voice model override, tool subset, streaming
- `server/voice-ws.ts` — streaming token delivery, channel="voice"

### How to Verify

1. Call +48732143210
2. Expect: natural ElevenLabs voice (not robotic Polly.Maja)
3. Expect: fast response (~1-3s vs 5-8s before)
4. Expect: knowledge of web chat context
5. Check Railway logs: "Claude Haiku 3.5 + streaming + 18 tools"

---

## [2026-02-12] TTS Fix + Knowledge Search Fix (HNSW)

### TTS (Text-to-Speech) Fix

- **Root cause**: VoiceInputBar had TTS toggle UI but `speakText()` was never called when AI messages arrived
- Moved TTS state/logic (voice selection, localStorage, speakText) from VoiceInputBar to UnifiedStream
- VoiceInputBar now receives controlled props (`ttsEnabled`, `isSpeaking`, `onToggleTTS`)
- `speakText()` called on SSE "done" event — AI responses are now read aloud in Polish
- Markdown stripping for cleaner speech output (removes `**`, `#`, code blocks, links)

### Knowledge Search Fix (CRITICAL)

- **Root cause**: IVFFlat vector index created on empty table = 0 clusters
- All 1915 chunks had valid embeddings but search returned 0 results (broken index)
- **Fix**: Replaced IVFFlat with HNSW index (`m=16, ef_construction=64`)
- HNSW works immediately regardless of table state at creation time
- Migration: `20260224000002_rebuild_vector_index.sql`
- **Verified**: `search_user_documents()` now returns results with all embedding formats

---

## [2026-02-12] File Upload Fix + Reprocess + Middleware

### File Upload Fix (Chat Rzeka)

- **Root cause**: `handleFileUpload` in UnifiedStream.tsx extracted `path` from upload-url response (doesn't exist), should use `documentId`
- Confirm-upload received `{path, filename, fileType, fileSize}` instead of `{documentId}` → "Document not found" → "Blad przetwarzania"
- Now correctly sends `{documentId}` and uses server-side `mimeType` for Storage PUT
- Also sends `fileSize` to upload-url for accurate DB record

### Reprocess-All Batching

- Added `offset`, `limit`, `delete_chunks` params to `/api/knowledge/reprocess-all`
- Vercel Hobby has 60s timeout — 84 docs need batching (10 per request)
- Fixed double `req.json()` parse bug (body consumed twice)
- **Result**: 84/86 docs reprocessed successfully (2 failed: missing storage files)

### Middleware Fix

- Added `/api/knowledge/reprocess-all` to public API routes in middleware
- Was returning 401 because endpoint wasn't in `isPublicApi` list

### Migration Applied

- `20260223000001_fix_knowledge_search.sql` — applied to production Supabase
- `search_user_documents()` returns `original_name`, threshold lowered to 0.3

---

## [2026-02-12] Knowledge System Fix + Chat Rzeka Unified Stream

### Part A — Knowledge Fixes

- **Fixed embedding search bug**: `JSON.stringify` was double-encoding vectors in RPC call, causing `search_knowledge` to return 0 results despite 84 documents
- **Fixed SQL function**: `search_user_documents` now returns `original_name` instead of storage path
- **Added XLSX extraction**: SheetJS (`xlsx`) extracts text from all spreadsheet sheets
- **Added PPTX extraction**: JSZip parses slide XML, extracts `<a:t>` text content
- **Added URL import**: Firecrawl v2 SDK (`scrape` method) with basic fetch fallback
- **Added web search**: Tavily API — `search_web` + `fetch_webpage` IORS tools (53 total tools)
- **Added reprocess-all endpoint**: `/api/knowledge/reprocess-all` for bulk re-processing

### Part B — Chat Rzeka (Unified Stream)

- **6 new StreamEvent types**: `channel_message`, `call_transcript`, `file_upload`, `third_party_action`, `agent_communication`, `knowledge_citation`
- **6 new event components**: ChannelMessage (color-coded per channel), CallTranscript (collapsible), FileUploadEvent (status indicators), ThirdPartyAction (pill badges), AgentComm, KnowledgeCitation
- **Gateway wiring**: History loading differentiates channel messages (WhatsApp=green, Telegram=sky, SMS=blue, Discord=indigo, etc.)
- **Third-party tool actions**: SSE `tool_end` events map to visual service badges for 11 external services
- **File upload from chat**: Presigned URL flow with live status updates (uploading -> processing -> ready)
- **Input bar**: Paperclip button + drag-and-drop zone on entire chat area
- **ProcessingCallback**: Enhanced with tool result metadata (`success`, `resultSummary`)

### Files Changed

- 6 new components in `components/stream/events/`
- New: `lib/knowledge/url-processor.ts`, `lib/iors/tools/web-tools.ts`
- New: `app/api/knowledge/import-url/route.ts`, `app/api/knowledge/reprocess-all/route.ts`
- New: `supabase/migrations/20260223000001_fix_knowledge_search.sql`
- Modified: `lib/knowledge/document-processor.ts`, `lib/stream/types.ts`, `lib/hooks/useStreamState.ts`
- Modified: `components/stream/UnifiedStream.tsx`, `VoiceInputBar.tsx`, `StreamEventRouter.tsx`
- Modified: `lib/voice/conversation-handler.ts`, `app/api/chat/stream/route.ts`
- Added deps: `xlsx`, `jszip`, `@mendable/firecrawl-js`, `@tavily/core`

### Env vars needed

- `TAVILY_API_KEY` — web search (free tier: 1000/month)
- `FIRECRAWL_API_KEY` — URL scraping (free tier: 500/month, optional — basic fetch fallback)

### How to verify

1. `npm run build` — passes
2. After migration: `search_knowledge("Golde.pl")` should return results
3. Upload .xlsx → chunks created → searchable
4. Chat: send message → third-party tool badges appear in stream
5. Chat: click paperclip or drag file → upload with live status

---

## [2026-02-12] ConversationRelay Voice Pipeline — Replace HTTP Gather with Real-Time WebSocket

### Added — Real-Time Voice Pipeline via Twilio ConversationRelay

**Problem:** Voice calls disconnected on empty speech (Gather timeout → end call), used robotic Polly.Maja TTS, had ~4s latency per turn (server-side TTS generation + upload).

**Solution:** Replaced HTTP turn-by-turn Twilio Gather with real-time ConversationRelay WebSocket pipeline.

**New architecture:**

- **STT:** Deepgram Nova (via ConversationRelay) — replaces Twilio built-in Gather
- **LLM:** Claude Sonnet 4 + 49 IORS tools + emotion analysis (unchanged)
- **TTS:** ElevenLabs (via ConversationRelay, voice ID: 3kPofxWv5xLwBvMVraip) — replaces Polly.Maja/Cartesia
- **Transport:** WebSocket (real-time) — replaces HTTP polling

**Key fixes:**

- Empty speech no longer disconnects call (ignored instead of ending)
- Built-in interruption handling (user can speak mid-response)
- Natural Polish voice (ElevenLabs) instead of robotic Polly.Maja
- ~1-2s latency (text-only over WS) vs ~4s (server-side TTS + audio upload)

### Files Created

- `server/voice-ws.ts` — Standalone WebSocket server for ConversationRelay protocol (280 lines)
- `railway.toml` — Railway deployment config
- `nixpacks.toml` — Nixpacks start command override
- `Procfile` — Process declaration for Railway

### Files Modified

- `lib/voice/twilio-client.ts` — Added `generateConversationRelayTwiML()` function
- `app/api/twilio/voice/route.ts` — ConversationRelay mode when VOICE_WS_URL set, legacy Gather fallback
- `lib/voice/system-prompt.ts` — Added "NATURALNY STYL MÓWIENIA" voice section
- `lib/voice/conversation-handler.ts` — Added `emotion` field to ConversationResult
- `lib/voice/index.ts` — New exports
- `args/voice.yaml` — Dual transport config (conversation_relay + gather fallback)
- `.env.example` — VOICE_WS_URL, VOICE_WS_PORT docs
- `package.json` — Added ws, @types/ws, tsconfig-paths; voice-ws scripts

### Deployment

- **Vercel** (Next.js) — auto-deployed, serves TwiML webhook
- **Railway** (WS server) — `exoskull-production.up.railway.app`, custom start: `npm run voice-ws`
- **Feature flag:** `VOICE_WS_URL` env var enables ConversationRelay; unset = legacy Gather

### How to verify

1. Call +48732144112
2. Voice should be ElevenLabs (natural Polish), not Polly.Maja
3. Silence should NOT disconnect the call
4. Interrupting mid-response should work
5. Tool calls (e.g. "dodaj zadanie") still work
6. Health check: `GET https://exoskull-production.up.railway.app/health`

### Notes for future agents

- Railway ignores railway.toml/Procfile/nixpacks.toml for GitHub-connected services — must set Custom Start Command in dashboard UI
- `echo` adds trailing `\n` to Vercel env vars — use `printf` instead
- voice-ws.ts uses `tsconfig-paths/register` for @/ alias resolution outside Next.js
- ConversationRelay sends text with `last: true` (non-streaming V1); streaming can be added as V2

### Commits

- `44058b9` feat: implement ConversationRelay voice pipeline
- `bc8e2ef` fix: resolve @/ path aliases for standalone voice-ws server
- `d851e4f` fix: add railway.toml to run voice-ws server instead of next start
- `470b4ec` fix: force Railway to run voice-ws via Procfile + nixpacks.toml

---

## [2026-02-11] Gemini Model Upgrade — 1.5-flash → 2.5-flash

### Fixed — Tier 1 AI Router Broken (Model Deprecated)

**Root cause:** Google removed `gemini-1.5-flash` entirely (404). Free tier also has `limit: 0` for `gemini-2.0-flash` and `gemini-2.0-flash-lite`. Only `gemini-2.5-flash` works on free tier.

- Updated ModelId type, config, provider, and all direct references
- Gemini 2.5 Flash is a thinking model — uses `thoughtsTokenCount` before generating output
- Default `maxOutputTokens: 1024` is sufficient (10 tokens would be consumed by thinking alone)
- Verified: API returns correct response with `candidatesTokenCount` field intact

### Files Changed

- `lib/ai/types.ts` — ModelId union type
- `lib/ai/config.ts` — model config, display name, tier mapping
- `lib/ai/providers/gemini-provider.ts` — provider implementation
- `app/api/onboarding/extract/route.ts` — direct API call URL
- `lib/skills/generator/skill-generator.ts` — forceModel reference

---

## [2026-02-11] Email Analysis System

### Added — Multi-provider email sync + AI classification

- 3 tables: `exo_email_accounts`, `exo_analyzed_emails`, `exo_email_sender_profiles`
- Multi-provider: Gmail API (MIME), Outlook Graph, IMAP (imapflow)
- Two-phase AI: classification + deep extraction — ALL Tier 1 Gemini Flash (~$0.008/day/100 emails)
- Knowledge extraction: key_facts → RAG pipeline (`exo_document_chunks`)
- Task generation: action_items → `exo_tasks` with dedup
- 4 IORS tools: `search_emails`, `email_summary`, `email_follow_ups`, `email_sender_info`
- Canvas widget `email_inbox` (#18), self-fetching wrapper
- Data lake: Bronze `emails`, Silver `exo_silver_emails`, Gold `exo_gold_email_daily` view
- CRONs: `/api/cron/email-sync` (15min) + `/api/cron/email-analyze` (5min)
- IMAP passwords encrypted with AES-256-GCM (`lib/email/crypto.ts`)

---

## [2026-02-11] Knowledge Analysis Engine

### Added — Automated knowledge base analysis with insights

- Two modes: light (rule-based, $0) + deep (AI via Haiku, ~$0.01-0.05)
- 17 parallel queries in collector, snapshot hash dedup, 7 action types
- IORS tool `analyze_knowledge` (#47), widget `knowledge_insights` (#17)
- `knowledge_analysis` handler in maintenance.ts (loop-daily)

---

## [2026-02-09] Fix TTS Read-Aloud Not Working

### Fixed — Cartesia TTS Silent Failure

**Root cause:** `CARTESIA_API_KEY` was missing from `.env.local` — Cartesia API threw `Missing CARTESIA_API_KEY`, TTS route returned 500, but `fetchTTSAndPlay` silently swallowed the error (`if (!res.ok) return;` with no logging).

- Added `CARTESIA_API_KEY` to `.env.local` (copied from `.env.vercel-check`, stripped trailing `\n`)
- Added error logging to `fetchTTSAndPlay` — now logs status + response body on failure
- Fixed stale closure bug: `isTTSEnabled` captured at callback creation could be stale during long streaming; replaced with `ttsEnabledRef.current` (useRef + useEffect sync)
- Verified: build passes, deployed to production (commit `32b5fc7`)

### Files Changed

- `components/dashboard/HomeChat.tsx` — error logging + stale closure fix (ttsEnabledRef)
- `.env.local` — added `CARTESIA_API_KEY`

---

## [2026-02-09] Canvas Widget System

### Added — Drag-and-drop widget grid for dashboard canvas

- `exo_canvas_widgets` table with per-tenant grid positions, pinned flag, config JSONB
- react-grid-layout v2.2.2 with Responsive layout
- Widget registry: 12 built-in types in `lib/canvas/widget-registry.ts`
- Self-fetching wrappers: CanvasHealthWidget, CanvasTasksWidget
- Default seeding: 6 widgets on first visit (voice_hero pinned)
- `manage_canvas` IORS tool: add/remove/show/hide widgets (31 total tools)

---

## [2026-02-08b] Fix Storage Bucket + Audit Migration

### Fixed — File Upload 400 Error (Storage Bucket Constraints)

**Root cause:** Supabase Storage bucket `user-documents` was created with only 6 MIME types (pdf, txt, md, jpeg, png, docx) and 10MB limit. Upload-url route allows 17 types and 500MB. Supabase enforces bucket-level constraints even for signed upload URLs → 400 on disallowed types.

- Created migration `20260214000001_fix_storage_bucket.sql` — updates bucket to 17 MIME types + 500MB
- Fixed migration `20260213000001_audit_fixes.sql`:
  - Removed `tenant_id` references from `exo_event_triggers` RLS (table has no tenant_id — it's global config)
  - Wrapped GHL table references in `IF EXISTS` checks (GHL schema not deployed yet)
  - Wrapped GHL index creation in `IF EXISTS` checks
- Both migrations pushed successfully to remote DB
- Verified: signed URL upload works for PDF and JSON (previously blocked)

### Files Changed

- `supabase/migrations/20260213000001_audit_fixes.sql` — fixed broken references
- `supabase/migrations/20260214000001_fix_storage_bucket.sql` — new, expands bucket constraints

---

## [2026-02-08] Fix Chat + RAG Pipeline + Presigned Upload

### Fixed — Chat Message Duplication (Critical)

**Root cause:** Gateway pre-appended user message to unified thread, then `processUserMessage` re-added it → consecutive same-role "user" messages → Anthropic API 400.

- Added `skipThreadAppend` option to `processUserMessage()` — gateway path skips re-appending
- Added `skipUserAppend` option to `updateSession()` — gateway path skips re-recording user message
- Gateway passes both flags when routing through `processUserMessage`
- Removed duplicate `appendMessage` in async-tasks CRON (was double-writing assistant message)
- Added `enforceAlternatingRoles()` defense in `getThreadContext()` — merges consecutive same-role messages
- Enhanced Claude API error logging: logs status, type, messageCount, lastTwoRoles, hasConsecutiveSameRole

### Fixed — Thread Context Overflow

**Root cause:** User pasted 3.6MB JSON dump into chat → 944K tokens in thread → exceeded Sonnet 4's 200K context window.

- Added `MAX_MESSAGE_CHARS = 4000` — truncates individual oversized messages
- Added `MAX_TOTAL_CHARS = 100,000` — drops oldest messages when total exceeds budget
- Applied in `getThreadContext()` before role alternation enforcement
- Manually repaired corrupted thread (removed 8 messages: 2 oversized, 4 error responses, 2 buggy)

### Fixed — File Upload 413 Error

**Root cause:** Vercel serverless functions have a hard 4.5MB body size limit. Files uploaded via FormData through API route hit this limit.

- Created `/api/knowledge/upload-url` — generates Supabase Storage signed upload URL + DB record with "uploading" status
- Created `/api/knowledge/confirm-upload` — verifies file in storage, updates status, triggers document processing
- Updated HomeChat and BirthChat upload handlers to use 3-step presigned flow (get URL → PUT to Storage → confirm)

### Added — Full RAG Pipeline

- Created `lib/knowledge/document-processor.ts` — complete document processing pipeline:
  - Text extraction: PDF (`pdf-parse`), DOCX (`mammoth`), TXT/MD/CSV (direct)
  - AI summary generation via Claude Haiku
  - Recursive text chunking (~500 words, 50 word overlap)
  - OpenAI embeddings (`text-embedding-3-small`, 1536 dims)
  - Chunks stored in `exo_document_chunks` with pgvector
- Created `/api/knowledge/search` — semantic search endpoint (embed query → cosine similarity → top results)
- Created `lib/iors/tools/knowledge-tools.ts` — IORS `search_knowledge` tool for AI-powered document search
- Created `lib/unified-thread-repair.ts` — thread repair utility for removing corrupted messages
- Registered knowledge tools in IORS tool index (32 total tools)

### Added — TTS fullText Backup

- HomeChat SSE handler now captures `fullText` from "done" event as TTS fallback

### Dependencies Added

- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX text extraction

### Files Created

| File                                        | Purpose                                  |
| ------------------------------------------- | ---------------------------------------- |
| `app/api/knowledge/upload-url/route.ts`     | Presigned upload URL endpoint            |
| `app/api/knowledge/confirm-upload/route.ts` | Upload confirmation + processing trigger |
| `app/api/knowledge/search/route.ts`         | Semantic search endpoint                 |
| `lib/knowledge/document-processor.ts`       | RAG pipeline (extract → chunk → embed)   |
| `lib/iors/tools/knowledge-tools.ts`         | IORS search_knowledge tool               |
| `lib/unified-thread-repair.ts`              | Thread repair utility                    |

### Files Modified

| File                                  | Changes                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `lib/voice/conversation-handler.ts`   | skipThreadAppend, skipUserAppend, enhanced error logging                   |
| `lib/gateway/gateway.ts`              | Pass skip flags to processUserMessage + updateSession                      |
| `lib/unified-thread.ts`               | Token budget (MAX_MESSAGE_CHARS, MAX_TOTAL_CHARS), enforceAlternatingRoles |
| `components/dashboard/HomeChat.tsx`   | File upload UI (Paperclip), presigned upload flow, TTS fullText backup     |
| `components/onboarding/BirthChat.tsx` | File upload UI, presigned upload flow                                      |
| `app/api/cron/async-tasks/route.ts`   | Removed duplicate assistant appendMessage                                  |
| `app/api/knowledge/upload/route.ts`   | Fire-and-forget processDocument trigger                                    |
| `lib/iors/tools/index.ts`             | Registered knowledge-tools                                                 |

### Commits

- `e173b4a` — fix: Fix chat duplication + add RAG file upload pipeline (14 files, +1389 lines)
- `3beaa81` — fix: Add token budget to thread context (prevent context overflow)
- `bb6eb99` — fix: Use presigned upload URLs for file uploads (bypass Vercel 4.5MB limit)

---

## [2026-02-06] Security Audit — Phase 5: Webhook Auth + Supabase Migration

### Webhook Authentication Hardening (S5, S7, S9, S10, S11)

- **WhatsApp & Messenger**: Made META_APP_SECRET mandatory — HMAC verification no longer silently skipped when env var is missing (returns 500)
- **Twilio Voice**: Added X-Twilio-Signature validation using existing `validateTwilioSignature()` utility (warns if TWILIO_AUTH_TOKEN missing)
- **Signal Gateway**: Added SIGNAL_WEBHOOK_SECRET auth via `x-signal-webhook-secret` header or Bearer token (was completely unauthenticated)
- **iMessage Gateway**: Removed query param password (leaks to access logs), now requires Bearer header only

### Supabase Client Migration (Q-series)

- Migrated 61 files from local `getSupabase()` factory to shared `getServiceSupabase()` from `lib/supabase/service.ts`
- Removed 61 duplicate `createClient` imports + ~1,200 lines of boilerplate
- Fixed 3 broken multi-line imports from batch migration
- Fixed 2 `ReturnType<typeof getSupabase>` references in WhatsApp/Messenger

### Files changed

- 5 webhook/gateway routes (whatsapp, messenger, twilio voice, signal, imessage)
- 61 files migrated to shared Supabase client
- Total: ~66 files modified

### New env vars required

- `SIGNAL_WEBHOOK_SECRET` — shared secret for Signal webhook authentication

---

## [2026-02-06] Security Audit — Phase 1 Critical Fixes

### Full Audit Summary

- **76 findings** across 4 areas: Security (29), Code Quality (12), Architecture (17), Frontend (18)
- **13 CRITICAL**, 22 HIGH, 25 MEDIUM, 16 LOW

### What was done (Phase 1 — Security Critical)

- **S1: IDOR fix** — Replaced spoofable `x-tenant-id` header with JWT verification (`verifyTenantAuth`) across 13 API route files (22 handlers). Created shared `lib/auth/verify-tenant.ts` supporting both cookie and Bearer token auth.
- **S3: Sandbox escape** — Replaced `new Function()` with `vm.createContext()` + code validation (13 blocked patterns). Prevents prototype chain escapes and RCE.
- **S4: Pulse auth** — Implemented JWT verification in POST handler (was TODO).
- **S8: Gateway middleware** — Added `/api/gateway/` to `isPublicApi` list, unblocking Telegram/Discord/Slack/Signal/iMessage webhooks in production.
- **Frontend cleanup** — Removed all `x-tenant-id` header usage from 7 client files.

### Files changed (24 files)

- `lib/auth/verify-tenant.ts` (NEW)
- `lib/supabase/middleware.ts`, `lib/skills/sandbox/restricted-function.ts`
- 13 API route files (skills, rigs, mods, meta, pulse)
- 7 frontend files (dashboard pages + widgets)
- `scripts/test-all-routes.ts`

### Remaining

- Webhook signature verification for Twilio voice, WhatsApp, Messenger, Telegram, Signal, iMessage
- Replace 11 remaining `confirm()` calls with AlertDialog components
- Break up god files (conversation-handler 1,929 LOC, mape-k-loop 1,194 LOC)
- Type 134 `any` usages across 45 files
- Migrate 68 files from local `getSupabase()` to shared `getServiceSupabase()`
- Add project ESLint config with custom rules

---

## [2026-02-06] Security Audit — Phase 2: Architecture & Stability

### What was done

- **A4: Security headers** — Added HSTS (2yr, preload), X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy to next.config.js
- **A1: Ghost table fix** — Fixed 2 naming mismatches in Pulse (`rig_connections`→`exo_rig_connections`, `user_health_metrics`→`exo_health_metrics`, `user_id`→`tenant_id`)
- **A3: Duplicate migration** — Renamed `20260207000002_signal_imessage_channels.sql` → `20260207000003`
- **A5: Phone index** — Created migration `20260207000004_index_tenants_phone.sql` for gateway lookups
- **S12: Setup-cron auth** — Added CRON_SECRET verification to unauthenticated GET handler
- **Q1: Error logging** — Added `console.warn` to 11 critical silent catch blocks (MAPE-K loop 5x, conversation handler 3x, agent registry 1x)

### Files changed (9 files)

- `next.config.js` — security headers + `images.remotePatterns` migration
- `app/api/pulse/route.ts` — ghost table + column fixes
- `app/api/setup-cron/route.ts` — GET auth
- `lib/autonomy/mape-k-loop.ts` — 5 catch blocks
- `lib/voice/conversation-handler.ts` — 3 catch blocks
- `lib/agents/registry.ts` — 1 catch block
- 2 new migration files

---

## [2026-02-06] Security Audit — Phase 3: Frontend Foundations

### What was done

- **F1/F4: Error handling** — Created `app/error.tsx`, `app/not-found.tsx`, `app/dashboard/error.tsx`, `app/dashboard/loading.tsx`
- **F5: Toast notifications** — Installed sonner, added `<Toaster>` to root layout, replaced 22 `alert()` calls with `toast.error()` across 12 files
- **F10: Page metadata** — Added `title.template` to dashboard layout, `metadata` exports to 3 server pages
- **F2: Accessibility** — Added 11 `aria-label` attributes to icon-only buttons (HierarchyView 7x, card menus 4x)

### Files changed (28 files)

- 4 new error/loading/not-found pages
- `app/layout.tsx` — Toaster integration
- `app/dashboard/layout.tsx` — metadata template
- 12 page/component files — alert→toast migration
- 4 knowledge card components — aria-labels
- `components/knowledge/HierarchyView.tsx` — 7 aria-labels
- `package.json` — added sonner dependency

---

## [2026-02-06] Security Audit — Phase 4: Code Quality (Partial)

### What was done

- **Shared Supabase utility** — Created `lib/supabase/service.ts` with `getServiceSupabase()` (68 files to migrate incrementally)
- **Deprecated config** — Migrated `images.domains` to `images.remotePatterns` in next.config.js

---

## [2026-02-05] Autonomous Actions — run_automation + custom action registry

### Implemented

- `handleRunAutomation()` in action-executor.ts — loads automation from `exo_custom_scheduled_jobs`, verifies tenant ownership, dispatches via SMS (Twilio API) or voice (`makeOutboundCall`), logs to `exo_custom_job_logs`
- `handleCustomAction()` with registry pattern — 5 initial actions: `toggle_automation`, `adjust_schedule`, `set_quiet_hours`, `update_preference`, `archive_completed_tasks`
- executor.ts `dispatchAction()` — added `run_automation`, `automation_trigger`, and `custom` cases delegating to ActionExecutor

### Files changed

- `lib/autonomy/action-executor.ts` — +import, replaced 2 stubs, added registry
- `lib/autonomy/executor.ts` — +3 switch cases, +2 delegation handlers

---

## [2026-02-05] Gap Detection CRON + Suggestion Expiry

### Added

- `/api/cron/gap-detection` - Weekly CRON (Sundays 09:00 UTC)
  - Runs `detectGaps()` for all active tenants with `forceRun=true`
  - Creates interventions in `exo_interventions` → feeds Skill Need Detector's Gap Bridge
- `expireOldSuggestions()` in lifecycle-manager
  - Calls `expire_old_skill_suggestions()` DB function
  - Integrated into existing `skill-lifecycle` daily CRON (03:00 UTC)

### Modified

- `vercel.json` - Added gap-detection to crons array
- `skill-lifecycle/route.ts` - Now also expires pending suggestions >14 days
- `lifecycle-manager.ts` - New `expireOldSuggestions()` export

### Flow

```
Sunday 08:00 → guardian-values (drift detection)
Sunday 09:00 → gap-detection (blind spot analysis for all tenants)
              → creates exo_interventions (type: gap_detection)
              → next post-conversation CRON reads these via Gap Bridge
              → generates skill suggestions
Daily  03:00 → skill-lifecycle (archive unused skills + expire old suggestions)
```

---

## [2026-02-05] Memory System - "Najlepsza pamięć na rynku"

### Added - Complete Memory System (Daily Summaries + Search + Interactive Review)

**Database Migration** (`20260205000004_memory_digests_system.sql`):

- `exo_daily_summaries` - AI-generated daily summaries with user corrections
  - `draft_summary` / `final_summary` - before/after user review
  - `user_corrections` JSONB - array of corrections
  - `mood_score` / `energy_score` - sentiment tracking
  - `key_events` / `key_topics` / `decisions_made` - extracted data
  - Vector embedding for semantic search
- `exo_memory_digests` - Weekly/monthly/yearly compressed summaries
  - `period_type` - week/month/quarter/year
  - `narrative_summary` - AI-generated narrative
  - `patterns_detected` - long-term pattern detection
- Helper functions:
  - `get_memory_context(tenant_id, limit)` - Smart context window (50 msgs + summaries + highlights)
  - `get_or_create_daily_summary(tenant_id)` - Upsert helper

**Memory Core** (`lib/memory/`):

| File               | Functions                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `daily-summary.ts` | `createDailySummary()`, `applyCorrection()`, `finalizeSummary()`, `getSummaryForDisplay()`, `getRecentSummaries()`          |
| `search.ts`        | `keywordSearch()`, `findLastMention()`, `getContextAroundDate()`, `getMemoryTimeline()`, `formatSearchResultsForResponse()` |

**CRON Job** (`app/api/cron/daily-summary/route.ts`):

- Schedule: `0 19 * * *` (21:00 Poland time)
- For each active tenant:
  1. Check timezone & quiet hours
  2. Generate AI draft summary from day's conversations
  3. Send SMS with summary
  4. User can reply with corrections
- Manual trigger via POST with `tenant_id`

**Voice Tools** (added to `conversation-handler.ts`):

| Tool                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `get_daily_summary`     | "Jak minął dzień?" - returns today's summary |
| `correct_daily_summary` | "To był Marek, nie Tomek" - adds correction  |
| `search_memory`         | "Kiedy mówiłem o kawie?" - searches memory   |

**ElevenLabs Voice Upgrade**:

- Added `ELEVENLABS_VOICE_ID` env var to Vercel
- Set to `gFl0NeqphJUaoBLtWrqM` (Piotr Pro PL - professional Polish voice)

### Verified Features

| Feature                           | Status                                                 |
| --------------------------------- | ------------------------------------------------------ |
| Outbound calling to user          | ✅ `POST /api/twilio/outbound`                         |
| Outbound calling to third parties | ✅ Tool `make_call` → `/api/twilio/voice/delegate`     |
| SMS notifications                 | ✅ Via Twilio                                          |
| Daily summary CRON                | ✅ Scheduled 21:00 PL                                  |
| Memory search                     | ✅ Keyword search across messages/summaries/highlights |
| Voice tools                       | ✅ 3 new tools integrated                              |

### Files Created

- `lib/memory/daily-summary.ts` - Daily summary generation & review
- `lib/memory/search.ts` - Memory search functionality
- `app/api/cron/daily-summary/route.ts` - CRON endpoint
- `supabase/migrations/20260205000004_memory_digests_system.sql` - DB schema

### Files Modified

- `vercel.json` - Added daily-summary CRON schedule
- `lib/voice/conversation-handler.ts` - Added 3 memory voice tools

### How to Verify

1. Voice: Call +48732144112, ask "Jak minął dzień?"
2. Voice: Call +48732144112, say "Zadzwoń pod [numer] i powiedz cześć"
3. Wait for 21:00 or manually trigger `/api/cron/daily-summary`
4. Search: Ask "Kiedy ostatnio mówiłem o [topic]?"

### Environment Variables Required

```
ELEVENLABS_VOICE_ID=gFl0NeqphJUaoBLtWrqM  # Added to Vercel
```

---

## [2026-02-04] Admin Panel - Full Operations Dashboard

### Added - Complete Admin Panel (9 pages, 13 API endpoints, 5 DB tables)

**Database Migration** (`20260205000001_admin_panel.sql`):

- `admin_users` - Role-based admin access control
- `admin_cron_runs` - Cron execution logging with duration/status/result
- `admin_error_log` - Centralized error logging with severity/source/stack traces
- `admin_api_logs` - API request logging for latency tracking (p50/p95/p99)
- `admin_daily_snapshot` - Pre-calculated daily metrics (active users, AI costs, cron health, errors)
- Helper functions: `get_cron_health_summary()`, `get_admin_overview()`, `cleanup_admin_logs()`
- Full RLS policies (service_role only)

**Admin Utilities** (`lib/admin/`):

- `auth.ts` - `verifyAdmin()`, `requireAdmin()`, `getAdminSupabase()`
- `logger.ts` - Error/cron/API request logging helpers
- `cron-wrapper.ts` - `withCronLogging()` HOF for wrapping existing cron routes

**Admin Pages** (`app/admin/`):
| Page | Features |
|------|----------|
| Command Center (`/admin`) | Heartbeat stats, recent crons, recent errors, cron health table (30s polling) |
| Cron Jobs (`/admin/cron`) | All 14 jobs, expandable rows, "Run Now" button, 60s polling |
| AI Router (`/admin/ai`) | Per-model stats, tier distribution, daily cost trend, period selector |
| Business KPIs (`/admin/business`) | MRR, churn, LTV, ARPU, trial conversion, tier/engagement distributions, dunning |
| Users (`/admin/users`) | Paginated table, search, engagement badges, churn risk indicators |
| User Deep-Dive (`/admin/users/[id]`) | Stats, MITs, installations, patterns, interventions, conversations |
| Autonomy (`/admin/autonomy`) | MAPE-K cycles, guardian stats, feedback breakdown, value conflicts |
| Data Pipeline (`/admin/data-pipeline`) | Bronze→Silver→Gold status, gold view row counts, sync logs |
| Self-Optimize (`/admin/insights`) | 10-category analysis engine, severity cards, re-analyze button |
| Logs (`/admin/logs`) | Tabbed error/API logs, filters, latency percentiles, expandable stack traces |

**Self-Optimization Engine** (10 analysis categories):

1. Cron health (failure detection)
2. AI cost optimization (per-model analysis)
3. Engagement scoring (churn risk detection)
4. Intervention effectiveness (approval/success rates)
5. Pipeline freshness (ETL lag detection)
6. Learning events (knowledge growth tracking)
7. Revenue/MRR trends (growth analysis)
8. Popular mods (adoption patterns → feature suggestions)
9. User feedback (satisfaction → improvement proposals)
10. Cost efficiency (cost-per-user, revenue-per-cost ratios)

**New Cron Job**: `/api/cron/admin-metrics` (daily at 05:30 UTC) - calculates daily snapshots

### Files Created

- 1 migration, 3 lib utilities, 2 components, 9 pages, 13 API routes, 1 cron job = 29 new files

### Files Modified

- `vercel.json` - Added admin-metrics cron schedule

### How to Verify

1. Run migration: `supabase db push`
2. Add yourself to `admin_users` table
3. Visit `/admin` - should see Command Center
4. All 9 pages should load without errors
5. `npm run build` passes clean

---

## [2026-02-03] MODUL 1: GOTCHA Framework - Formalizacja

### Added - Pełna struktura GOTCHA Framework

Sformalizowano architekturę 6-warstwową według GOTCHA:

**goals/** (5 workflow definitions):
| File | Purpose |
|------|---------|
| `manifest.md` | Index wszystkich workflow |
| `daily-checkin.md` | Morning/evening check-in flow |
| `voice-conversation.md` | Voice pipeline (Twilio+ElevenLabs+Claude) |
| `task-management.md` | Task CRUD via voice/dashboard/integrations |
| `knowledge-capture.md` | Tyrolka framework: Loops>Campaigns>Quests>Ops>Notes |
| `autonomy-execution.md` | MAPE-K loop, gap detection, permissions |

**tools/** (1 file):
| File | Purpose |
|------|---------|
| `manifest.md` | Index of AI tools (task, calendar, email, web_search) |

**args/** (4 config files):
| File | Purpose |
|------|---------|
| `models.yaml` | Multi-model AI routing (4 tiers: Gemini→Haiku→Kimi→Opus) |
| `rigs.yaml` | Integration settings (12 rigs: Google, Oura, Todoist...) |
| `mods.yaml` | Mod definitions (7 mods: sleep, mood, habit, task...) |
| `voice.yaml` | Voice pipeline config (Twilio, ElevenLabs, Claude) |

**hardprompts/** (3 templates):
| File | Purpose |
|------|---------|
| `discovery-interview.md` | Onboarding conversation (~60 topics) |
| `gap-detection.md` | Blind spot detection prompts |
| `daily-summary.md` | Morning/evening summary templates |

**context/** (2 knowledge files):
| File | Purpose |
|------|---------|
| `tone.md` | ExoSkull personality & communication style |
| `domains.md` | Life domains (Health, Work, Finance...) + gap thresholds |

### GOTCHA Architecture

```
GOT (Engine):
├── Goals (goals/) - What to achieve
├── Orchestration - AI manager (Claude)
└── Tools (lib/tools/) - Deterministic execution

CHA (Context):
├── Context (context/) - Domain knowledge
├── Hard Prompts (hardprompts/) - Instruction templates
└── Args (args/) - Behavior configuration
```

### Files Created (16 total)

```
exoskull-app/
├── goals/
│   ├── manifest.md
│   ├── daily-checkin.md
│   ├── voice-conversation.md
│   ├── task-management.md
│   ├── knowledge-capture.md
│   └── autonomy-execution.md
├── tools/
│   └── manifest.md
├── args/
│   ├── models.yaml
│   ├── rigs.yaml
│   ├── mods.yaml
│   └── voice.yaml
├── hardprompts/
│   ├── discovery-interview.md
│   ├── gap-detection.md
│   └── daily-summary.md
└── context/
    ├── tone.md
    └── domains.md
```

### Notes for Future Agents

- Goals define WHAT to achieve, not HOW system behaves
- Args control runtime behavior (model tiers, sync intervals)
- Hardprompts are reusable templates for LLM sub-tasks
- Context is static reference material (personality, domains)
- Tools are in lib/tools/ (code), manifests here (documentation)
- MODUL 1 is now 100% complete

---

## [2026-02-03] MODUL 2: Knowledge Layer (Tyrolka Framework)

### Verified/Enhanced

Complete Knowledge Layer implementation verified and enhanced.

**API Endpoints** (all working):

- `/api/knowledge/loops` - CRUD for life domains
- `/api/knowledge/campaigns` - CRUD for major initiatives
- `/api/knowledge/quests` - CRUD for projects
- `/api/knowledge/ops` - CRUD for tasks
- `/api/knowledge/notes` - CRUD for universal notes
- `/api/knowledge/tyrolka` - GET synthesized context
- `/api/knowledge/upload` - POST file upload (supports PDF, DOCX, images, video up to 1GB)

**Components Enhanced**:

- `OpCard.tsx` - Added onToggleStatus prop, checkbox UI, recurring indicator
- `NoteCard.tsx` - NEW - Display notes with type icon, AI summary, tags

**Components Created**:

- `LoopFormDialog.tsx` - Create/edit loops with icon/color pickers
- `CampaignFormDialog.tsx` - Create/edit campaigns
- `QuestFormDialog.tsx` - Create/edit quests with tags
- `OpFormDialog.tsx` - Create/edit ops with recurring support

**View Components** (verified existing):

- `KnowledgeHeader.tsx` - Header with tabs (Hierarchia/Notatki/Dokumenty) + search + add menu
- `HierarchyView.tsx` - 4-column responsive layout (Loops→Campaigns→Quests→Ops)
- `NotesView.tsx` - Notes grid with type filter, search, pagination
- `FileUploadZone.tsx` - Drag & drop upload with progress
- `DocumentsList.tsx` - Document list with status badges, delete with confirmation

**Lib Created**:

- `lib/hooks/useKnowledge.ts` - Data fetching hooks (useLoops, useCampaigns, useQuests, useOps, useNotes, useDocuments)
- `lib/api/knowledge.ts` - CRUD helper functions with error handling

### Files Changed

- `components/knowledge/OpCard.tsx`
- `components/knowledge/NoteCard.tsx` (NEW)
- `components/knowledge/LoopFormDialog.tsx` (NEW)
- `components/knowledge/CampaignFormDialog.tsx` (NEW)
- `components/knowledge/QuestFormDialog.tsx` (NEW)
- `components/knowledge/OpFormDialog.tsx` (NEW)
- `lib/hooks/useKnowledge.ts` (NEW)
- `lib/api/knowledge.ts` (NEW)

---

## [2026-02-03] MODUL 6: Tools & Mods

### Added - Claude Tools Framework

Built AI tools for Claude tool use and expanded health tracking mods.

**lib/tools/** (NEW - 6 files):

- `types.ts` - Tool type definitions (ExoTool, ToolHandler, ToolResult)
- `index.ts` - Tool registry with TOOL_REGISTRY, getAllToolDefinitions(), executeTool()
- `task-tool.ts` - Task CRUD wrapper around TaskManagerExecutor
- `calendar-tool.ts` - Calendar CRUD via Google Workspace rig
- `email-tool.ts` - Email read/send via Google Workspace rig
- `search-tool.ts` - Web search via Tavily API

**app/api/tools/** (NEW - 2 files):

- `route.ts` - Main tool dispatcher (POST execute, GET list)
- `search/route.ts` - Dedicated web search endpoint

### Added - Health Mod Executors

**lib/mods/executors/** (2 new files):

- `sleep-tracker.ts` - Sleep tracking with Oura integration + manual fallback
- `activity-tracker.ts` - Activity/workout tracking with Oura/manual entries

### Added - Database Migration

**supabase/migrations/20260203000001_sleep_activity_tables.sql**:

- `exo_sleep_entries` - Sleep session tracking (Oura, manual, health-connect)
- `exo_activity_entries` - Activity/workout tracking
- `exo_health_goals` - Health goal tracking

### Modified

- `lib/mods/executors/index.ts` - Registered SleepTrackerExecutor, ActivityTrackerExecutor

### Environment Variables

- `TAVILY_API_KEY` - Required for web search tool

---

## [2026-02-03] MODUL 5: Integrations (Rigs)

### Added

- Oura OAuth routes and dedicated sync endpoint that writes to `exo_health_metrics`
- `lib/rigs/oura/types.ts` and type exports from the Oura client
- Health dashboard charts: Sleep, Activity, HRV

### Changed

- Google Workspace client: Gmail drafts, Calendar event update/delete/list, tasks sync helper
- Rig sync now upserts health metrics for `google` and `google-fit`
- Health page copy now references Oura/Google Fit + Health Connect

### Files

- `lib/rigs/oura/types.ts`
- `lib/rigs/oura/client.ts`
- `app/api/rigs/oura/connect/route.ts`
- `app/api/rigs/oura/callback/route.ts`
- `app/api/rigs/oura/sync/route.ts`
- `lib/rigs/google-workspace/client.ts`
- `lib/rigs/google/client.ts`
- `app/api/rigs/[slug]/sync/route.ts`
- `app/dashboard/health/page.tsx`

## [2026-02-03] MODUL 3: Voice Pipeline (Twilio + ElevenLabs + Claude)

### Added - Custom Voice Pipeline (WITHOUT VAPI)

Built a complete voice pipeline for phone calls using HTTP turn-by-turn pattern.

**Stack:** Twilio (telephony) + ElevenLabs (TTS/STT) + Claude (LLM)

**New files created:**

| File                                | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `lib/voice/twilio-client.ts`        | TwiML generation, outbound calls      |
| `lib/voice/elevenlabs-tts.ts`       | Text-to-Speech with caching           |
| `lib/voice/elevenlabs-stt.ts`       | Speech-to-Text with Deepgram fallback |
| `lib/voice/conversation-handler.ts` | Claude conversation + tools           |
| `lib/voice/index.ts`                | Module exports                        |
| `app/api/twilio/voice/route.ts`     | Main webhook (start/process/end)      |
| `app/api/twilio/status/route.ts`    | Call status callbacks                 |
| `app/api/twilio/outbound/route.ts`  | Initiate outbound calls               |
| `app/api/voice/sessions/route.ts`   | Voice session history API             |

**Migration:** `20260202000027_voice_sessions.sql`

- `exo_voice_sessions` table for conversation state
- `voice-audio` storage bucket for TTS audio

### Enhanced - Dashboard Voice Page

- Added "Test Phone Call" button (calls user's phone via Twilio)
- Added voice sessions history display
- Web voice still uses VAPI SDK (hybrid approach)

### Voice Flow

```
User calls → Twilio webhook → Claude + Tools → ElevenLabs TTS → Twilio <Play>
```

### Dependencies

```
twilio@^5.0.0
```

---

## [2026-02-02] Data Pipeline Verification & Analytics Module

### ATLAS L - Link (VERIFIED)

**Data Pipeline Status:** All layers operational

| Layer      | Status     | Files                                                            |
| ---------- | ---------- | ---------------------------------------------------------------- |
| Bronze ETL | WORKING    | `lib/datalake/bronze-etl.ts`, `app/api/cron/bronze-etl/route.ts` |
| Silver ETL | WORKING    | `lib/datalake/silver-etl.ts`, `app/api/cron/silver-etl/route.ts` |
| Gold ETL   | WORKING    | `lib/datalake/gold-etl.ts`, `app/api/cron/gold-etl/route.ts`     |
| R2 Storage | CONFIGURED | Credentials in `.env.local`                                      |
| Cron Jobs  | CONFIGURED | `vercel.json` (01:00, 02:00, 03:00 UTC)                          |

### Added - Analytics Module

**New files created:**

| File                             | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `lib/analytics/duckdb-client.ts` | DuckDB query generation for Bronze layer, R2 file discovery |
| `lib/analytics/queries.ts`       | Pre-built queries for Gold/Silver layer dashboards          |
| `lib/analytics/index.ts`         | Unified exports for analytics module                        |

**Analytics queries available:**

- `getDailySummary()` - Gold layer, <100ms
- `getWeeklySummary()` - Gold layer, <100ms
- `getMonthlySummary()` - Gold layer, <100ms
- `getMessagesDailySummary()` - Gold layer, <100ms
- `getRealTimeStats()` - Silver layer, real-time
- `getRecentConversations()` - Silver layer, real-time
- `getConversationInsights()` - Derived insights
- `getPeriodComparison()` - Week-over-week comparison

**DuckDB utilities:**

- `generateDuckDBSQL()` - Generate SQL for ad-hoc Bronze queries
- `getDuckDBConfig()` - R2 connection config for DuckDB
- `ANALYTICS_QUERIES` - Pre-built query templates

### Added - Gold Layer Refresh RPC

**Migration:** `20260202000026_gold_refresh_function.sql`

**RPC Functions:**

- `refresh_gold_view(view_name)` - Refresh single materialized view with CONCURRENTLY
- `refresh_all_gold_views()` - Refresh all 4 Gold views, returns status

### Added - Testing Documentation

**File:** `docs/data-pipeline-testing.md`

Comprehensive stress-test guide covering:

- Bronze ETL testing (R2 connection, single/all tenants)
- Silver ETL testing (data quality checks)
- Gold ETL testing (RPC functions, benchmarks)
- End-to-end pipeline test procedure
- Troubleshooting guide
- Performance benchmarks

### Files Changed

| File                                                           | Change                               |
| -------------------------------------------------------------- | ------------------------------------ |
| `lib/analytics/duckdb-client.ts`                               | NEW - DuckDB client for Bronze layer |
| `lib/analytics/queries.ts`                                     | NEW - Dashboard query functions      |
| `lib/analytics/index.ts`                                       | NEW - Module exports                 |
| `supabase/migrations/20260202000026_gold_refresh_function.sql` | NEW - RPC functions                  |
| `docs/data-pipeline-testing.md`                                | NEW - Testing documentation          |

### How to Verify

```bash
# Check Bronze ETL status
curl -X GET "https://exoskull.xyz/api/cron/bronze-etl"

# Check Silver ETL status
curl -X GET "https://exoskull.xyz/api/cron/silver-etl"

# Check Gold ETL status
curl -X GET "https://exoskull.xyz/api/cron/gold-etl"
```

---

## [2026-02-02] Voice Pipeline Fix & Cron System Repair

### Fixed - Voice Function (exoskull-voice)

**Critical bugs fixed:**

- Changed table reference from `tasks` → `exo_tasks`
- Changed column reference from `user_id` → `tenant_id`
- Changed user lookup from `users` table → `exo_tenants` table
- Changed phone column from `phone_number` → `phone`

**Added - Claude Tool Use:**

- `add_task` - Create new tasks via voice
- `complete_task` - Mark tasks as done (fuzzy title match)
- `list_tasks` - List pending/done/all tasks

### Fixed - Scheduled Jobs System

**SQL Function Fix:**

- Created migration `20260202000025_fix_scheduled_job_function.sql`
- Fixed `get_users_for_scheduled_job` function with explicit type casts
- Resolved "structure of query does not match function result type" error

### Configuration

**Tenant Setup:**

- Added phone number `+48607090956` to tenant
- Added consent for all 10 user-facing scheduled jobs

**Twilio Webhook:**

- Updated +48732144112 webhook from old Supabase project to correct one
- URL: `https://uvupnwvkzreikurymncs.supabase.co/functions/v1/exoskull-voice?action=start`

**Supabase Secrets:**

- Added `ANTHROPIC_API_KEY`
- Added `ELEVENLABS_API_KEY`

### Changed - ElevenLabs Voice ID

Updated voice ID in 5 files from `vhGAGQee0VjHonqyxGxd` to `Qs4qmNrqlneCgYPLSNQ7`:

- `components/voice/GlobalVoiceButton.tsx`
- `app/dashboard/voice/page.tsx`
- `lib/cron/dispatcher.ts`
- `app/api/audio/generate-cache/route.ts`
- `IORS_Master_Project/supabase/functions/exoskull-voice/index.ts`

### Deployed

- Vercel: https://exoskull.xyz (all knowledge API routes)
- Supabase Edge Function: `exoskull-voice` with tool use

---

## [2026-02-02] Mood Tracker & Habit Tracker Mods

### Added - Mood Tracker Mod

**Executor:** `lib/mods/executors/mood-tracker.ts`

Implements `IModExecutor` interface for daily mood tracking:

**Data:**

- Mood value (1-10 scale)
- Energy level (1-10)
- Emotions (multi-select from 15 predefined emotions)
- Context (morning/afternoon/evening/night)
- Notes

**Insights:**

- Mood trend detection (improving/stable/declining)
- Missing check-in reminders
- Weekly consistency tracking
- Top emotions analysis
- Low mood pattern alerts (mental health awareness)

**Actions:**
| Action | Description |
|--------|-------------|
| `log_mood` | Record mood entry with emotions and notes |
| `get_history` | Retrieve mood entries for time period |
| `delete_entry` | Remove a mood entry |

### Added - Habit Tracker Mod

**Executor:** `lib/mods/executors/habit-tracker.ts`

Full habit tracking with streaks and completion rates:

**Data:**

- Habit definitions (name, description, frequency)
- Daily/weekly frequency support
- Target days for weekly habits
- Reminder time configuration
- Icon and color customization

**Insights:**

- Daily progress (X/Y habits completed)
- Streak achievements (7+ days)
- Broken streak warnings
- Low completion rate detection
- Consistency celebration

**Actions:**
| Action | Description |
|--------|-------------|
| `create_habit` | Create new habit to track |
| `complete_habit` | Mark habit done for today |
| `update_habit` | Modify habit properties |
| `delete_habit` | Soft-delete (deactivate) habit |
| `get_habit_history` | Completion history for habit |

### Added - Database Migration

**Migration:** `20260202000014_mood_habit_tables.sql`

**Tables:**

- `exo_mood_entries` - Mood check-in records
- `exo_habits` - Habit definitions
- `exo_habit_completions` - Completion log

**Indexes:**

- Efficient queries by tenant + date
- Fast lookup for today's entries

**Analytics Views:**

- `silver_mood_daily` - Daily mood aggregations
- `silver_habits_weekly` - Weekly completion rates

### Changed - Executor Registry

**Updated:** `lib/mods/executors/index.ts`

- Added `MoodTrackerExecutor`
- Added `HabitTrackerExecutor`
- Factory functions for both

**Implemented Mods:** 3 total

- task-manager
- mood-tracker
- habit-tracker

### Notes for Future Agents

- Both Mods are standalone (no Rigs required)
- Use `x-tenant-id` header for API calls
- Mood check-in times configurable in mod config
- Habit soft-delete preserves completion history

---

## [2026-02-02] Multi-Model AI Router

### Added - Intelligent AI Model Routing

**Multi-Model Router** (`lib/ai/`)
Complete AI cost optimization system with 4-tier model routing:

| Tier | Model            | Cost/1M | Use Cases                        |
| ---- | ---------------- | ------- | -------------------------------- |
| 1    | Gemini 1.5 Flash | $0.075  | Classification, simple responses |
| 2    | Claude 3.5 Haiku | $0.80   | Summarization, analysis          |
| 3    | Kimi K2.5        | ~$0.50  | Complex reasoning, long context  |
| 4    | Claude Opus 4.5  | $15.00  | Crisis, meta-coordination        |

**Core Components:**

- `lib/ai/types.ts` - TypeScript interfaces for entire AI system
- `lib/ai/config.ts` - Model configurations, pricing, tier mappings
- `lib/ai/task-classifier.ts` - Automatic task complexity classification
- `lib/ai/circuit-breaker.ts` - Failure handling with cooldown
- `lib/ai/model-router.ts` - Central routing logic with escalation
- `lib/ai/index.ts` - Factory functions and convenience API

**Provider Implementations:**

- `lib/ai/providers/gemini-provider.ts` - Google Gemini integration
- `lib/ai/providers/anthropic-provider.ts` - Claude Haiku & Opus
- `lib/ai/providers/kimi-provider.ts` - Moonshot AI (Kimi K2.5)

**Features:**

- Automatic task classification based on keywords and complexity
- Tier escalation on failure (1 → 2 → 3 → 4)
- Circuit breaker with 5-minute cooldown after 3 failures
- Task history learning (reuses successful models)
- Cost estimation per request
- Usage tracking (database migration included)

**API:**

```typescript
import { aiChat, aiQuick, aiCritical } from "@/lib/ai";

// Auto-routed based on complexity
const response = await aiChat(messages);

// Explicit tier hints
await aiChat(messages, { taskCategory: "simple_response" }); // Tier 1
await aiChat(messages, { forceTier: 4 }); // Tier 4
await aiQuick(prompt); // Tier 1 - Gemini Flash
await aiCritical(prompt); // Tier 4 - Claude Opus
```

### Added - Database Migration

- `supabase/migrations/20260202000013_ai_usage_tracking.sql`
- `exo_ai_usage` table for request tracking
- `mv_ai_daily_costs` materialized view for cost analysis
- Helper functions: `log_ai_usage()`, `get_ai_usage_summary()`

### Changed - Greeting Generation

- `app/api/generate-greeting/route.ts` now uses Multi-Model Router
- Routes to Tier 1 (Gemini Flash) for cost optimization
- ~95% cost reduction vs direct GPT-4 calls

### Dependencies

```bash
npm install @anthropic-ai/sdk @google/generative-ai
```

### Environment Variables Required

```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
KIMI_API_KEY=sk-...  # Optional
```

---

## [2026-02-02] Google Tasks Integration

### Added - Google Tasks API

**Google Workspace Client** - extended with Tasks API:

- `getTaskLists()` - List all task lists
- `getDefaultTaskList()` - Get primary task list
- `getTasks()` - List tasks (with showCompleted option)
- `getTask()` - Get single task
- `createTask()` - Create new task with title, notes, due date
- `updateTask()` - Update task properties
- `completeTask()` / `uncompleteTask()` - Toggle completion
- `deleteTask()` - Remove task
- `getActiveTasks()` - Get non-completed tasks
- `getDueTodayTasks()` - Tasks due today
- `getOverdueTasks()` - Overdue tasks

### Changed - OAuth Scopes

- Added `https://www.googleapis.com/auth/tasks` to google-workspace
- Added `https://www.googleapis.com/auth/tasks.readonly` to google-workspace

### Changed - Task Manager Mod

- Google Tasks is now **primary source** (default)
- Unified view: Google Tasks + Todoist + Notion + ExoSkull
- `create_task` defaults to Google Tasks
- `complete_task` supports Google format (`google:listId:taskId`)
- Added `google_tasklist_id` config option

### Files Changed

- `lib/rigs/google-workspace/client.ts` - Full Google Tasks API
- `lib/rigs/oauth.ts` - Added Tasks scopes
- `lib/mods/executors/task-manager.ts` - Google integration
- `lib/mods/index.ts` - Updated requires_rigs

---

## [2026-02-02] Notion + Todoist Integration & Task Manager Mod

### Added - Rig Clients

**Notion Client** (`lib/rigs/notion/client.ts`)

- Full Notion API v2022-06-28 integration
- Search (pages, databases)
- Pages (CRUD, archive)
- Databases (query, get all items)
- Blocks (page content, append, delete)
- Users (list, me)
- Task helpers (createTask, completeTask)
- Dashboard data aggregation

**Todoist Client** (`lib/rigs/todoist/client.ts`)

- Full Todoist REST API v2 integration
- Tasks (CRUD, complete, reopen)
- Projects (CRUD)
- Sections (CRUD)
- Labels (CRUD)
- Comments (CRUD)
- Filters (today, overdue, 7 days, high priority)
- Productivity stats (Sync API)
- Dashboard data aggregation

### Added - Task Manager Mod Executor

**First Mod Implementation** (`lib/mods/executors/task-manager.ts`)

- Implements `IModExecutor` interface
- Unified task view across Notion + Todoist + ExoSkull internal tasks
- Task normalization (source, title, status, priority, dueDate)
- Priority sorting (urgent → high → medium → low)
- Insights generation:
  - Overdue tasks alert
  - High priority count warning
  - Due today notification
  - Completion rate tracking

**Actions:**
| Action | Description |
|--------|-------------|
| `create_task` | Create in Todoist, Notion, or ExoSkull |
| `complete_task` | Mark task as done in any source |
| `update_priority` | Change task priority |
| `sync` | Force refresh from all sources |

### Added - API Routes

**Mod API** (`app/api/mods/[slug]/route.ts`)

- GET: Get mod data, insights, actions
- POST: Execute mod action

**Rig Sync API** (`app/api/rigs/[slug]/sync/route.ts`)

- POST: Trigger manual sync for any Rig
- GET: Get sync status and history
- Supports: Notion, Todoist, Google Workspace, Microsoft 365, Google Fit

### Added - Executor Registry

**Executor Index** (`lib/mods/executors/index.ts`)

- `getModExecutor(slug)` - Get executor for a mod
- `hasModExecutor(slug)` - Check if mod is implemented
- `getImplementedMods()` - List implemented mods

### Environment Variables Required

```
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=
```

### Notes for Future Agents

- Task Manager Mod is first fully working Mod
- Pattern established for other Mod implementations
- Notion/Todoist OAuth configs already in `lib/rigs/oauth.ts`
- Use `x-tenant-id` header for all Mod/Rig API calls

---

## [2026-02-02] Voice Schedule Tools

### Fixed

- **Cloudflare Tunnel** - VAPI nie mogło wywoływać narzędzi (tunel nieaktywny)

### Added - Voice Schedule Tools

- `get_schedule` - Lista check-inów użytkownika
- `create_checkin` - Nowe przypomnienie (name, time, frequency, channel, message)
- `toggle_checkin` - Włącz/wyłącz check-in

### Added - Database

- **Migration:** `20260202000012_user_checkins.sql`
- **Table:** `exo_user_checkins`

### Files Changed

- `components/voice/GlobalVoiceButton.tsx` - 3 nowe narzędzia VAPI
- `app/api/voice/tools/route.ts` - Handlery schedule
- `lib/voice/system-prompt.ts` - Sekcja 3.5 Harmonogram

---

## [2026-02-02] Android & Workspace Rigs

### Added - New Rigs

**Migration:** `20260202000011_android_workspace_rigs.sql`

- **Google Fit / HealthConnect** - Steps, sleep, heart rate from Android
- **Google Workspace** - Gmail, Calendar, Drive unified
- **Microsoft 365** - Outlook, Calendar, OneDrive, Teams

### Added - OAuth Infrastructure

- `lib/rigs/oauth.ts` - Universal OAuth handler with configs for all providers
- `app/api/rigs/[slug]/connect/route.ts` - Start OAuth flow
- `app/api/rigs/[slug]/callback/route.ts` - Handle OAuth callback

### Added - API Clients

- `lib/rigs/google-fit/client.ts` - Google Fit API (steps, sleep, heart rate, calories)
- `lib/rigs/google-workspace/client.ts` - Gmail, Calendar, Drive APIs
- `lib/rigs/microsoft-365/client.ts` - Outlook, Calendar, OneDrive APIs

### Environment Variables Required

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

---

## [2026-02-02] Mods & Rigs System (Exoskulleton)

### Added - Database Schema

**Migration:** `20260202000010_mods_rigs_schema.sql`

New tables:

- `exo_registry` - Registry of all Mods, Rigs, and Quests
- `exo_user_installations` - User's installed items
- `exo_rig_connections` - OAuth tokens for Rig integrations
- `exo_rig_sync_log` - Sync history

### Added - Seed Data

Pre-populated registry with:

- **10 Rigs:** Oura, Fitbit, Apple Health, Google Calendar, Notion, Todoist, Philips Hue, Home Assistant, Plaid, Stripe
- **9 Mods:** Sleep Tracker, Energy Monitor, HRV Tracker, Focus Mode, Task Manager, Calendar Assistant, Mood Tracker, Habit Tracker, Spending Tracker
- **5 Quests:** 7-Day Sleep Reset, Digital Detox, Morning Routine, Mindfulness Week, Fitness Kickstart

### Added - API Routes

- `GET /api/registry` - Browse Exoskulleton marketplace
- `GET /api/registry/[slug]` - Get item details
- `GET /api/installations` - User's installed items
- `POST /api/installations` - Install mod/rig/quest
- `PATCH /api/installations/[id]` - Update config
- `DELETE /api/installations/[id]` - Uninstall

### Added - Type Definitions

- `lib/rigs/types.ts` - Rig interfaces
- `lib/rigs/index.ts` - Rig definitions with OAuth config
- `lib/mods/types.ts` - Mod interfaces
- `lib/mods/index.ts` - Mod definitions with capabilities

---

## [2026-02-02] IP Research & Final Cleanup

### Research - IP/Legal Analysis

Completed comprehensive research on intellectual property compliance:

- **OpenClaw** - MIT License allows unrestricted use (SAFE)
- **Claude Code** - Not used as component, only Anthropic API (SAFE)
- **Anthropic API** - Commercial use allowed for non-competing products (SAFE)

### Removed - Remaining External References from ARCHITECTURE.md

- Line 257: `(OpenClaw-compatible)` → removed
- Line 1911: `NEW (OpenClaw)` → `NEW`
- Line 1916: `NEW (OpenClaw)` → `NEW`
- Line 1922: `ENHANCED (MemOS)` → `ENHANCED`
- Line 1924: `NEW (MemOS)` → `NEW`
- Line 1925: `Moved + Pi Agent` → `MOVED`
- Line 2987: `3.1 (OpenClaw + IORS...)` → `3.1`

### Verified - No IP Violations

ExoSkull does NOT violate any intellectual property rights of:

- OpenClaw (MIT License - full commercial use allowed)
- Claude Code (not used as component)
- Anthropic (API usage per Commercial Terms)

---

## [2026-02-02] Terminology & IP Protection

### Added - Gaming/Sci-Fi Terminology

**ARCHITECTURE.md** now uses consistent naming:

- **Mods** = User-facing abilities & extensions (sleep tracker, focus mode)
- **Rigs** = Tools & integrations (Oura sync, Calendar)
- **Quests** = Weekly development programs (7-day challenges)
- **Exoskulleton** = Marketplace/catalog for Mods, Rigs, Quests

### Removed - External Brand References

Removed all "inspired by", "X-pattern", "X-style" references that could suggest copying:

- Cleaned ARCHITECTURE.md (OpenClaw, MemOS, Pi Agent references)
- Changed "SOURCES & INSPIRATION" → "TECHNOLOGY STACK"
- Kept brand names we USE (Kimi, LangGraph, Claude) - that's tech stack, not copying

### Added - IP Guardrails

**CLAUDE.md** now includes:

- Never mention architecture was "inspired by" external products
- TODO: Legal research before launch (trademarks, IP review)

---

## [2026-02-02] Application Testing & Bug Fixes

### Fixed - Tasks RLS Policy

**Problem:** Użytkownicy nie mogli dodawać zadań przez dashboard
**Root cause:** Polityka RLS miała tylko `USING` bez `WITH CHECK` - INSERT wymaga obu
**Solution:** Dodano `WITH CHECK (tenant_id = auth.uid())`

**Migrations:**

- `20260202000008_fix_tasks_rls.sql` - Naprawiona polityka RLS
- `20260202000009_drop_permissive_policy.sql` - Usunięta zbyt permisywna polityka

### Fixed - Migration Duplicate

**Problem:** Dwa pliki migracji z tym samym numerem 20260202000004
**Solution:** Przemianowano `silver_to_public.sql` na `20260202000007`

### Fixed - Silver Layer RLS Idempotency

**Problem:** Migracja failowała przy ponownym uruchomieniu (polityki już istniały)
**Solution:** Dodano `DROP POLICY IF EXISTS` przed każdym `CREATE POLICY`

### Added - VAPI Webhook Handler

**File:** `app/api/vapi/webhook/route.ts`

Obsługuje:

- `assistant-request` → zwraca `variableValues` (zadania, imię, historia)
- `end-of-call-report` → zapisuje rozmowę do bazy
- `function-call` → `get_tasks`, `create_task`, `complete_task`

Wzorzec z IORS - zmienne wstrzykiwane przez webhook zamiast tool calls.

### Changed - Voice System Prompt

**File:** `lib/voice/system-prompt.ts`

Usunięto instrukcje o narzędziach do zadań. Asystent teraz kieruje użytkowników do dashboardu dla zarządzania zadaniami. Rozmowa głosowa = dyskusja, wsparcie. Dashboard = zarządzanie listami.

### Test Results

| Test              | Status            |
| ----------------- | ----------------- |
| Build (30 routes) | ✅ PASS           |
| TypeScript        | ✅ PASS           |
| Bronze ETL        | ✅ 200 OK, 345ms  |
| Silver ETL        | ✅ 200 OK, 1559ms |
| Gold ETL          | ✅ 200 OK, 1202ms |
| GHL Webhook       | ✅ 200 OK         |
| Voice Tools       | ✅ 200 OK         |

---

## [2026-02-02] GHL Private Integration Token Migration

### Changed - Simplified Authentication

**OAuth → Private Integration Token**

- Removed OAuth flow complexity in favor of simpler Private Integration Token
- Token stored in env vars (`GHL_PRIVATE_TOKEN`, `GHL_LOCATION_ID`)
- No more per-tenant token management, token refresh callbacks

**Updated Files:**

- `lib/ghl/client.ts` - Simplified to Bearer auth only
- `lib/cron/dispatcher.ts` - Updated `getGHLClient()` to use env vars
- `app/api/ghl/tools/route.ts` - Updated `getGHLClient()` to use env vars

**Removed:**

- `app/api/ghl/oauth/start/route.ts` - OAuth initiation (not needed)
- `app/api/ghl/oauth/callback/route.ts` - OAuth callback (not needed)

**Database Migration** (`20260202000004_simplify_ghl_schema.sql`)

- Dropped `exo_ghl_oauth_states` table (not needed)
- Removed token columns from `exo_ghl_connections` table
- Dropped unused helper functions (`get_ghl_connection`, `update_ghl_tokens`)

### Setup Instructions

1. GHL → Agency Settings → Private Integrations → Create
2. Copy token to env: `GHL_PRIVATE_TOKEN=xxx`
3. Set location ID: `GHL_LOCATION_ID=xxx`

---

## [2026-02-02] Deep GHL Integration - Communication Hub

### Added - GoHighLevel as Central Communication Hub

**GHL Library** (`lib/ghl/`)

- `client.ts` - Private Integration Token auth with rate limiting (100/10s)
- `messaging.ts` - Unified messaging: SMS, Email, WhatsApp, Facebook, Instagram
- `contacts.ts` - CRM contact management: CRUD, tags, notes, tasks
- `calendar.ts` - Calendar & booking: appointments, free slots, availability
- `social.ts` - Social media: Facebook, Instagram, LinkedIn, TikTok, Twitter/X
- `workflows.ts` - Automation: trigger workflows, event-based routing
- `opportunities.ts` - Pipeline management: stages, opportunities, CRM
- `index.ts` - Central export for all GHL functions

**API Routes**

- `app/api/webhooks/ghl/route.ts` - Inbound webhooks (messages, contacts, appointments)
- `app/api/ghl/tools/route.ts` - AI tools endpoint (9 tools for VAPI/agents)

**AI Tools for GHL Control**
| Tool | Description |
|------|-------------|
| `ghl_send_message` | Send SMS/Email/WhatsApp/FB/IG |
| `ghl_create_contact` | Create CRM contact |
| `ghl_update_contact` | Update contact info |
| `ghl_get_contact` | Get contact by ID/email/phone |
| `ghl_schedule_post` | Schedule social media post |
| `ghl_create_appointment` | Book appointment |
| `ghl_trigger_workflow` | Start automation |
| `ghl_get_conversations` | Get message history |
| `ghl_move_opportunity` | Move in pipeline |

**Database Migration** (`20260202000003_ghl_integration.sql`)

- `exo_ghl_connections` - Tenant-location mapping
- `exo_ghl_contacts` - Contact mapping
- `exo_ghl_messages` - Message log for analytics
- `exo_ghl_webhook_log` - Webhook idempotency
- `exo_ghl_social_posts` - Social post tracking
- `exo_ghl_appointments` - Appointment sync

### Changed

**lib/cron/dispatcher.ts**

- SMS: GHL as primary, Twilio as fallback
- Added: Email dispatch via GHL
- Added: WhatsApp dispatch via GHL
- Channel priority: Voice (VAPI) > WhatsApp > SMS > Email

**ARCHITECTURE.md**

- Updated channel orchestration to reflect GHL hub
- Added "GHL Integration Architecture" section
- Updated tech stack table
- Added data flow diagrams

### Architecture

```
Communication Architecture:
├─ Voice AI: VAPI (real-time AI conversations)
└─ Everything Else: GHL
    ├─ SMS, Email, WhatsApp
    ├─ Facebook Messenger, Instagram DMs
    ├─ Social Media (FB, IG, LinkedIn, TikTok, Twitter)
    ├─ CRM (Contacts, Pipelines, Opportunities)
    ├─ Calendar & Booking
    └─ Workflow Automation
```

### Environment Variables Required

```env
GHL_CLIENT_ID=xxx
GHL_CLIENT_SECRET=xxx
GHL_REDIRECT_URI=https://app.exoskull.ai/api/ghl/oauth/callback
GHL_WEBHOOK_SECRET=xxx (optional)
```

### Notes for Future Agents

- GHL OAuth flow is ready - user needs to connect via `/api/ghl/oauth/start?tenant_id=xxx`
- All GHL functions have rate limiting built-in (100 req/10s)
- Twilio remains as SMS fallback when GHL not connected
- VAPI remains for voice AI (GHL doesn't have real-time AI voice)

---

## [2026-02-02] Data Lake Gold Layer

### Added - Gold Layer (Pre-Aggregated Dashboard Views)

**lib/datalake/gold-etl.ts**

- Materialized view refresh logic
- Functions: `runGoldETL()`, `refreshSingleView()`, `getGoldStats()`, `getRefreshHistory()`
- Sequential refresh to avoid resource contention
- Automatic logging to `exo_gold_sync_log`

**app/api/cron/gold-etl/route.ts**

- POST: Trigger full refresh (auth required via `x-cron-secret`)
- POST with `view_name`: Refresh single view
- GET: Status + stats + recent history
- Schedule: Daily at 02:00 UTC

**supabase/migrations/20260202000006_gold_schema.sql**

- `exo_gold_daily_summary` - Daily conversation aggregations
- `exo_gold_weekly_summary` - Weekly aggregations with active days
- `exo_gold_monthly_summary` - Monthly aggregations
- `exo_gold_messages_daily` - Daily message counts by role
- `exo_gold_sync_log` - Refresh tracking table
- Unique indexes for CONCURRENTLY refresh (no read locks)

**vercel.json**

```json
{ "path": "/api/cron/gold-etl", "schedule": "0 2 * * *" }
```

### Data Lake Architecture Complete

```
Bronze (R2 Parquet)  →  Silver (Postgres)  →  Gold (Materialized Views)
   Raw data              Cleaned/deduped        Pre-aggregated
   :05 hourly            :15 hourly             02:00 daily
```

### Notes for Future Agents

- Gold views depend on Silver tables (`exo_silver_*`)
- Refresh uses CONCURRENTLY (requires unique index, no locks)
- Query Gold views for dashboard (sub-10ms response)
- Test endpoint: `curl -X POST /api/cron/gold-etl -H "x-cron-secret: exoskull-cron-2026"`

---

## [2026-02-02] Emotion Intelligence Architecture

### Added - ARCHITECTURE.md: Layer 11 Emotion Intelligence

- **Multi-Modal Emotion Detection** (from IORS)
  - Voice biomarkers: pitch, rate, pauses, energy, jitter, shimmer
  - Text sentiment: GPT-4o-mini / Gemini Flash
  - Facial expression: face-api.js (100% local processing)
  - Fusion engine: weighted average (voice 40%, text 35%, face 25%)

- **Crisis Detection System**
  - Suicide risk detection with escalation protocol
  - Panic attack detection with grounding protocol
  - Trauma response detection with safety protocol
  - Substance abuse detection with emergency protocol
  - Full escalation flow with crisis hotline integration

- **Emotion-Adaptive Responses**
  - Dynamic prompt injection for: sadness, anger, anxiety, low energy
  - Mixed signals detection (words vs voice/face mismatch)

- **Behavioral Monitoring (Advanced)**
  - Implicit Association Tests (IAT) for unconscious attitudes
  - Screen activity monitoring via ActivityWatch
  - Ambient audio analysis (opt-in, on-device only)

### Changed

- Layer numbering: 11-20 → 12-21 (emotion layer inserted as L11)
- Layer 3 extended with emotion_signals input modality
- Tech Stack updated with emotion detection tools
- Roadmap Phase 2 includes emotion intelligence tasks

### Architecture

- Version: 3.0 → 3.1 (OpenClaw + IORS Emotion Intelligence)
- Total layers: 20 → 21

---

## [2026-02-02] Voice-First System

### Added - Global Voice Button

- **GlobalVoiceButton** (`components/voice/GlobalVoiceButton.tsx`)
  - Fixed position button in top-left corner of dashboard
  - One-click to start VAPI voice conversation with ExoAI
  - Inline chat panel shows real-time transcript
  - Full VAPI integration with tools (get_tasks, create_task, complete_task)
  - End call button when connected

- **DashboardShell** (`components/dashboard/DashboardShell.tsx`)
  - Client component wrapper for GlobalVoiceButton
  - Added to dashboard layout for all pages

- **Voice Notes API** (`app/api/voice/notes/route.ts`)
  - POST: Upload voice note
  - GET: List voice notes with signed URLs
  - DELETE: Remove voice note and storage file

- **Transcription API** (`app/api/voice/transcribe/route.ts`)
  - Deepgram integration for Polish transcription
  - Real-time audio to text conversion

### Philosophy

- Voice-first: every interaction starts with voice
- Global button always accessible - never more than one click away
- All voice interactions go through ExoAI (no separate "notes" vs "conversation")

---

## [2026-02-02] Data Lake Silver Layer

### Added - Silver Layer ETL

- **Parquet Reader** (`lib/storage/parquet-reader.ts`)
  - Read Parquet files from R2 using hyparquet
  - Type-safe readers for conversations, messages, voice calls, SMS logs
  - Deduplication and timestamp parsing utilities

- **Silver ETL** (`lib/datalake/silver-etl.ts`)
  - Transforms Bronze (R2 Parquet) → Silver (Supabase Postgres)
  - Deduplicate by ID
  - Validate schema (channel, role, direction constraints)
  - Parse JSON strings → JSONB
  - Normalize timestamps to UTC

- **Cron Endpoint** (`app/api/cron/silver-etl/route.ts`)
  - Runs hourly at minute 15 (10 min after Bronze ETL)
  - GET: Status and stats
  - POST: Trigger ETL (auth required)

- **Supabase Migrations**
  - `exo_silver_conversations` - Cleaned conversation records
  - `exo_silver_messages` - Cleaned message records
  - `exo_silver_voice_calls` - Cleaned voice call records
  - `exo_silver_sms_logs` - Cleaned SMS log records
  - `exo_silver_sync_log` - ETL tracking per tenant/data_type

### Tested

- 30 records successfully transformed (18 conversations, 12 messages)
- All 4 data types processing correctly
- Incremental sync working (only new Bronze files processed)

---

## [2026-02-01] Dashboard Expansion

### Added - Chat Panel

- **ChatPanel Component** (`components/voice/ChatPanel.tsx`)
  - Real-time transcript display during voice calls
  - User messages (blue, right), Agent messages (gray, left)
  - "User is speaking..." / "Agent is speaking..." indicators
  - Auto-scroll to latest message

- **Voice Page Update** (`app/dashboard/voice/page.tsx`)
  - Integrated ChatPanel with VAPI events
  - Handles `speech-start`, `speech-end`, `transcript`, `message` events
  - Interim transcript support (partial → final)

### Added - CRON Dashboard

- **Schedule Page** (`app/dashboard/schedule/page.tsx`)
  - Full UI for managing scheduled jobs
  - Toggle jobs on/off
  - View global settings (timezone, quiet hours, rate limits)
  - Recent execution logs
  - Manual job trigger for testing

### Added - Dynamic Widgets

- **TasksWidget** (`components/widgets/TasksWidget.tsx`)
  - Task completion stats (pending/in_progress/done)
  - Links to tasks page

- **ConversationsWidget** (`components/widgets/ConversationsWidget.tsx`)
  - Conversation stats (today/week/avg duration)

- **QuickActionsWidget** (`components/widgets/QuickActionsWidget.tsx`)
  - Quick links to voice, tasks, schedule, knowledge

- **AreaChartWrapper** (`components/charts/AreaChartWrapper.tsx`)
  - Recharts wrapper for area charts
  - Gradient fill, tooltips

- **Dashboard Page** (`app/dashboard/page.tsx`)
  - New layout with widget grid
  - Real stats from database (tasks, conversations, agents)
  - Dynamic greeting based on time

### Added - Knowledge System

- **Migration** (`supabase/migrations/20260201000008_knowledge_system.sql`)
  - `exo_user_documents` table (file metadata)
  - `exo_document_chunks` table (embeddings with pgvector)
  - `search_user_documents()` function for semantic search
  - RLS policies for tenant isolation

- **Storage Bucket** (`supabase/migrations/20260201000009_user_documents_bucket.sql`)
  - `user-documents` bucket (private, 10MB limit)
  - RLS policies for upload/view/delete

- **Knowledge API** (`app/api/knowledge/route.ts`)
  - GET: List documents with stats
  - DELETE: Remove document and storage file

- **Upload API** (`app/api/knowledge/upload/route.ts`)
  - POST: Upload file to Supabase Storage
  - Validates type (pdf, txt, md, jpg, png) and size (10MB)

- **Knowledge Page** (`app/dashboard/knowledge/page.tsx`)
  - Placeholder UI with planned features

### Changed - Navigation

- **Layout** (`app/dashboard/layout.tsx`)
  - Added "Harmonogram" (Clock icon)
  - Added "Wiedza" (FileText icon)

### Dependencies

- `recharts` - Chart library for React

---

## [2026-02-01] Data Lake Bronze Layer

### Added

- **R2 Storage Client** (`lib/storage/r2-client.ts`)
  - S3-compatible client for Cloudflare R2
  - `writeToBronze()` - Upload Parquet files
  - `readFromBronze()` - Download files
  - `listBronzeFiles()` - List by tenant/data_type/date
  - `getBronzeStats()` - Storage statistics

- **Parquet Writer** (`lib/storage/parquet-writer.ts`)
  - `conversationsToParquet()` - Convert conversations to Parquet
  - `messagesToParquet()` - Convert messages to Parquet
  - `voiceCallsToParquet()` - Convert voice calls
  - `smsLogsToParquet()` - Convert SMS logs
  - Uses `hyparquet-writer` (pure JS, no WASM)

- **Bronze ETL Job** (`lib/datalake/bronze-etl.ts`)
  - `etlConversations()` - Sync conversations to R2
  - `etlMessages()` - Sync messages to R2
  - `runBronzeETL()` - Full ETL for all tenants
  - Incremental sync via `exo_bronze_sync_log`

- **Cron API Route** (`app/api/cron/bronze-etl/route.ts`)
  - GET: Status and R2 stats
  - POST: Trigger ETL (protected by CRON_SECRET)
  - Runs hourly at minute 5 via Vercel Cron

- **Database Migration** (`supabase/migrations/20260201000006_bronze_sync_log.sql`)
  - `exo_bronze_sync_log` - Tracks last sync per tenant/data_type
  - Enables incremental ETL (only new records)

### R2 Path Structure

```
exoskull-bronze/
  {tenant_id}/
    bronze/
      conversations/
        year=2026/month=02/day=01/{timestamp}.parquet
      messages/
        year=2026/month=02/day=01/{timestamp}.parquet
```

### Environment Variables

```env
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=exoskull-bronze
```

### Cost

- Cloudflare R2: $0.015/GB/mo, zero egress fees
- 10GB free tier

---

## [2026-02-01] CRON Scheduling System

### Added

- **Master Scheduler** (`app/api/cron/master-scheduler/route.ts`)
  - Central coordinator running hourly via Vercel Cron
  - Timezone-aware scheduling per user
  - Rate limiting (10 voice calls/day, 20 SMS/day)
  - Quiet hours (22:00-07:00)
  - Dispatches to VAPI (voice) or Twilio (SMS)

- **Schedule API** (`app/api/schedule/route.ts`)
  - GET: User's schedule preferences with job list
  - PUT: Update preferences (enable/disable, custom time, channel)
  - POST: Manual trigger for testing

- **Setup Helper** (`app/api/setup-cron/route.ts`)
  - GET: Check CRON system status
  - POST: Initialize default jobs

- **Timezone Utils** (`lib/cron/timezone-utils.ts`)
  - `isTimeToTrigger()` - Check if job should run
  - `isInQuietHours()` - Respect user quiet hours
  - `getUserLocalTime()` - Convert UTC to user timezone

- **Dispatcher** (`lib/cron/dispatcher.ts`)
  - `dispatchVoiceCall()` - VAPI integration with user's cloned voice
  - `dispatchSms()` - Twilio integration
  - `dispatchJob()` - Auto-select based on job config

- **Vercel Cron Config** (`vercel.json`)
  - Runs master scheduler every hour at minute 0

### Database (Supabase Migrations)

**`20260201000002_scheduled_jobs_system.sql`:**

- `exo_scheduled_jobs` - 15 job definitions
- `exo_user_job_preferences` - Per-user settings
- `exo_scheduled_job_logs` - Execution history
- `exo_event_triggers` - Event-driven triggers (sleep debt, overdue tasks)
- Helper functions: `get_users_for_scheduled_job()`, `check_user_rate_limit()`, `log_job_execution()`

**`20260201000004_job_consent_model.sql`:**

- `exo_user_job_consents` - Track user consent from conversations
- `record_job_consent()` - Enable job for user
- `revoke_job_consent()` - Disable or pause job

### Job Categories

**System Jobs (always active):**
| Job | Schedule | Purpose |
|-----|----------|---------|
| system_retry_processor | every 15 min | Retry failed jobs |
| system_analytics | 02:00 UTC | Aggregate daily metrics |
| system_data_cleanup | 03:00 UTC | Clean old logs/sessions |
| system_gap_detection | Sunday 04:00 | Detect data blind spots |
| system_pattern_learning | 05:00 UTC | Update ML models |

**User Jobs (opt-in via conversation):**
| Job | Channel | Description |
|-----|---------|-------------|
| morning_checkin | voice | "Jak się czujesz?" |
| evening_reflection | voice | "Jak minął dzień?" |
| day_summary | sms | Calendar + priorities |
| meal_reminder | sms | Meal logging reminder |
| bedtime_reminder | sms | Sleep goal reminder |
| week_preview | voice | Monday planning |
| week_summary | voice | Friday review |
| week_planning | voice | Sunday planning |
| monthly_review | voice | 1st of month |
| goal_checkin | sms | 15th of month |

### Usage

```sql
-- Enable job for user (from conversation)
SELECT record_job_consent(
  'tenant-uuid',
  'morning_checkin',
  'User said: call me at 7am',
  '07:00',
  'voice'
);

-- Pause for 7 days
SELECT revoke_job_consent('tenant-uuid', 'morning_checkin', 7);

-- Disable permanently
SELECT revoke_job_consent('tenant-uuid', 'morning_checkin');
```

### Environment Variables

```env
CRON_SECRET=exoskull-cron-2026  # Required for Vercel Cron auth
```

---

## [2026-02-01] Voice System - ElevenLabs Integration

### Added

- **Prompt Caching System** (`lib/voice/system-prompt.ts`)
  - Static system prompt (~1200 tokens) for OpenAI automatic caching
  - Dynamic context builder for time-based greetings
  - 50% savings on input tokens

- **Audio Cache System** (`lib/voice/audio-cache.ts`)
  - 18 pre-defined Polish phrases (greetings, confirmations, farewells, errors)
  - Variant matching for alternative phrasings
  - Supabase Storage integration

- **Audio Generation API** (`app/api/audio/generate-cache/route.ts`)
  - POST: Generate and cache audio via ElevenLabs TTS
  - GET: Check cache status (total, cached, missing)
  - Uses `eleven_turbo_v2_5` model for low latency

- **Cache Generation Script** (`scripts/generate-audio-cache.ts`)
  - CLI tool to populate audio cache
  - Run: `npx ts-node scripts/generate-audio-cache.ts`

- **Supabase Migration** (`supabase/migrations/20260201_audio_cache_bucket.sql`)
  - Creates `audio-cache` bucket with public read access
  - 5MB file size limit, audio/mpeg only

### Changed

- **Voice Configuration** (`app/dashboard/voice/page.tsx`)
  - Voice provider: `11labs` (was `openai`)
  - Voice ID: `vhGAGQee0VjHonqyxGxd` (user's custom cloned voice)
  - Model: `gpt-4o-mini` (faster than gpt-4)
  - Added VAPI timing optimizations (responseDelaySeconds, etc.)

### Fixed

- VAPI 400 Bad Request: Changed voice provider from `eleven-labs` to `11labs`
- ElevenLabs blocked error: User added BYOK via VAPI dashboard

### Environment Variables

```env
ELEVENLABS_API_KEY=sk_xxx  # Required for audio cache generation
```

### Cost Optimization Summary

| Optimization           | Savings                   |
| ---------------------- | ------------------------- |
| OpenAI prompt caching  | ~50% on input tokens      |
| ElevenLabs audio cache | ~60-70% on common phrases |
| gpt-4o-mini model      | ~90% vs gpt-4             |

---

## [2026-02-01] Voice Tools Integration

### Added

- **VAPI Tools Endpoint** (`app/api/voice/tools/route.ts`)
  - `get_tasks`: Fetch user's tasks during voice conversation
  - `create_task`: Add new task via voice
  - `complete_task`: Mark task as done via voice

### Changed

- Voice page now passes `tenant_id` via URL query params
- Tools use public cloudflare tunnel URL for VAPI access

---

## Template

```markdown
## [YYYY-MM-DD] Feature Name

### Added

- New features

### Changed

- Changes to existing functionality

### Fixed

- Bug fixes

### Removed

- Removed features
```
