"use client";

import type { AppUiConfig } from "@/lib/apps/types";

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface StatsBarProps {
  entries: AppEntry[];
  uiConfig: AppUiConfig;
}

export function StatsBar({ entries, uiConfig }: StatsBarProps) {
  const statsConfig = uiConfig.stats_columns || [];
  const color = uiConfig.color || "violet";

  // Fallback: if no stats_columns, generate from summary
  const stats =
    statsConfig.length > 0
      ? statsConfig
      : uiConfig.summary
        ? [
            {
              column: uiConfig.summary.column,
              label: uiConfig.summary.label,
              aggregation: uiConfig.summary.aggregation as
                | "count"
                | "sum"
                | "avg"
                | "min"
                | "max"
                | "latest",
            },
          ]
        : [
            {
              column: "_count",
              label: "Razem",
              aggregation: "count" as const,
            },
          ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((stat) => {
        const value = computeStat(entries, stat.column, stat.aggregation);
        const formatted = formatStat(value, stat.format);

        return (
          <div
            key={stat.column + stat.aggregation}
            className={`rounded-lg border border-border bg-${color}-500/5 p-2.5 text-center`}
          >
            <p className="text-lg font-bold">{formatted}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function computeStat(
  entries: AppEntry[],
  column: string,
  aggregation: string,
): number {
  if (entries.length === 0) return 0;

  switch (aggregation) {
    case "count":
      return entries.length;
    case "sum":
      return entries.reduce((s, e) => s + (Number(e[column]) || 0), 0);
    case "avg": {
      const sum = entries.reduce((s, e) => s + (Number(e[column]) || 0), 0);
      return sum / entries.length;
    }
    case "min":
      return Math.min(...entries.map((e) => Number(e[column]) || Infinity));
    case "max":
      return Math.max(...entries.map((e) => Number(e[column]) || -Infinity));
    case "latest": {
      const sorted = [...entries].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return Number(sorted[0]?.[column]) || 0;
    }
    default:
      return entries.length;
  }
}

function formatStat(
  value: number,
  format?: "number" | "currency" | "percent",
): string {
  switch (format) {
    case "currency":
      return value.toLocaleString("pl", {
        style: "currency",
        currency: "PLN",
        maximumFractionDigits: 0,
      });
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return Number.isInteger(value)
        ? value.toLocaleString("pl")
        : value.toFixed(1);
  }
}
