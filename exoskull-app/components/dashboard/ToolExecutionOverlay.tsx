"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSceneStore } from "@/lib/stores/useSceneStore";

/**
 * Floating pill that appears when IORS executes a tool.
 * Positioned top-center, disappears when tool finishes.
 */
export function ToolExecutionOverlay() {
  const activeTool = useSceneStore((s) => s.activeTool);
  const [elapsed, setElapsed] = useState(0);

  // Timer for elapsed seconds
  useEffect(() => {
    if (!activeTool) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeTool.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTool]);

  if (!activeTool) return null;

  // Human-readable tool name
  const displayName = activeTool.name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-30",
        "flex items-center gap-2.5 px-4 py-2 rounded-full",
        "bg-black/60 backdrop-blur-xl border border-white/10",
        "shadow-lg shadow-cyan-500/10",
        "animate-in fade-in slide-in-from-top-2 duration-300",
      )}
    >
      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
      <span className="text-sm font-medium text-foreground/80">
        {displayName}
      </span>
      {elapsed > 0 && (
        <span className="text-xs text-foreground/40">{elapsed}s</span>
      )}
    </div>
  );
}
