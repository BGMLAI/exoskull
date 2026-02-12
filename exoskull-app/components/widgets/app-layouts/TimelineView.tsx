"use client";

import type { AppColumn, AppUiConfig } from "@/lib/apps/types";

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface TimelineViewProps {
  entries: AppEntry[];
  columns: AppColumn[];
  uiConfig: AppUiConfig;
}

export function TimelineView({
  entries,
  columns,
  uiConfig,
}: TimelineViewProps) {
  const dateCol = uiConfig.timeline_date_column || "created_at";
  const labelCol =
    uiConfig.timeline_label_column || uiConfig.display_columns[0];
  const color = uiConfig.color || "violet";

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Brak wpisów. Kliknij + aby dodać pierwszy.
      </p>
    );
  }

  // Sort by date descending
  const sorted = [...entries].sort((a, b) => {
    const da = new Date(a[dateCol] as string).getTime();
    const db = new Date(b[dateCol] as string).getTime();
    return db - da;
  });

  return (
    <div className="relative pl-4">
      {/* Vertical line */}
      <div
        className={`absolute left-1.5 top-0 bottom-0 w-px bg-${color}-500/30`}
      />

      <div className="space-y-3">
        {sorted.slice(0, 20).map((entry) => {
          const label = entry[labelCol];
          const dateVal = entry[dateCol] as string;
          const extraCols = uiConfig.display_columns.filter(
            (c) => c !== labelCol && c !== dateCol,
          );

          return (
            <div key={entry.id} className="relative">
              {/* Dot */}
              <div
                className={`absolute -left-2.5 top-1 w-2 h-2 rounded-full bg-${color}-500`}
              />

              <div className="ml-2">
                <p className="text-xs font-medium">
                  {label != null ? String(label) : "-"}
                </p>
                {extraCols.slice(0, 2).map((colName) => {
                  const val = entry[colName];
                  if (val == null) return null;
                  const col = columns.find((c) => c.name === colName);
                  return (
                    <p
                      key={colName}
                      className="text-[10px] text-muted-foreground"
                    >
                      {col?.description || colName}: {String(val)}
                    </p>
                  );
                })}
                <p className="text-[10px] text-muted-foreground/60">
                  {formatDate(dateVal)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(val: string): string {
  try {
    return new Date(val).toLocaleString("pl", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return val;
  }
}
