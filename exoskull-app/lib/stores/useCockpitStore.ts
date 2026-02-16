import { create } from "zustand";

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

interface CockpitState {
  /** Currently selected world (clicked orb) */
  selectedWorldId: string | null;
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

  // Actions
  selectWorld: (id: string | null) => void;
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
  sections: DEFAULT_SECTIONS,
  leftWingWidth: getPersistedWidth("cockpit-left-w", 260),
  rightWingWidth: getPersistedWidth("cockpit-right-w", 260),
  centerMode: "chat",
  previewTarget: null,
  collapsedPanels: new Set<string>(),

  selectWorld: (id) => set({ selectedWorldId: id }),

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
}));
