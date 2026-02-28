"use client";

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Widget HUD types
// ---------------------------------------------------------------------------

export type WidgetZone =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface HUDWidgetConfig {
  id: string;
  /** API endpoint to fetch data from (e.g. "/api/canvas/data/health") */
  endpoint: string;
  /** Display title */
  title: string;
  /** Icon name from lucide */
  icon: string;
  /** Screen zone */
  zone: WidgetZone;
  /** Widget size */
  size: "sm" | "md";
  /** Is it minimized? */
  minimized: boolean;
  /** Associated hashtag filter (optional) */
  hashtag?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SpatialState {
  chatExpanded: boolean;
  commandPaletteOpen: boolean;
  activeHashtag: string | null;
  is3DMode: boolean;

  // Widget HUD
  widgets: HUDWidgetConfig[];
  widgetHudVisible: boolean;

  // Actions
  toggleChat: () => void;
  setChatExpanded: (v: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setActiveHashtag: (tag: string | null) => void;
  toggleHashtag: (tag: string) => void;
  toggle3DMode: () => void;

  // Widget actions
  addWidget: (w: HUDWidgetConfig) => void;
  removeWidget: (id: string) => void;
  toggleWidgetMinimized: (id: string) => void;
  moveWidget: (id: string, zone: WidgetZone) => void;
  setWidgetHudVisible: (v: boolean) => void;
  toggleWidgetHud: () => void;
}

// Default widgets shown on first load
const DEFAULT_WIDGETS: HUDWidgetConfig[] = [
  {
    id: "goals",
    endpoint: "/api/canvas/data/tasks",
    title: "Cele",
    icon: "Target",
    zone: "top-right",
    size: "sm",
    minimized: false,
    hashtag: "cele",
  },
  {
    id: "health",
    endpoint: "/api/canvas/data/health",
    title: "Zdrowie",
    icon: "Heart",
    zone: "bottom-right",
    size: "sm",
    minimized: false,
    hashtag: "zdrowie",
  },
];

export const useSpatialStore = create<SpatialState>((set) => ({
  chatExpanded: true,
  commandPaletteOpen: false,
  activeHashtag: null,
  is3DMode: true,

  // Widget HUD
  widgets: DEFAULT_WIDGETS,
  widgetHudVisible: true,

  toggleChat: () => set((s) => ({ chatExpanded: !s.chatExpanded })),
  setChatExpanded: (v) => set({ chatExpanded: v }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setActiveHashtag: (tag) => set({ activeHashtag: tag }),
  toggleHashtag: (tag) =>
    set((s) => ({
      activeHashtag: s.activeHashtag === tag ? null : tag,
    })),
  toggle3DMode: () => set((s) => ({ is3DMode: !s.is3DMode })),

  // Widget actions
  addWidget: (w) => set((s) => ({ widgets: [...s.widgets, w] })),
  removeWidget: (id) =>
    set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
  toggleWidgetMinimized: (id) =>
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized } : w,
      ),
    })),
  moveWidget: (id, zone) =>
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, zone } : w)),
    })),
  setWidgetHudVisible: (v) => set({ widgetHudVisible: v }),
  toggleWidgetHud: () =>
    set((s) => ({ widgetHudVisible: !s.widgetHudVisible })),
}));
