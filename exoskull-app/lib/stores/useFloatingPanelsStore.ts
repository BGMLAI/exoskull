import { create } from "zustand";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

export type PanelId =
  | "chat"
  | "tasks"
  | "calendar"
  | "knowledge"
  | "email"
  | "node-detail";

interface PanelState {
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  zIndex: number;
}

interface FloatingPanelsStore {
  panels: Record<string, PanelState>;
  topZ: number;
  /** Node selected in MindMap3D — consumed by node-detail floating panel */
  selectedNode: MindMapNode | null;
  openPanel: (id: PanelId, defaults?: Partial<PanelState>) => void;
  closePanel: (id: PanelId) => void;
  minimizePanel: (id: PanelId) => void;
  restorePanel: (id: PanelId) => void;
  focusPanel: (id: PanelId) => void;
  updatePanel: (id: PanelId, update: Partial<PanelState>) => void;
  isOpen: (id: PanelId) => boolean;
  setSelectedNode: (node: MindMapNode | null) => void;
}

// Default positions for each panel type
// Use safe fallbacks for SSR (window may not exist)
const getDefaults = (): Record<PanelId, PanelState> => {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  return {
    chat: { x: vw - 420, y: 60, w: 400, h: 500, minimized: false, zIndex: 10 },
    tasks: { x: 20, y: 60, w: 320, h: 400, minimized: false, zIndex: 10 },
    calendar: { x: 20, y: 480, w: 320, h: 300, minimized: false, zIndex: 10 },
    knowledge: { x: 360, y: 60, w: 320, h: 400, minimized: false, zIndex: 10 },
    email: { x: 360, y: 480, w: 320, h: 300, minimized: false, zIndex: 10 },
    "node-detail": {
      x: 400,
      y: 100,
      w: 360,
      h: 450,
      minimized: false,
      zIndex: 10,
    },
  };
};

function loadFromStorage(): Record<string, PanelState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("exo-floating-panels");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PanelState>;
    // Clamp positions to viewport so panels are never offscreen after a resize
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const id of Object.keys(parsed)) {
      const p = parsed[id];
      if (p.x + p.w > vw) p.x = Math.max(0, vw - p.w);
      if (p.y + p.h > vh) p.y = Math.max(0, vh - p.h);
      if (p.x < 0) p.x = 0;
      if (p.y < 0) p.y = 0;
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveToStorage(panels: Record<string, PanelState>) {
  try {
    localStorage.setItem("exo-floating-panels", JSON.stringify(panels));
  } catch {
    // localStorage may be unavailable in some contexts — silent fail is acceptable
  }
}

export const useFloatingPanelsStore = create<FloatingPanelsStore>(
  (set, get) => ({
    panels: loadFromStorage(),
    topZ: 10,
    selectedNode: null,

    openPanel: (id, defaults) =>
      set((s) => {
        const PANEL_DEFAULTS = getDefaults();
        const def = { ...PANEL_DEFAULTS[id], ...defaults };
        const topZ = s.topZ + 1;
        const panels = { ...s.panels, [id]: { ...def, zIndex: topZ } };
        saveToStorage(panels);
        return { panels, topZ };
      }),

    closePanel: (id) =>
      set((s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...rest } = s.panels;
        saveToStorage(rest);
        return { panels: rest };
      }),

    minimizePanel: (id) =>
      set((s) => {
        if (!s.panels[id]) return s;
        const panels = {
          ...s.panels,
          [id]: { ...s.panels[id], minimized: true },
        };
        saveToStorage(panels);
        return { panels };
      }),

    restorePanel: (id) =>
      set((s) => {
        if (!s.panels[id]) return s;
        const topZ = s.topZ + 1;
        const panels = {
          ...s.panels,
          [id]: { ...s.panels[id], minimized: false, zIndex: topZ },
        };
        saveToStorage(panels);
        return { panels, topZ };
      }),

    focusPanel: (id) =>
      set((s) => {
        if (!s.panels[id]) return s;
        const topZ = s.topZ + 1;
        const panels = { ...s.panels, [id]: { ...s.panels[id], zIndex: topZ } };
        return { panels, topZ };
      }),

    updatePanel: (id, update) =>
      set((s) => {
        if (!s.panels[id]) return s;
        const panels = { ...s.panels, [id]: { ...s.panels[id], ...update } };
        saveToStorage(panels);
        return { panels };
      }),

    isOpen: (id) => !!get().panels[id],

    setSelectedNode: (node) => set({ selectedNode: node }),
  }),
);
