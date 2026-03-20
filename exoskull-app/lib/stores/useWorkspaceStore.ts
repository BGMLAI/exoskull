"use client";

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceTab = "terminal" | "files" | "code" | "preview";

export interface DiffData {
  filePath: string;
  before: string;
  after: string;
  hunks: Array<{
    oldStart: number;
    newStart: number;
    lines: Array<{ type: "context" | "add" | "remove"; content: string }>;
  }>;
}

interface WorkspaceState {
  /** Which tab is active */
  activeTab: WorkspaceTab;
  /** Whether workspace panel is visible */
  isOpen: boolean;
  /** Panel width in pixels (persisted to localStorage) */
  panelWidth: number;
  /** Currently selected file path (for code tab) */
  selectedFile: string | null;
  /** Current diff data (for code tab diff view) */
  diffData: DiffData | null;
  /** Preview URL (for iframe src) */
  previewUrl: string | null;
  /** Preview HTML string (for iframe srcdoc) */
  previewHtml: string | null;

  // Actions
  setActiveTab: (tab: WorkspaceTab) => void;
  openFile: (filePath: string) => void;
  showPreview: (opts: { url?: string; html?: string }) => void;
  showDiff: (data: DiffData) => void;
  setPanelWidth: (width: number) => void;
  toggleWorkspace: () => void;
  setOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function getStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v !== null) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) return n;
    }
  } catch {
    /* noop */
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeTab: "terminal",
  isOpen: false,
  panelWidth: getStoredNumber("exo-workspace-width", 480),
  selectedFile: null,
  diffData: null,
  previewUrl: null,
  previewHtml: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  openFile: (filePath) =>
    set({
      selectedFile: filePath,
      activeTab: "code",
      isOpen: true,
    }),

  showPreview: ({ url, html }) =>
    set({
      previewUrl: url ?? null,
      previewHtml: html ?? null,
      activeTab: "preview",
      isOpen: true,
    }),

  showDiff: (data) =>
    set({
      diffData: data,
      activeTab: "code",
      isOpen: true,
    }),

  setPanelWidth: (width) => {
    try {
      localStorage.setItem("exo-workspace-width", String(width));
    } catch {
      /* noop */
    }
    set({ panelWidth: width });
  },

  toggleWorkspace: () => set((s) => ({ isOpen: !s.isOpen })),

  setOpen: (open) => set({ isOpen: open }),
}));
