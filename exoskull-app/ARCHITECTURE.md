# Architecture: ExoSkull Dashboard

## Overview

ExoSkull's dashboard has **two view modes** selectable via toggle:

1. **Mind Map Workspace** (default) — NotebookLM-style three-panel layout with a 3D force-directed mind map (react-force-graph-3d), collapsible Sources + Studio panels, and a floating resizable chat. Sci-fi themed with Arwes CSS variables.

2. **Classic Cockpit** — Hybrid 3D + 2D cockpit built with React Three Fiber (R3F). The 3D scene (world orbs, synthwave grid, particles, bloom) serves as background. HTML/CSS cockpit HUD overlay at z=10 provides FPV game-style panels (Star Citizen / Elite Dangerous).

The backend (Agent SDK, Gateway, 63+ IORS tools) is shared between both views. Both views include a **CodeSidebar** (toggleable right panel with file browser + code viewer) that auto-opens when code tools modify files.

**Agent Config**: Web chat always uses `CODING_CONFIG` (25 turns, 120s timeout) with full VPS coding tools. Voice uses `VOICE_CONFIG` (6 turns, 40s). Async uses `ASYNC_CONFIG` (15 turns, 50s).

## Mind Map Workspace (`viewMode: "mindmap"`)

### Layout

```
┌─────────────┬──────────────────────┬──────────────┐
│ Sources     │   MindMap3D          │ Studio       │
│ (collapsible│   (force-graph-3d)   │ (collapsible)│
│  280px)     │                      │  320px)      │
│             │   ┌──────────────┐   │              │
│ - search    │   │ floating     │   │ - summaries  │
│ - upload    │   │ chat (resize)│   │ - notes      │
│ - URL import│   └──────────────┘   │ - export     │
└─────────────┴──────────────────────┴──────────────┘
```

### Components (`components/mindmap/`, `components/layout/`)

| File                              | Purpose                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceLayout.tsx`             | Three-panel layout with collapsible/resizable side panels, floating resizable chat (UnifiedStream) at bottom center   |
| `SourcesPanel.tsx`                | Knowledge docs from `/api/knowledge` (`exo_user_documents`). Upload, URL import, search, status badges                |
| `StudioPanel.tsx`                 | Three tabs: AI Summary (via `/api/chat/stream` SSE), Notes (textarea), Export (JSON/Markdown)                         |
| `MindMap3D.tsx`                   | Force-directed 3D graph. Dynamic import of `react-force-graph-3d`. Custom `nodeThreeObject` dispatches to 4 renderers |
| `NodeContextMenu.tsx`             | Right-click: expand/collapse, view details, change visual type (orb/image/model3d/card), attach 3D model              |
| `NodeDetailPanel.tsx`             | Slide-in panel with status badge, description, progress bar, tags, color, depth                                       |
| `ModelPicker.tsx`                 | Dialog with 3 tabs: Sketchfab search, file upload, URL. Grid thumbnails + confirm workflow                            |
| `node-renderers/OrbRenderer.ts`   | THREE.Mesh sphere + glow halo + label sprite                                                                          |
| `node-renderers/ImageRenderer.ts` | Billboard plane with texture + border frame                                                                           |
| `node-renderers/ModelRenderer.ts` | GLTFLoader with LRU cache (max 50). Placeholder while loading                                                         |
| `node-renderers/CardRenderer.ts`  | Canvas-rendered card with type badge, title, description, progress bar, tags                                          |

### Mind Map Data Flow

```
useOrbData() fetches /api/canvas/data/values?deep=true
  → OrbNode[] tree (values → loops → quests → missions → challenges → ops)
  → graph-converter.ts converts tree → flat { nodes: MindMapNode[], links: MindMapLink[] }
  → Only nodes in useMindMapStore.expandedNodes are included
  → react-force-graph-3d renders with custom nodeThreeObject callback
  → Click node: zoom camera + toggle expand + lazy load children
  → Right-click: NodeContextMenu (change visual, attach model, expand, details)
