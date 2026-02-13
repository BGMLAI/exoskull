/**
 * Interface State Store
 *
 * Manages the dual-interface state: Chat River <-> Tree Graph.
 * Two modes that interpenetrate - chat is always present, graph is always present,
 * only their sizes change with smooth transitions.
 *
 * Chat Mode (default): Chat is full screen, graph is miniature in corner
 * Graph Mode: Graph is full screen, chat is minimized to a floating bubble
 */

import { create } from "zustand";

export type InterfaceMode = "chat" | "graph";

/** Which node in the graph is currently focused/selected */
export interface FocusedNode {
  id: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
}

interface InterfaceState {
  /** Current primary mode */
  mode: InterfaceMode;
  /** Whether transition animation is in progress */
  isTransitioning: boolean;
  /** Currently focused node in the graph */
  focusedNode: FocusedNode | null;
  /** Whether the chat bubble (in graph mode) is expanded to show recent messages */
  chatBubbleExpanded: boolean;
  /** Whether the graph miniature (in chat mode) is hovered/expanded */
  graphMiniatureExpanded: boolean;
  /** Search/filter query applied to the graph */
  graphFilter: string;
  /** Depth level of the tree being viewed */
  graphDepth: number;

  // Actions
  setMode: (mode: InterfaceMode) => void;
  toggleMode: () => void;
  setFocusedNode: (node: FocusedNode | null) => void;
  setChatBubbleExpanded: (expanded: boolean) => void;
  setGraphMiniatureExpanded: (expanded: boolean) => void;
  setGraphFilter: (filter: string) => void;
  setGraphDepth: (depth: number) => void;
}

export const useInterfaceStore = create<InterfaceState>((set) => ({
  mode: "chat",
  isTransitioning: false,
  focusedNode: null,
  chatBubbleExpanded: false,
  graphMiniatureExpanded: false,
  graphFilter: "",
  graphDepth: 2,

  setMode: (mode) =>
    set(() => {
      // Start transition
      setTimeout(() => set({ isTransitioning: false }), 500);
      return { mode, isTransitioning: true };
    }),

  toggleMode: () =>
    set((state) => {
      const newMode = state.mode === "chat" ? "graph" : "chat";
      setTimeout(() => set({ isTransitioning: false }), 500);
      return { mode: newMode, isTransitioning: true };
    }),

  setFocusedNode: (node) => set({ focusedNode: node }),
  setChatBubbleExpanded: (expanded) => set({ chatBubbleExpanded: expanded }),
  setGraphMiniatureExpanded: (expanded) =>
    set({ graphMiniatureExpanded: expanded }),
  setGraphFilter: (filter) => set({ graphFilter: filter }),
  setGraphDepth: (depth) => set({ graphDepth: depth }),
}));
