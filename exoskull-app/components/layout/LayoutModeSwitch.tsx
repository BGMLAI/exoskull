"use client";

import { Network, Orbit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCockpitStore, type ViewMode } from "@/lib/stores/useCockpitStore";

/**
 * LayoutModeSwitch — Compact pill toggle between classic and mindmap view modes.
 *
 * Uses CSS variable-based colors so it works with all themes (dark-ops, xo-minimal, neural, gemini-hybrid).
 */
export function LayoutModeSwitch() {
  const viewMode = useCockpitStore((s) => s.viewMode);
  const setViewMode = useCockpitStore((s) => s.setViewMode);

  const modes: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
    {
      id: "mindmap",
      icon: <Network className="w-3.5 h-3.5" />,
      label: "Mind Map",
    },
    {
      id: "classic",
      icon: <Orbit className="w-3.5 h-3.5" />,
      label: "Classic",
    },
  ];

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 p-0.5 rounded-full",
        "bg-card/80 backdrop-blur-sm border border-border",
      )}
    >
      {modes.map((mode) => {
        const isActive = viewMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            title={`Switch to ${mode.label}`}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full",
              "text-xs font-mono transition-all duration-200",
              isActive
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {mode.icon}
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
