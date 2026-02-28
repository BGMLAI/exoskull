"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Target,
  Heart,
  Activity,
  Mail,
  CheckSquare,
  Brain,
  Zap,
  X,
  Minus,
  Maximize2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HUDWidgetConfig } from "@/lib/stores/useSpatialStore";

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Target,
  Heart,
  Activity,
  Mail,
  CheckSquare,
  Brain,
  Zap,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Activity;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HUDWidgetProps {
  config: HUDWidgetConfig;
  onMinimize: () => void;
  onRemove: () => void;
}

interface WidgetData {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "stable";
  sub?: string;
}

export function HUDWidget({ config, onMinimize, onRemove }: HUDWidgetProps) {
  const [data, setData] = useState<WidgetData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(config.endpoint);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      // Normalize — API shapes vary, extract top-level stats
      const items = normalizeResponse(json, config.id);
      setData(items);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.id]);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const Icon = getIcon(config.icon);

  // Minimized — just icon + title bar
  if (config.minimized) {
    return (
      <button
        onClick={onMinimize}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/60 backdrop-blur-md border border-white/10 shadow-lg hover:bg-card/80 transition-all pointer-events-auto"
        title={config.title}
      >
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-medium text-foreground/80">
          {config.title}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-card/60 backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto transition-all",
        config.size === "sm" ? "w-[160px]" : "w-[220px]",
      )}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-medium text-foreground/80 truncate">
            {config.title}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onMinimize}
            className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-2.5 py-2 space-y-1.5">
        {loading && (
          <div className="space-y-1.5">
            <div className="h-3 bg-muted/30 rounded animate-pulse w-3/4" />
            <div className="h-5 bg-muted/30 rounded animate-pulse w-1/2" />
          </div>
        )}

        {error && (
          <p className="text-[10px] text-muted-foreground/50">Brak danych</p>
        )}

        {!loading && !error && data && data.length > 0 && (
          <>
            {data.slice(0, 3).map((item, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-[10px] text-muted-foreground truncate">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {item.value}
                  {item.trend === "up" && (
                    <span className="text-green-500 text-[9px] ml-0.5">▲</span>
                  )}
                  {item.trend === "down" && (
                    <span className="text-red-500 text-[9px] ml-0.5">▼</span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}

        {!loading && !error && (!data || data.length === 0) && (
          <p className="text-[10px] text-muted-foreground/50">Brak danych</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Response normalizer — adapts various API shapes to WidgetData[]
// ---------------------------------------------------------------------------

function normalizeResponse(
  json: Record<string, unknown>,
  widgetId: string,
): WidgetData[] {
  // /api/canvas/data/tasks → { pending, today, overdue }
  if ("pending" in json || "today" in json || "overdue" in json) {
    const items: WidgetData[] = [];
    if (json.today !== undefined)
      items.push({ label: "Dzisiaj", value: json.today as number });
    if (json.pending !== undefined)
      items.push({ label: "Oczekujace", value: json.pending as number });
    if (json.overdue !== undefined)
      items.push({
        label: "Zaległe",
        value: json.overdue as number,
        trend: (json.overdue as number) > 0 ? "down" : "stable",
      });
    return items;
  }

  // /api/canvas/data/health → { sleep, steps, mood, ... }
  if ("sleep" in json || "steps" in json || "mood" in json) {
    const items: WidgetData[] = [];
    if (json.sleep !== undefined) {
      const s = json.sleep as Record<string, unknown>;
      items.push({
        label: "Sen",
        value: s.hours ? `${s.hours}h` : `${s}h`,
      });
    }
    if (json.steps !== undefined)
      items.push({ label: "Kroki", value: json.steps as number });
    if (json.mood !== undefined)
      items.push({ label: "Nastroj", value: json.mood as string });
    return items;
  }

  // Generic — try to extract first 3 key-value pairs
  const entries = Object.entries(json).slice(0, 3);
  return entries.map(([key, val]) => ({
    label: key,
    value:
      typeof val === "object" ? JSON.stringify(val).slice(0, 20) : String(val),
  }));
}
