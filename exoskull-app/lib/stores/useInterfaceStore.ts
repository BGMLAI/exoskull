/**
 * Interface State Store — TAU Dual Interface
 *
 * Manages the split-panel layout: Consciousness Stream <-> 6 Worlds Graph.
 * Both panels are ALWAYS visible — only their proportions change (splitRatio).
 *
 * No "modes" — the stream and graph interpenetrate via a resizable splitter.
 *
 * Layout:
 * ┌──────────────────┬─────────────────────┐
 * │  Consciousness   │     6 Worlds        │
 * │    Stream         │      Graph          │
 * │  (chat + forge)  │   (poles + trees)   │
 * │                  ║                     │
 * │   splitRatio →   ║   ← (1-splitRatio)  │
 * └──────────────────┴─────────────────────┘
 */

import { create } from "zustand";

// ─── World IDs ─────────────────────────────────────────────────────────────────

export type WorldId =
  | "human-external" // Mój Zewnętrzny — plany, wyzwania, emails, telefony
  | "human-internal" // Mój Wewnętrzny — wiedza, historia, pliki, wspomnienia
  | "iors-known" //     IORS Znany — skills, APIs, tools, frameworki
  | "iors-unknown" //   IORS Nieznany — świat fizyczny, przyszłość
  | "shared-internal" // Wspólny Wewnętrzny — to co obaj znamy
  | "shared-external"; // Wspólny Zewnętrzny — pożądany świat przyszłości

export const WORLD_COLORS: Record<WorldId, string> = {
  "human-external": "#F59E0B", // Amber
  "human-internal": "#10B981", // Emerald
  "iors-known": "#8B5CF6", // Violet
  "iors-unknown": "#3B82F6", // Blue
  "shared-internal": "#EC4899", // Rose
  "shared-external": "#06B6D4", // Cyan
};

// ─── IORS Activity ─────────────────────────────────────────────────────────────

export type IorsActivity = "idle" | "thinking" | "building" | "researching";

/** Tabs available inside the Consciousness Stream panel */
export type StreamTab = "chat" | "forge" | "preview";

// ─── Focused Node ──────────────────────────────────────────────────────────────

/** Which node in the graph is currently focused/selected */
export interface FocusedNode {
  id: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
}

// ─── Split Ratio Constants ─────────────────────────────────────────────────────

/** Minimum ratio — stream collapsed, graph dominant */
export const SPLIT_MIN = 1 / 6; // ~0.167
/** Maximum ratio — stream dominant, graph collapsed */
export const SPLIT_MAX = 5 / 6; // ~0.833
/** Default ratio — even split */
export const SPLIT_DEFAULT = 0.5;
/** Presets for Ctrl+\ cycling: stream-focused → balanced → graph-focused */
export const SPLIT_PRESETS = [SPLIT_MAX, SPLIT_DEFAULT, SPLIT_MIN] as const;

// ─── Store Interface ───────────────────────────────────────────────────────────

interface InterfaceState {
  /** Proportion of width given to the Stream panel (0.167–0.833) */
  splitRatio: number;
  /** Which world is being actively explored in the graph */
  activeWorld: WorldId | null;
  /** What IORS is currently doing */
  iorsActivity: IorsActivity;
  /** Whether the Forge tab is visible inside the Stream panel */
  forgeVisible: boolean;
  /** Currently focused node in the graph */
  focusedNode: FocusedNode | null;
  /** Active tab in the Consciousness Stream panel */
  activeStreamTab: StreamTab;
  /** Search/filter query applied to the graph */
  graphFilter: string;
  /** Depth level of the tree being viewed */
  graphDepth: number;

  // ─── Actions ───────────────────────────────────────────────────────────

  /** Set split ratio (clamped to SPLIT_MIN..SPLIT_MAX) */
  setSplitRatio: (ratio: number) => void;
  /** Expand stream panel to dominant (5/6) */
  expandStream: () => void;
  /** Expand graph panel to dominant (stream = 1/6) */
  expandGraph: () => void;
  /** Reset to even 50/50 split */
  resetSplit: () => void;
  /** Cycle through SPLIT_PRESETS (for Ctrl+\ shortcut) */
  cycleSplitPreset: () => void;

  setActiveWorld: (world: WorldId | null) => void;
  setIorsActivity: (activity: IorsActivity) => void;
  setForgeVisible: (visible: boolean) => void;
  setActiveStreamTab: (tab: StreamTab) => void;
  setFocusedNode: (node: FocusedNode | null) => void;
  setGraphFilter: (filter: string) => void;
  setGraphDepth: (depth: number) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clampRatio(ratio: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ratio));
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useInterfaceStore = create<InterfaceState>((set, get) => ({
  splitRatio: SPLIT_MAX, // Start stream-dominant (like old "chat" default)
  activeWorld: null,
  iorsActivity: "idle",
  forgeVisible: false,
  focusedNode: null,
  activeStreamTab: "chat",
  graphFilter: "",
  graphDepth: 2,

  setSplitRatio: (ratio) => set({ splitRatio: clampRatio(ratio) }),
  expandStream: () => set({ splitRatio: SPLIT_MAX }),
  expandGraph: () => set({ splitRatio: SPLIT_MIN }),
  resetSplit: () => set({ splitRatio: SPLIT_DEFAULT }),
  cycleSplitPreset: () => {
    const current = get().splitRatio;
    // Find the nearest preset, then advance to the next one
    const idx = SPLIT_PRESETS.reduce(
      (bestIdx, preset, i) =>
        Math.abs(preset - current) < Math.abs(SPLIT_PRESETS[bestIdx] - current)
          ? i
          : bestIdx,
      0,
    );
    const next = (idx + 1) % SPLIT_PRESETS.length;
    set({ splitRatio: SPLIT_PRESETS[next] });
  },

  setActiveStreamTab: (tab) => set({ activeStreamTab: tab }),
  setActiveWorld: (world) => set({ activeWorld: world }),
  setIorsActivity: (activity) => set({ iorsActivity: activity }),
  setForgeVisible: (visible) => set({ forgeVisible: visible }),
  setFocusedNode: (node) => set({ focusedNode: node }),
  setGraphFilter: (filter) => set({ graphFilter: filter }),
  setGraphDepth: (depth) => set({ graphDepth: depth }),
}));
