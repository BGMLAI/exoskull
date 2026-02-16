# Architecture: ExoSkull Dashboard

## Overview

ExoSkull's dashboard is a **hybrid 3D + 2D cockpit** built with React Three Fiber (R3F) on Next.js 14. The 3D scene (world orbs, synthwave grid, particles, bloom) serves as the background atmosphere. A pure HTML/CSS cockpit HUD overlay renders on top at z=10, providing FPV game-style panels (Star Citizen / Elite Dangerous). The backend (Agent SDK, Gateway, 63+ IORS tools) is unchanged — this is a frontend architecture.

## Layered Z-Index Architecture

```
z-0   → R3F Canvas             (3D orbital scene, synthwave grid, particles, bloom)
z-10  → CockpitHUDShell        (2D HTML/CSS cockpit: panels, chat, gauges, top/bottom bars)
z-12  → ChannelOrbs            (floating channel indicators, top-right)
z-20  → OrbContextMenuOverlay  (right-click context menu for orb CRUD)
z-30  → ToolExecutionOverlay   (active tool indicator pill, top-center)
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

| File                   | Purpose                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `CockpitHUDShell.tsx`  | Master CSS Grid layout (5-col × 3-row). Composes all cockpit pieces. Initializes keyboard shortcuts. |
| `CockpitTopBar.tsx`    | Status bar: clock (left), IORS status indicator (center), active tool name (right)                   |
| `CockpitBottomBar.tsx` | Quick actions (left), input hint (center), 4 HUD gauges (right)                                      |
| `HUDPanel.tsx`         | Reusable FUI panel frame with data fetch, normalize, skeleton/error states, click-to-preview         |
| `HUDGauge.tsx`         | SVG segmented arc gauge (12 segments, 0-100%, animated fill)                                         |
| `LeftWing.tsx`         | Left column: Tasks (#3b82f6), IORS Activity (#8b5cf6), Email (#06b6d4)                               |
| `RightWing.tsx`        | Right column: Calendar (#f59e0b), Values/Plan (#f59e0b), Knowledge (#10b981)                         |
| `CenterViewport.tsx`   | Chat/Preview switcher — both layers always mounted, toggle via opacity                               |
| `PreviewPane.tsx`      | Detail view: email, task, document, calendar, activity, value — with type badges                     |
| `ChannelOrbs.tsx`      | Floating channel indicators (Email, Telegram, Discord, SMS) with hover glow                          |
| `OrbFormDialog.tsx`    | Modal for creating/editing orbs: name, color picker, description, priority                           |
| `OrbDeleteConfirm.tsx` | Red-accented delete confirmation dialog with safety warning                                          |

### 3D Context Menu (`components/3d/`)

| File                 | Purpose                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `OrbContextMenu.tsx` | Right-click context menu on orbs: "Dodaj dziecko", "Edytuj", "Usuń". Also OrbContextMenuOverlay orchestrator with form/delete dialogs |

### Dashboard Overlays (`components/dashboard/`)

| File                       | Purpose                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CyberpunkDashboard.tsx`   | Top-level layout — composes 3D scene (z-0) + CockpitHUDShell (z-10) + ToolExecutionOverlay (z-30) + FloatingCallButton (z-50) |
| `ToolExecutionOverlay.tsx` | Shows active tool name + elapsed time. Reads from `useSceneStore`.                                                            |

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

| Store                 | Location                            | Purpose                                                                                                                                       |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCockpitStore`     | `lib/stores/useCockpitStore.ts`     | Cockpit layout: wing widths (persisted), centerMode (chat/preview), previewTarget, sections, collapsedPanels, selectedWorldId, orbContextMenu |
| `useSceneStore`       | `lib/stores/useSceneStore.ts`       | Bridges SSE tool events → 3D visual effects. SceneEffect types: idle, thinking, building, searching, executing.                               |
| `useSpatialChatStore` | `lib/stores/useSpatialChatStore.ts` | @deprecated — was used by SpatialChat. CenterViewport uses UnifiedStream directly.                                                            |
| `useInterfaceStore`   | `lib/stores/useInterfaceStore.ts`   | General UI state (existing, preserved)                                                                                                        |
| `useStreamState`      | `lib/hooks/useStreamState.ts`       | Chat state reducer (existing, 14 action types)                                                                                                |

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
  → SSE stream events: tool_start, tool_end, text, done
  → UnifiedStream reads SSE events
  → useSceneStore.startTool(toolName) / endTool()
  → SceneEffects.tsx reads store via useFrame → animates light color, ring opacity, bloom pulse
  → ToolExecutionOverlay.tsx shows/hides active tool pill
  → CockpitTopBar shows active tool name + IORS status
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
| `zustand`                     | ^5.0.0   | State management                              |
| `lucide-react`                | ^0.474.0 | Icon components                               |

## Entry Point

```
app/dashboard/page.tsx
  → CyberpunkDashboard (tenantId)
    → CyberpunkScene (z-0)
      → CyberpunkSceneInner
        → SynthwaveGrid, Skybox, Particles, OrbitalScene, SceneEffects, ScenePostProcessing
    → CockpitHUDShell (z-10)
      → CockpitTopBar (clock, IORS status, active tool)
      → LeftWing (Tasks, IORS, Email panels)
      → ResizeHandle × 2
      → CenterViewport
        → UnifiedStream (chat, always mounted)
        → PreviewPane (detail view, opacity toggle)
      → RightWing (Calendar, Values, Knowledge panels)
      → CockpitBottomBar (quick actions, gauges)
      → ChannelOrbs (z-12, floating)
    → ToolExecutionOverlay (z-30)
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