```

### State: `useMindMapStore` (Zustand)

| Field           | Type             | Purpose                           |
| --------------- | ---------------- | --------------------------------- |
| expandedNodes   | `Set<string>`    | Which nodes have visible children |
| focusedNodeId   | `string \| null` | Camera target node                |
| hoveredNodeId   | `string \| null` | Tooltip target                    |
| viewMode        | `'3d' \| '2d'`   | Graph dimension toggle            |
| filterQuery     | `string`         | Node search filter                |
| selectedSources | `string[]`       | Active knowledge sources          |

### Providers

| File                | Purpose                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ArwesProvider.tsx` | CSS variables wrapper: `--arwes-cyan`, `--arwes-violet`, `--arwes-dark`, `--arwes-glow`. Wraps entire app inside ThemeProvider |

### New API Routes

| Route                | Purpose                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/api/models/search` | Proxy for Sketchfab API. Query params: `q`, `maxVertices`. Hides API key, filters downloadable + CC license |

### Styles

| File                   | Purpose                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/mindmap.css`   | Node hover glow, tooltip, controls, expand animation, link particle glow                                                                                  |
| `styles/workspace.css` | Panel frames, Arwes border glow animation (`arwes-border-glow`), resize handles, corner accents (`arwes-corners`), responsive (stack at 768px), scrollbar |

---

## Classic Cockpit (`viewMode: "classic"`)

## Layered Z-Index Architecture

```
z-0   → R3F Canvas             (3D orbital scene, synthwave grid, particles, bloom)
z-10  → CockpitHUDShell        (2D HTML/CSS cockpit: panels, chat, gauges, top/bottom bars)
z-12  → ChannelOrbs            (floating channel indicators, top-right)
z-20  → OrbContextMenuOverlay  (right-click context menu for orb CRUD)
z-30  → ToolExecutionOverlay   (active tool indicator pill, top-center)
z-50  → CodeSidebar toggle     (code panel toggle button, top-right row)
z-50  → FloatingCallButton     (voice call, always accessible, bottom-right)
```

## Components

### 3D Scene (`components/3d/`)

| File                      | Purpose                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `CyberpunkScene.tsx`      | R3F `<Canvas>` wrapper. Dynamic import (no SSR). WebGL/mobile/reduced-motion detection with CSS fallback.    |
| `CyberpunkSceneInner.tsx` | Scene composition: grid + skybox + particles + orbital worlds + effects + postprocessing (no spatial panels) |
| `SynthwaveGrid.tsx`       | Infinite neon grid floor (custom ShaderMaterial, animated scroll)                                            |
| `Skybox.tsx`              | Stars + nebulae + atmospheric glow (purple/pink/cyan gradient)                                               |
| `Particles.tsx`           | Firefly-like floating particles (instancedMesh)                                                              |
| `OrbitalScene.tsx`        | Container for all world orbs — positions, camera targets, ephemeral threads                                  |
| `WorldOrb.tsx`            | Glowing sphere per life domain (fresnel emissive, orbiting moons, particle ring)                             |
| `GridRoad.tsx`            | Materializing grid tiles building path toward goal orbs                                                      |
| `EphemeralThread.tsx`     | Glowing connection lines between related worlds (drei `<Line>`)                                              |
| `SceneEffects.tsx`        | R3F component reacting to IORS activity (point light + ring, color-coded by effect type)                     |
| `ScenePostProcessing.tsx` | Bloom + ChromaticAberration + Vignette. Inline FPS monitor auto-disables expensive effects below 25 FPS.     |

### Cockpit HUD (`components/cockpit/`)

