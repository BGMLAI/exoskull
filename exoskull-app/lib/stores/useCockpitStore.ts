import { create } from "zustand";
import type { NavStackEntry, OrbNode } from "@/lib/types/orb-types";

export interface CockpitSection {
  id: string;
  label: string;
  visible: boolean;
  expanded: boolean;
}

export interface PreviewTarget {
  type: "email" | "task" | "document" | "calendar" | "activity" | "value";
  id: string;
  title: string;
  data?: Record<string, unknown>;
}

/** Dashboard view mode */
export type ViewMode = "classic" | "mindmap";

/** Cockpit skin style */
export type CockpitStyle =
  | "none"
  | "scifi-spaceship"
  | "cyberpunk-terminal"
  | "minimalist-command"
  | "steampunk-control"
  | "military-hud";

/** Cockpit zone ID for widget pinning */
export type CockpitZone =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "left-wing"
  | "right-wing";

/** Widget pinned to a cockpit zone */
export interface ZoneWidget {
  zoneId: CockpitZone;
  widgetType: string;
}

interface CockpitState {
  /** Currently selected world (clicked orb) */
  selectedWorldId: string | null;
  /** Navigation stack for recursive orb drill-in */
  navStack: NavStackEntry[];
  /** Cockpit sections visibility/expand state */
  sections: CockpitSection[];
  /** Left wing column width in px */
  leftWingWidth: number;
  /** Right wing column width in px */
  rightWingWidth: number;
  /** Center viewport mode */
  centerMode: "chat" | "preview";
  /** Preview target when centerMode === 'preview' */
  previewTarget: PreviewTarget | null;
  /** Set of collapsed panel IDs */
  collapsedPanels: Set<string>;
  /** Whether the HUD overlay is minimized (lets 3D scene through) */
  hudMinimized: boolean;
  /** Context menu state for 3D orb right-click */
  orbContextMenu: {
    x: number;
    y: number;
    node: OrbNode | null;
    depth: number;
  } | null;
  /** Dashboard view mode: classic 3D scene or mind map workspace */
  viewMode: ViewMode;
  /** Code sidebar open state */
  codeSidebarOpen: boolean;
  /** Last file changed via SSE (triggers sidebar auto-open + highlight) */
  lastChangedFile: string | null;
  /** Pending message from CockpitActionBar to inject into chat */
  pendingActionBarMessage: string | null;
  /** Selected cockpit 3D skin */
  cockpitStyle: CockpitStyle;
  /** Widget-to-zone pinning layout */
  zoneWidgets: ZoneWidget[];

  // Actions
  selectWorld: (id: string | null) => void;
  /** Push a node onto the nav stack (drill in) */
  drillInto: (node: NavStackEntry) => void;
  /** Pop one level from nav stack (zoom out) */
  navigateBack: () => void;
  /** Pop to specific depth (for breadcrumb clicks) */
  navigateTo: (depth: number) => void;
  /** Clear nav stack → overview */
  resetNav: () => void;
  toggleSection: (id: string) => void;
  showSection: (id: string) => void;
  hideSection: (id: string) => void;
  setSections: (sections: CockpitSection[]) => void;
  setLeftWingWidth: (w: number) => void;
  setRightWingWidth: (w: number) => void;
  setCenterMode: (mode: "chat" | "preview") => void;
  setPreviewTarget: (target: PreviewTarget | null) => void;
  togglePanelCollapse: (panelId: string) => void;
  openPreview: (target: PreviewTarget) => void;
  closePreview: () => void;
  toggleHudMinimized: () => void;
  setOrbContextMenu: (
    menu: { x: number; y: number; node: OrbNode | null; depth: number } | null,
  ) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  toggleCodeSidebar: () => void;
  /** Called when a file_change SSE event arrives — opens sidebar + highlights file */
  notifyFileChange: (filePath: string) => void;
  /** Send a message from action bar → consumed by UnifiedStream */
  sendFromActionBar: (text: string) => void;
  /** Clear the pending action bar message (called by UnifiedStream after consuming) */
  clearActionBarMessage: () => void;
  /** Set cockpit 3D skin */
  setCockpitStyle: (style: CockpitStyle) => void;
  /** Set widget for a cockpit zone */
  setZoneWidget: (zoneId: CockpitZone, widgetType: string) => void;
  /** Remove widget from a cockpit zone */
  removeZoneWidget: (zoneId: CockpitZone) => void;
  /** Set all zone widgets (for loading from persistence) */
  setZoneWidgets: (widgets: ZoneWidget[]) => void;
}

