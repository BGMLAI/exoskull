"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export const EXOSKULL_THEMES = [
  {
    id: "gemini-hybrid",
    label: "Gemini",
    description: "Jasny, przejrzysty",
    dot: "#1a73e8",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Neonowy ciemny",
    dot: "#ff2d6f",
  },
  {
    id: "dark-ops",
    label: "Dark Ops",
    description: "Centrum dowodzenia",
    dot: "#00d4ff",
  },
  {
    id: "xo-minimal",
    label: "XO Minimal",
    description: "Czysty & jasny",
    dot: "#111111",
  },
  { id: "neural", label: "Neural", description: "AI brain", dot: "#9b6dff" },
] as const;

export type ExoSkullTheme = (typeof EXOSKULL_THEMES)[number]["id"];

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="gemini-hybrid"
      themes={[
        "dark-ops",
        "xo-minimal",
        "neural",
        "gemini-hybrid",
        "cyberpunk",
      ]}
      enableSystem={false}
      storageKey="exo-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
