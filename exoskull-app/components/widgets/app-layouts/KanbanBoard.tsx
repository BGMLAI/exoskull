"use client";

import type { AppColumn, AppUiConfig } from "@/lib/apps/types";

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface KanbanBoardProps {
  entries: AppEntry[];
  columns: AppColumn[];
  uiConfig: AppUiConfig;
}

export function KanbanBoard({ entries, columns, uiConfig }: KanbanBoardProps) {
  const groupCol = uiConfig.kanban_group_column || uiConfig.display_columns[0];
  const titleCol =
    uiConfig.display_columns.find((c) => c !== groupCol) || groupCol;
  const color = uiConfig.color || "violet";

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Brak wpisów. Kliknij + aby dodać pierwszy.
      </p>
    );
  }

  // Determine swim lanes
  const laneNames = uiConfig.kanban_columns || [
    ...new Set(entries.map((e) => String(e[groupCol] || "Inne"))),
  ];

  // Group entries by lane
  const grouped = new Map<string, AppEntry[]>();
  for (const lane of laneNames) {
    grouped.set(lane, []);
  }
  for (const entry of entries) {
    const lane = String(entry[groupCol] || "Inne");
    if (!grouped.has(lane)) grouped.set(lane, []);
    grouped.get(lane)!.push(entry);
  }

  return (
    <div className="flex gap-2 overflow-x-auto min-h-0 pb-1">
      {laneNames.map((lane) => {
        const items = grouped.get(lane) || [];
        return (
          <div
            key={lane}
            className="flex-shrink-0 w-[140px] flex flex-col gap-1"
          >
            {/* Lane header */}
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {lane}
              </span>
              <span
                className={`text-[10px] px-1 rounded bg-${color}-500/20 text-${color}-400`}
              >
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-1 flex-1 min-h-0 overflow-y-auto">
              {items.slice(0, 10).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-border bg-card/50 p-1.5 text-[11px]"
                >
                  <p className="font-medium truncate">
                    {entry[titleCol] != null ? String(entry[titleCol]) : "-"}
                  </p>
                  <p className="text-muted-foreground/60 text-[10px]">
                    {new Date(entry.created_at).toLocaleDateString("pl")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
