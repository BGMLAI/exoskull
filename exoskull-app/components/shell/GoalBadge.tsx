"use client";

import { cn } from "@/lib/utils";

const CATEGORY_EMOJI: Record<string, string> = {
  health: "💪",
  productivity: "⚡",
  finance: "💰",
  mental: "🧠",
  social: "👥",
  learning: "📚",
  creativity: "🎨",
};

const TRAJECTORY_COLOR: Record<string, string> = {
  on_track: "bg-green-500",
  at_risk: "bg-yellow-500",
  off_track: "bg-red-500",
  completed: "bg-blue-500",
};

interface GoalBadgeProps {
  goal: {
    id: string;
    name: string;
    category: string;
    progress_percent: number;
    trajectory: string;
  };
}

/**
 * GoalBadge — Compact goal indicator: emoji + name + minibar + %.
 */
export function GoalBadge({ goal }: GoalBadgeProps) {
  const emoji = CATEGORY_EMOJI[goal.category] || "🎯";
  const progress = Math.min(
    100,
    Math.max(0, Math.round(goal.progress_percent)),
  );
  const barColor = TRAJECTORY_COLOR[goal.trajectory] || "bg-primary";

  return (
    <div
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border text-xs"
      title={`${goal.name}: ${progress}%`}
    >
      <span className="text-sm">{emoji}</span>
      <span className="font-medium truncate max-w-[80px]">{goal.name}</span>

      {/* Mini progress bar */}
      <div className="w-10 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="text-muted-foreground tabular-nums">{progress}%</span>
    </div>
  );
}