| File                   | Purpose                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `CockpitHUDShell.tsx`  | Simplified full-viewport layout. Floating chat + BottomPanelGrid + ActionBar.                |
| `BottomPanelGrid.tsx`  | NEW — 2x2 glass panels replacing wings/drawer layout                                         |
| `CockpitActionBar.tsx` | NEW — 5-cell bottom bar                                                                      |
| `ReactionButtons.tsx`  | NEW — Quick action overlay for common operations                                             |
| `CockpitTopBar.tsx`    | Status bar: clock (left), IORS status indicator (center), active tool name (right)           |
| `CockpitBottomBar.tsx` | Quick actions (left), input hint (center), 4 HUD gauges (right)                              |
| `HUDPanel.tsx`         | Reusable FUI panel frame with data fetch, normalize, skeleton/error states, click-to-preview |
| `HUDGauge.tsx`         | SVG segmented arc gauge (12 segments, 0-100%, animated fill)                                 |
| `LeftWing.tsx`         | @deprecated — replaced by BottomPanelGrid                                                    |
| `RightWing.tsx`        | @deprecated — replaced by BottomPanelGrid                                                    |
| `CenterViewport.tsx`   | Chat/Preview switcher — both layers always mounted, toggle via opacity                       |
| `PreviewPane.tsx`      | Detail view: email, task, document, calendar, activity, value — with type badges             |
| `ChannelOrbs.tsx`      | Floating channel indicators (Email, Telegram, Discord, SMS) — repositioned for new layout    |
| `OrbFormDialog.tsx`    | Modal for creating/editing orbs: name, color picker, description, priority                   |
| `OrbDeleteConfirm.tsx` | Red-accented delete confirmation dialog with safety warning                                  |

### 3D Context Menu (`components/3d/`)

| File                 | Purpose                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `OrbContextMenu.tsx` | Right-click context menu on orbs: "Dodaj dziecko", "Edytuj", "Usuń". Also OrbContextMenuOverlay orchestrator with form/delete dialogs |

### Dashboard Overlays (`components/dashboard/`)

| File                       | Purpose                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CyberpunkDashboard.tsx`   | Top-level layout — routes to WorkspaceLayout (mindmap) or CyberpunkScene+CockpitHUDShell (classic) based on `useCockpitStore.viewMode`                                               |
| `ToolExecutionOverlay.tsx` | Shows active tool name + elapsed time. Reads from `useSceneStore`.                                                                                                                   |
| `CodeSidebar.tsx`          | Toggleable 480px right panel: WorkspaceFileBrowser (top 35%) + CodePanel (bottom 65%). Auto-opens on file_change SSE. Toggle at z-50 `top-4 right-44`. State from `useCockpitStore`. |

### Deprecated (kept for reference)

| File                                            | Status                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `components/3d/SpatialPanel.tsx`                | @deprecated — replaced by HUDPanel                       |
| `components/3d/SpatialPanelLayout.tsx`          | @deprecated — replaced by CockpitHUDShell                |
| `components/3d/SpatialChat.tsx`                 | @deprecated — replaced by CenterViewport + UnifiedStream |
| `components/dashboard/ChatOverlay.tsx`          | @deprecated — replaced by CenterViewport                 |
| `components/dashboard/FloatingWidget.tsx`       | @deprecated — replaced by HUDPanel                       |
| `components/dashboard/WidgetOverlayManager.tsx` | @deprecated — replaced by wing components                |

### State Management

| Store                 | Location                            | Purpose                                                                                                                                                                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCockpitStore`     | `lib/stores/useCockpitStore.ts`     | Layout: viewMode, wing widths, centerMode, previewTarget, sections, collapsedPanels, orbContextMenu. Code sidebar: `codeSidebarOpen`, `lastChangedFile`, `toggleCodeSidebar()`, `notifyFileChange(path)` |
| `useMindMapStore`     | `lib/stores/useMindMapStore.ts`     | Mind map: expandedNodes, focusedNodeId, hoveredNodeId, viewMode (3d/2d), filterQuery, selectedSources                                                                                                    |
| `useSceneStore`       | `lib/stores/useSceneStore.ts`       | Bridges SSE tool events → 3D visual effects. SceneEffect types: idle, thinking, building, searching, executing.                                                                                          |
| `useSpatialChatStore` | `lib/stores/useSpatialChatStore.ts` | @deprecated — was used by SpatialChat. CenterViewport uses UnifiedStream directly.                                                                                                                       |
| `useInterfaceStore`   | `lib/stores/useInterfaceStore.ts`   | General UI state (existing, preserved)                                                                                                                                                                   |
| `useStreamState`      | `lib/hooks/useStreamState.ts`       | Chat state reducer (existing, 14 action types)                                                                                                                                                           |

