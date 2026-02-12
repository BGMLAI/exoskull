"use client";

import type { AppColumn, AppUiConfig } from "@/lib/apps/types";

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface MindmapViewProps {
  entries: AppEntry[];
  columns: AppColumn[];
  uiConfig: AppUiConfig;
}

export function MindmapView({ entries, columns, uiConfig }: MindmapViewProps) {
  const groupCol = uiConfig.mindmap_group_column || uiConfig.display_columns[0];
  const nodeLabel =
    uiConfig.mindmap_node_label ||
    uiConfig.display_columns.find((c) => c !== groupCol) ||
    groupCol;
  const centerLabel =
    uiConfig.mindmap_center_label || uiConfig.summary?.label || "Centrum";
  const color = uiConfig.color || "violet";
  const mediaCol = uiConfig.media_column;

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Brak wpisów. Kliknij + aby dodać pierwszy.
      </p>
    );
  }

  // Group entries by branch column
  const groups = new Map<string, AppEntry[]>();
  for (const entry of entries) {
    const key = String(entry[groupCol] || "Inne");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  const branches = [...groups.entries()];

  // Branch colors (cycle through)
  const BRANCH_COLORS = [
    "emerald",
    "blue",
    "amber",
    "rose",
    "violet",
    "cyan",
    "orange",
    "pink",
  ];

  return (
    <div className="relative w-full overflow-auto min-h-[200px]">
      {/* Central node */}
      <div className="flex flex-col items-center gap-6">
        <div
          className={`px-4 py-2 rounded-full bg-${color}-500/20 border-2 border-${color}-500 text-${color}-300 text-sm font-bold text-center shadow-lg shadow-${color}-500/10`}
        >
          {centerLabel}
          <span className="block text-[10px] font-normal opacity-70">
            {entries.length} wpisów
          </span>
        </div>

        {/* Branches */}
        <div className="flex flex-wrap justify-center gap-3 w-full">
          {branches.map(([branchName, items], branchIdx) => {
            const branchColor = BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];

            return (
              <div
                key={branchName}
                className="flex flex-col items-center gap-1.5 min-w-[120px] max-w-[160px]"
              >
                {/* Connector line */}
                <div className={`w-px h-4 bg-${branchColor}-500/40`} />

                {/* Branch node */}
                <div
                  className={`px-3 py-1.5 rounded-lg bg-${branchColor}-500/10 border border-${branchColor}-500/30 text-center w-full`}
                >
                  <p
                    className={`text-xs font-semibold text-${branchColor}-400`}
                  >
                    {branchName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {items.length}
                  </p>
                </div>

                {/* Leaf nodes */}
                <div className="space-y-1 w-full">
                  {items.slice(0, 6).map((entry) => {
                    const label = entry[nodeLabel];
                    const imgUrl = mediaCol
                      ? (entry[mediaCol] as string)
                      : null;

                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border border-border/50 bg-card/30 hover:bg-card/60 transition-colors`}
                      >
                        {imgUrl && (
                          <img
                            src={imgUrl}
                            alt=""
                            className="w-5 h-5 rounded-sm object-cover flex-shrink-0"
                          />
                        )}
                        <span className="text-[11px] truncate flex-1">
                          {label != null ? String(label) : "-"}
                        </span>
                      </div>
                    );
                  })}
                  {items.length > 6 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center">
                      +{items.length - 6} więcej
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
