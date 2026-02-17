import { create } from "zustand";

export type ThemeId = "dark-ops" | "xo-minimal" | "neural" | "gemini-hybrid";

interface ThemeStore {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "gemini-hybrid";
  return (localStorage.getItem("exo-theme") as ThemeId) || "gemini-hybrid";
}

/**
 * Zustand store for theme state.
 * Keeps localStorage in sync and exposes theme to non-hook contexts.
 * Actual <html> class application is delegated to next-themes (ThemeProvider).
 */
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem("exo-theme", theme);
    set({ theme });
  },
}));