### Hooks

| Hook              | Location                       | Purpose                                                                                              |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `useResizeHandle` | `lib/hooks/useResizeHandle.ts` | Custom drag-to-resize for cockpit columns (mousedown/move/up on document, RAF throttle)              |
| `useCockpitKeys`  | `lib/hooks/useCockpitKeys.ts`  | Keyboard shortcuts: Escape (close preview), Ctrl+1-6 (toggle panels), Ctrl+[/] (resize wings)        |
| `useOrbData`      | `lib/hooks/useOrbData.ts`      | Orb tree data (singleton). Mutations: addNode, removeNode, updateNode. Maps OrbNodeType→API endpoint |

### Shared Utilities

| File                                | Purpose                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `lib/cockpit/normalize-response.ts` | API response normalizer: flat arrays, `{items}`, `{documents}`, `{stats}`, `{summary}`, `{values}` → `{items: DataItem[]}` |
| `lib/cockpit/utils.ts`              | `stripMarkdown()`, `truncate()`, `relativeTime()`                                                                          |

### FUI Design System

| File                 | Purpose                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/cockpit.css` | CSS custom properties, `.hud-panel` frame (corner brackets, scanline overlay), resize handle styles, animations (panelSlideIn, skeletonPulse, indicatorPulse, scanSweep), status colors |

## Data Flow

### SSE → 3D Effects Bridge

```
User sends message
  → POST /api/chat/stream (Agent SDK + 63 IORS tools)
  → SSE stream events: tool_start, tool_end, text, file_change, done
  → UnifiedStream reads SSE events
  → useSceneStore.startTool(toolName) / endTool()
  → SceneEffects.tsx reads store via useFrame → animates light color, ring opacity, bloom pulse
  → ToolExecutionOverlay.tsx shows/hides active tool pill
  → CockpitTopBar shows active tool name + IORS status

  File change path (code_write_file / code_edit_file):
  → Tool returns __SSE__{"type":"file_change","filePath":"...","operation":"write|edit"}__SSE__result
  → extractSSEDirective() splits SSE event from clean result
  → Agent loop emits file_change SSE event to client
  → UnifiedStream case "file_change" → useCockpitStore.notifyFileChange(filePath)
  → CodeSidebar auto-opens, selects + highlights modified file
```

### Cockpit Data Loading

```
CockpitHUDShell mounts
  → LeftWing renders 3 HUDPanels (Tasks, Activity, Email)
  → RightWing renders 3 HUDPanels (Calendar, Values, Knowledge)
  → Each HUDPanel auto-fetches from its endpoint
  → normalizeResponse() converts API shape → { items: DataItem[] }
  → Items render with panel-specific renderItem + toPreview
  → Click item → useCockpitStore.openPreview(target) → CenterViewport switches to PreviewPane
  → CockpitBottomBar fetches system-health + tasks + emails → 4 HUDGauges
```

### Preview Lifecycle

```
Click item in any wing panel
  → toPreview(item) creates PreviewTarget { type, id, title, data }
  → useCockpitStore.openPreview(target) sets centerMode='preview'
  → CenterViewport: chat layer opacity→0, preview layer opacity→1
  → PreviewPane renders type-specific view (email fields, task status, document text, etc.)
  → Escape key or Back button → closePreview() → centerMode='chat'
  → Chat layer opacity→1, scroll position preserved (never unmounted)
