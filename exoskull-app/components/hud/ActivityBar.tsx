"use client";

import { useEffect, useState } from "react";
import { Activity, Zap, Brain, Mic, Hammer, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpatialStore } from "@/lib/stores/useSpatialStore";
import type { IorsState } from "@/lib/hooks/useChatEngine";

// ---------------------------------------------------------------------------
// State → visual config
// ---------------------------------------------------------------------------

const STATE_CONFIG: Record<
  IorsState,
  {
    label: string;
    icon: typeof Activity;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    dotClass: string;
  }
> = {
  idle: {
    label: "Gotowy",
    icon: Circle,
    colorClass: "text-blue-400",
    bgClass: "bg-blue-500/5",
    borderClass: "border-blue-500/20",
    dotClass: "bg-blue-400",
  },
  thinking: {
    label: "Myśli...",
    icon: Brain,
    colorClass: "text-purple-400",
    bgClass: "bg-purple-500/8",
    borderClass: "border-purple-500/25",
    dotClass: "bg-purple-400",
  },
  speaking: {
    label: "Mówi",
    icon: Mic,
    colorClass: "text-emerald-400",
    bgClass: "bg-emerald-500/8",
    borderClass: "border-emerald-500/25",
    dotClass: "bg-emerald-400",
  },
  building: {
    label: "Buduje",
    icon: Hammer,
    colorClass: "text-amber-400",
    bgClass: "bg-amber-500/8",
    borderClass: "border-amber-500/25",
    dotClass: "bg-amber-400",
  },
  listening: {
    label: "Słucha",
    icon: Zap,
    colorClass: "text-cyan-400",
    bgClass: "bg-cyan-500/8",
    borderClass: "border-cyan-500/25",
    dotClass: "bg-cyan-400",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActivityBarProps {
  iorsState: IorsState;
}

export function ActivityBar({ iorsState }: ActivityBarProps) {
  const activeTask = useSpatialStore((s) => s.activeTask);
  const config = STATE_CONFIG[iorsState];
  const Icon = config.icon;

  // Elapsed time for active task
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!activeTask) {
      setElapsed("");
      return;
    }
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - activeTask.startedAt) / 1000);
      if (diff < 60) setElapsed(`${diff}s`);
      else if (diff < 3600)
        setElapsed(`${Math.floor(diff / 60)}m ${diff % 60}s`);
      else
        setElapsed(
          `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`,
        );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTask]);

  // Don't show bar when idle with no task
  if (iorsState === "idle" && !activeTask) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-40",
        "flex items-center gap-3 px-4 h-9",
        "backdrop-blur-md border-b transition-all duration-300",
        config.bgClass,
        config.borderClass,
      )}
    >
      {/* Pulsing status dot */}
      <div className="relative flex items-center">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            config.dotClass,
            iorsState !== "idle" && "animate-pulse",
          )}
        />
        {iorsState !== "idle" && (
          <div
            className={cn(
              "absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-30",
              config.dotClass,
            )}
          />
        )}
      </div>

      {/* Icon + label */}
      <div className={cn("flex items-center gap-1.5", config.colorClass)}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-mono font-semibold tracking-wider uppercase">
          {config.label}
        </span>
      </div>

      {/* Task title */}
      {activeTask && (
        <>
          <div className="w-px h-4 bg-border/50" />
          <span className="text-xs text-muted-foreground truncate max-w-[50vw]">
            {activeTask.title}
          </span>

          {/* Tags */}
          {activeTask.tags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {activeTask.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                    "bg-muted/50 text-muted-foreground",
                  )}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Elapsed time */}
          {elapsed && (
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">
              {elapsed}
            </span>
          )}
        </>
      )}
    </div>
  );
}
