"use client";

import { useEffect, useState } from "react";
import { GoalBadge } from "./GoalBadge";
import { Plus, Loader2 } from "lucide-react";
import Link from "next/link";

interface GoalSummary {
  id: string;
  name: string;
  category: string;
  progress_percent: number;
  trajectory: string;
}

/**
 * GoalStrip — Horizontal scrollable goal badges in the TopBar.
 * Fetches active goals from /api/goals and displays compact progress indicators.
 */
export function GoalStrip() {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/goals?limit=5&active=true");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        // Accept either { goals: [...] } or array directly
        const list = data.goals || data || [];
        setGoals(
          list.map((g: Record<string, unknown>) => ({
            id: g.id as string,
            name: g.name as string,
            category: (g.category as string) || "health",
            progress_percent:
              (g.progress_percent as number) ??
              (g.latest_checkpoint as Record<string, unknown>)
                ?.progress_percent ??
              0,
            trajectory:
              (g.trajectory as string) ??
              (g.latest_checkpoint as Record<string, unknown>)?.trajectory ??
              "on_track",
          })),
        );
      } catch {
        // Silently fail — goal strip is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-2">
      {goals.map((goal) => (
        <GoalBadge key={goal.id} goal={goal} />
      ))}
      <Link
        href="/dashboard/goals"
        className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-full border border-dashed border-border hover:border-foreground/30 transition-colors"
        title="Dodaj cel"
      >
        <Plus className="w-3 h-3" />
        <span className="hidden sm:inline">Cel</span>
      </Link>
    </div>
  );
}
