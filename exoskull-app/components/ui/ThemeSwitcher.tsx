"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeStore, type ThemeId } from "@/lib/stores/useThemeStore";

const THEMES: { id: ThemeId; label: string; dot: string }[] = [
  { id: "dark-ops", label: "Dark Ops", dot: "#00d4ff" },
  { id: "xo-minimal", label: "XO Minimal", dot: "#111111" },
  { id: "neural", label: "Neural", dot: "#9b6dff" },
  { id: "gemini-hybrid", label: "Gemini", dot: "#1a73e8" },
];

export function ThemeSwitcher() {
  const { theme: ntTheme, setTheme: ntSetTheme } = useTheme();
  const { setTheme: storeSetTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded bg-black/40 border border-slate-800 animate-pulse" />
    );
  }

  const activeId = (ntTheme as ThemeId) ?? "gemini-hybrid";
  const current = THEMES.find((t) => t.id === activeId) ?? THEMES[3];

  function handleSelect(id: ThemeId) {
    ntSetTheme(id); // next-themes applies class to <html>
    storeSetTheme(id); // Zustand store syncs localStorage + state
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-slate-400 hover:text-white bg-black/40 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-600/60 rounded backdrop-blur-sm transition-all duration-200"
          title="Switch theme"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ backgroundColor: current.dot }}
          />
          <Palette className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 font-mono text-xs">
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => handleSelect(t.id)}
            className={`flex items-center gap-2 cursor-pointer ${
              activeId === t.id
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ backgroundColor: t.dot }}
            />
            {t.label}
            {activeId === t.id && (
              <span className="ml-auto text-[10px] text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
