/**
 * Zustand store for MindMap3D state.
 */

import { create } from "zustand";

interface MindMapState {
  /** Set of node IDs whose children are visible */
  expandedNodes: Set<string>;
  /** Currently focused node (camera target) */
  focusedNodeId: string | null;
  /** View dimension toggle */
  viewMode: "3d" | "2d";
  /** Search/filter query */
  filterQuery: string;
  /** Selected sources for SourcesPanel */
  selectedSources: string[];
  /** Hovered node ID */
  hoveredNodeId: string | null;

  // Actions
  toggleExpanded: (nodeId: string) => void;
  expandNode: (nodeId: string) => void;
  collapseNode: (nodeId: string) => void;
  setFocusedNode: (nodeId: string | null) => void;
  setViewMode: (mode: "3d" | "2d") => void;
  setFilterQuery: (query: string) => void;
  setSelectedSources: (sources: string[]) => void;
  setHoveredNode: (nodeId: string | null) => void;
  expandAll: (nodeIds: string[]) => void;
  collapseAll: () => void;
}

export const useMindMapStore = create<MindMapState>((set) => ({
  expandedNodes: new Set<string>(),
  focusedNodeId: null,
  viewMode: "3d",
  filterQuery: "",
  selectedSources: [],
  hoveredNodeId: null,

  toggleExpanded: (nodeId) =>
    set((s) => {
      const next = new Set(s.expandedNodes);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { expandedNodes: next };
    }),

  expandNode: (nodeId) =>
    set((s) => {
      const next = new Set(s.expandedNodes);
      next.add(nodeId);
      return { expandedNodes: next };
    }),

  collapseNode: (nodeId) =>
    set((s) => {
      const next = new Set(s.expandedNodes);
      next.delete(nodeId);
      return { expandedNodes: next };
    }),

  setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setFilterQuery: (query) => set({ filterQuery: query }),

  setSelectedSources: (sources) => set({ selectedSources: sources }),

  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),

  expandAll: (nodeIds) =>
    set((s) => {
      const next = new Set(s.expandedNodes);
      for (const id of nodeIds) next.add(id);
      return { expandedNodes: next };
    }),

  collapseAll: () => set({ expandedNodes: new Set<string>() }),
}));