const DEFAULT_SECTIONS: CockpitSection[] = [
  { id: "stats", label: "Status", visible: true, expanded: false },
  { id: "tasks", label: "Zadania", visible: true, expanded: false },
  { id: "activity", label: "Aktywność", visible: true, expanded: false },
  { id: "knowledge", label: "Wiedza", visible: true, expanded: false },
  { id: "email", label: "Email", visible: true, expanded: false },
  { id: "calendar", label: "Kalendarz", visible: true, expanded: false },
];

/**
 * Zustand store for the static cockpit HUD.
 * IORS can modify sections (show/hide/expand) through chat.
 * World orb clicks set selectedWorldId → WorldDetailPanel opens.
 */
/** Read persisted wing widths from localStorage */
function getPersistedWidth(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v) return Math.max(200, Math.min(400, parseInt(v, 10)));
  } catch {
    /* SSR or blocked storage */
  }
  return fallback;
}

export const useCockpitStore = create<CockpitState>((set) => ({
  selectedWorldId: null,
  navStack: [],
  sections: DEFAULT_SECTIONS,
  leftWingWidth: getPersistedWidth("cockpit-left-w", 260),
  rightWingWidth: getPersistedWidth("cockpit-right-w", 260),
  centerMode: "chat",
  previewTarget: null,
  collapsedPanels: new Set<string>(),
  hudMinimized: false,
  orbContextMenu: null,
  viewMode: "classic",
  codeSidebarOpen: false,
  lastChangedFile: null,
  pendingActionBarMessage: null,
  cockpitStyle: "none",
  zoneWidgets: [],

  selectWorld: (id) => set({ selectedWorldId: id }),

  drillInto: (node) =>
    set((s) => ({
      navStack: [...s.navStack, node],
      selectedWorldId: node.id,
    })),

  navigateBack: () =>
    set((s) => {
      if (s.navStack.length === 0) return s;
      const next = s.navStack.slice(0, -1);
      return {
        navStack: next,
        selectedWorldId: next.length > 0 ? next[next.length - 1].id : null,
      };
    }),

  navigateTo: (depth) =>
    set((s) => {
      const next = s.navStack.slice(0, depth);
      return {
        navStack: next,
        selectedWorldId: next.length > 0 ? next[next.length - 1].id : null,
      };
    }),

  resetNav: () => set({ navStack: [], selectedWorldId: null }),

  toggleSection: (id) =>
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === id ? { ...sec, expanded: !sec.expanded } : sec,
      ),
    })),

  showSection: (id) =>
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === id ? { ...sec, visible: true } : sec,
      ),
    })),

  hideSection: (id) =>
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === id ? { ...sec, visible: false } : sec,
      ),
    })),

  setSections: (sections) => set({ sections }),

  setLeftWingWidth: (w) => {
    try {
      localStorage.setItem("cockpit-left-w", String(w));
    } catch {
      /* */
    }
    set({ leftWingWidth: w });
  },

  setRightWingWidth: (w) => {
    try {
      localStorage.setItem("cockpit-right-w", String(w));
    } catch {
      /* */
    }
    set({ rightWingWidth: w });
  },

  setCenterMode: (mode) => set({ centerMode: mode }),

  setPreviewTarget: (target) => set({ previewTarget: target }),

  togglePanelCollapse: (panelId) =>
    set((s) => {
      const next = new Set(s.collapsedPanels);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return { collapsedPanels: next };
    }),

  openPreview: (target) =>
    set({ centerMode: "preview", previewTarget: target }),

  closePreview: () => set({ centerMode: "chat", previewTarget: null }),

  toggleHudMinimized: () => set((s) => ({ hudMinimized: !s.hudMinimized })),

  setOrbContextMenu: (menu) => set({ orbContextMenu: menu }),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleViewMode: () =>
    set((s) => ({
      viewMode: s.viewMode === "classic" ? "mindmap" : "classic",
    })),
  toggleCodeSidebar: () =>
    set((s) => ({ codeSidebarOpen: !s.codeSidebarOpen })),
  notifyFileChange: (filePath) =>
    set({ codeSidebarOpen: true, lastChangedFile: filePath }),

  sendFromActionBar: (text) => set({ pendingActionBarMessage: text }),
  clearActionBarMessage: () => set({ pendingActionBarMessage: null }),

  setCockpitStyle: (style) => set({ cockpitStyle: style }),

  setZoneWidget: (zoneId, widgetType) =>
    set((s) => ({
      zoneWidgets: [
        ...s.zoneWidgets.filter((z) => z.zoneId !== zoneId),
        { zoneId, widgetType },
      ],
    })),

  removeZoneWidget: (zoneId) =>
    set((s) => ({
      zoneWidgets: s.zoneWidgets.filter((z) => z.zoneId !== zoneId),
    })),

  setZoneWidgets: (widgets) => set({ zoneWidgets: widgets }),
}));
