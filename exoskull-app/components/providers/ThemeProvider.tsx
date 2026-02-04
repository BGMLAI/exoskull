"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export const EXOSKULL_THEMES = [
  { id: "dark-ops", label: "Dark Ops", description: "Command center" },
  { id: "xo-minimal", label: "XO Minimal", description: "Clean & light" },
  { id: "neural", label: "Neural", description: "AI brain" },
] as const;

export type ExoSkullTheme = (typeof EXOSKULL_THEMES)[number]["id"];

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark-ops"
      themes={["dark-ops", "xo-minimal", "neural"]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
