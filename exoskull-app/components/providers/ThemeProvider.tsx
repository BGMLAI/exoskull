"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export const EXOSKULL_THEMES = [
  {
    id: "dark-ops",
    label: "Dark Ops",
    description: "Command center",
    dot: "#00d4ff",
  },
  {
    id: "xo-minimal",
    label: "XO Minimal",
    description: "Clean & light",
    dot: "#111111",
  },
  { id: "neural", label: "Neural", description: "AI brain", dot: "#9b6dff" },
  {
    id: "gemini-hybrid",
    label: "Gemini",
    description: "Blue & light",
    dot: "#1a73e8",
  },
] as const;

export type ExoSkullTheme = (typeof EXOSKULL_THEMES)[number]["id"];

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="gemini-hybrid"
      themes={["dark-ops", "xo-minimal", "neural", "gemini-hybrid"]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
