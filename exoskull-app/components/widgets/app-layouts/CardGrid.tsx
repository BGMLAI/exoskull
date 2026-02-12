"use client";

import type { AppColumn, AppUiConfig } from "@/lib/apps/types";

interface AppEntry {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

interface CardGridProps {
  entries: AppEntry[];
  columns: AppColumn[];
  uiConfig: AppUiConfig;
}

export function CardGrid({ entries, columns, uiConfig }: CardGridProps) {
  const titleCol = uiConfig.card_title_column || uiConfig.display_columns[0];
  const subtitleCol =
    uiConfig.card_subtitle_column || uiConfig.display_columns[1];
  const badgeCol = uiConfig.card_badge_column;
  const color = uiConfig.color || "violet";

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Brak wpisów. Kliknij + aby dodać pierwszy.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.slice(0, 20).map((entry) => {
        const title = entry[titleCol];
        const subtitle = subtitleCol ? entry[subtitleCol] : null;
        const badge = badgeCol ? entry[badgeCol] : null;

        return (
          <div
            key={entry.id}
            className="rounded-lg border border-border bg-card/50 p-2.5 hover:bg-card/80 transition-colors"
          >
            {badge != null && (
              <span
                className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-${color}-500/20 text-${color}-400 mb-1`}
              >
                {String(badge)}
              </span>
            )}
            <p className="text-sm font-medium truncate">
              {title != null ? String(title) : "-"}
            </p>
            {subtitle != null && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {String(subtitle)}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              {new Date(entry.created_at).toLocaleDateString("pl")}
            </p>
          </div>
        );
      })}
    </div>
  );
}
