"use client";

import { create } from "zustand";
import type { ChannelType } from "@/lib/stream/types";

export type MobileTab = "home" | "apps" | "hub" | "settings";
export type SidebarTab = "nav" | "goals" | "channels";

interface AppState {
  /** Desktop sidebar open/collapsed */
  sidebarOpen: boolean;
  /** Active sidebar section */
  sidebarTab: SidebarTab;
  /** Which channel to send messages through */
  activeChannel: ChannelType;
  /** Mobile bottom-nav active tab */
  mobileTab: MobileTab;
  /** Whether onboarding has been completed */
  onboardingComplete: boolean;
  /** Code sidebar open (kept for Claude Code integration) */
  codeSidebarOpen: boolean;
  /** Last file changed via SSE */
  lastChangedFile: string | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setActiveChannel: (ch: ChannelType) => void;
  setMobileTab: (tab: MobileTab) => void;
  setOnboardingComplete: (v: boolean) => void;
  toggleCodeSidebar: () => void;
  notifyFileChange: (filePath: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  sidebarTab: "nav",
  activeChannel: "web_chat",
  mobileTab: "home",
  onboardingComplete: getStoredBool("exo-onboarding-complete", false),
  codeSidebarOpen: false,
  lastChangedFile: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setActiveChannel: (ch) => set({ activeChannel: ch }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setOnboardingComplete: (v) => {
    try {
      localStorage.setItem("exo-onboarding-complete", String(v));
    } catch {
      /* noop */
    }
    set({ onboardingComplete: v });
  },
  toggleCodeSidebar: () =>
    set((s) => ({ codeSidebarOpen: !s.codeSidebarOpen })),
  notifyFileChange: (filePath) =>
    set({ codeSidebarOpen: true, lastChangedFile: filePath }),
}));

function getStoredBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v === "true";
  } catch {
    /* noop */
  }
  return fallback;
}