```

### Effect Color Mapping

| Effect    | Color                 | Trigger                                |
| --------- | --------------------- | -------------------------------------- |
| idle      | cyan (#00d4ff)        | Default / after tool_end               |
| thinking  | violet (#8b5cf6)      | Before SSE fetch                       |
| building  | amber (#f59e0b)       | Tools with "build" or "app" in name    |
| searching | bright cyan (#06b6d4) | Tools with "search" or "fetch" in name |
| executing | emerald (#10b981)     | All other tools                        |

## Progressive Degradation

```
1. hasWebGL() check (canvas.getContext("webgl2") || "webgl")
2. Mobile check (window.innerWidth < 768)
3. prefers-reduced-motion check
→ Any failure: render StaticBackground (CSS gradient + star radials)
→ FPS < 25: auto-disable ChromaticAberration post-processing
→ FPS > 35: re-enable
```

## Key Technical Decisions

- **2D HUD over 3D scene** — HTML/CSS gives full layout control, resizability, and accessibility. 3D panels (drei `<Html>`) had Tailwind issues, no resizing, poor text rendering
- **CSS Grid cockpit layout** — 5 columns (left wing, resize, center, resize, right wing) × 3 rows (top bar, main, bottom bar). Native CSS, no layout library
- **Both chat + preview always mounted** — Opacity toggle preserves SSE connection, scroll position, no remount cost
- **UnifiedStream in normal mode** — Full chat with message history in center viewport (not spatialMode which hides history)
- **Custom resize hook** — Pointer events on document, RAF throttle, clamped min/max. No external resize library needed
- **FUI panel CSS** — Corner bracket pseudo-elements, scanline overlay, accent color via `--hud-accent` custom property
- **localStorage wing widths** — Persisted across sessions, defaults to 260px
- **Zustand `.getState()` inside useFrame** — Avoids React re-renders in hot animation loop
- **EffectComposer children cannot be conditional** — Use prop-based disable (zero offset) instead of `{condition && <Effect>}`
- **drei `<Line>` for connection threads** — Raw `<line>` JSX conflicts with SVG namespace in TypeScript

## API Endpoints (Panel Data)

| Panel         | Endpoint                             | Response Shape                                                 |
| ------------- | ------------------------------------ | -------------------------------------------------------------- |
| Tasks         | `/api/canvas/data/tasks`             | `{ stats: { pending, in_progress, done, total }, series: [] }` |
| IORS Activity | `/api/canvas/activity-feed?limit=15` | `[{ action_type, action_name, description, status, ... }]`     |
| Email         | `/api/canvas/data/emails`            | `{ summary: { unread, urgent, ... }, urgentEmails: [...] }`    |
| Calendar      | `/api/canvas/data/calendar`          | `{ items: CalendarItem[] }`                                    |
| Values/Plan   | `/api/canvas/data/values?deep=true`  | `{ values: [{ loops: [{ quests: [...] }] }] }`                 |
| Knowledge     | `/api/knowledge`                     | `{ documents: [...], stats: { total_documents, ... } }`        |
| System Health | `/api/canvas/data/system-health`     | `{ overall_status, subsystems, alerts }`                       |

## Packages

| Package                       | Version  | Purpose                                       |
| ----------------------------- | -------- | --------------------------------------------- |
| `three`                       | 0.182.0  | 3D engine                                     |
| `@react-three/fiber`          | ^8.17.0  | React renderer for Three.js                   |
| `@react-three/drei`           | ^9.117.0 | R3F helpers (OrbitControls, Html, Line, etc.) |
| `@react-three/postprocessing` | ^2.16.0  | Bloom, ChromaticAberration, Vignette          |
| `@react-three/uikit`          | ^0.13.2  | 3D UI components for R3F                      |
| `react-force-graph-3d`        | ^1.29.1  | Force-directed 3D graph (MindMap3D)           |
| `arwes` + `@arwes/*`          | ^1.0.0   | Sci-fi UI framework (CSS variables only)      |
| `zustand`                     | ^5.0.0   | State management                              |
| `lucide-react`                | ^0.474.0 | Icon components                               |

## Entry Point

```
app/dashboard/page.tsx
  → CyberpunkDashboard (tenantId)
    → IF viewMode === "mindmap":
      → WorkspaceLayout (tenantId)
        → SourcesPanel (left, collapsible 280px)
        → MindMap3D (center, force-directed 3D graph)
          → NodeContextMenu (right-click overlay)
          → NodeDetailPanel (slide-in detail)
          → ModelPicker (3D model dialog)
        → UnifiedStream (floating bottom, resizable 120-600px)
        → StudioPanel (right, collapsible 320px)
      → CodeSidebar (z-30 panel, z-50 toggle button)
      → View toggle button ("Classic")
      → FloatingCallButton (z-50)

    → IF viewMode === "classic":
      → CyberpunkScene (z-0)
        → CyberpunkSceneInner
          → SynthwaveGrid, Skybox, Particles, OrbitalScene, SceneEffects, ScenePostProcessing
      → CockpitHUDShell (z-10)
        → CockpitTopBar, LeftWing, CenterViewport (UnifiedStream + PreviewPane), RightWing, CockpitBottomBar, ChannelOrbs
      → CodeSidebar (z-30 panel, z-50 toggle button)
      → ToolExecutionOverlay (z-30)
      → View toggle button ("Mind Map")
      → FloatingCallButton (z-50)
```

## Knowledge API (Orb CRUD)

| Type      | Endpoint                    | Methods               | ID Field    |
| --------- | --------------------------- | --------------------- | ----------- |
| Value     | `/api/knowledge/values`     | GET/POST/PATCH/DELETE | `valueId`   |
| Loop      | `/api/knowledge/loops`      | GET/POST/PATCH/DELETE | `loopId`    |
| Quest     | `/api/knowledge/quests`     | GET/POST/PATCH/DELETE | `questId`   |
| Mission   | `/api/knowledge/missions`   | GET/POST/PATCH/DELETE | `id` (body) |
| Challenge | `/api/knowledge/challenges` | GET/POST/PATCH/DELETE | `id` (body) |
| Op        | `/api/knowledge/ops`        | GET/POST/PATCH/DELETE | `opId`      |

DELETE: values/loops/quests/ops use query params; missions/challenges use request body.
All routes use `verifyTenantAuth` for authentication.

## Future Work (Not Yet Implemented)

- **Database-driven worlds**: `exo_world_positions` + `exo_world_moons` tables (currently demo hardcoded data)
- **World co-creation**: IORS discovers life domains through conversation, suggests creating worlds
- **Hashtag tagging system**: Items tagged with world names (#zdrowie, #praca) to auto-organize into orbs
- **Command palette**: Visual /command autocomplete as floating orb radial menu
- **Model indicator**: Badge showing which AI model is responding (Gemini/Codex/Opus)
- **Inline image generation**: NanoBanana / AI Studio Gemini integration in chat
- **Quick action dispatch**: Bottom bar buttons dispatch commands to UnifiedStream input
- **Real-time panel refresh**: WebSocket or polling for live data updates in wing panels
- **Mind map persistence**: ~~Save node visual types, model URLs~~ — DONE (visual_type, model_url, thumbnail_url columns + API + UI wired). Expanded state not yet persisted.
- **Sketchfab download + R2 cache**: Download glTF from Sketchfab, cache on Cloudflare R2 (API route placeholder exists)
- **LOD for mind map**: Distant nodes → simple sphere, close → full detail. Max 200 visible nodes
- **Web Worker for force simulation**: Offload physics to worker for better frame rate
- **RichContentCard integration**: Wire into StreamEventRouter for inline rich media in chat
- **Sound effects**: Arwes-style subtle bleeps on hover/click in mind map
