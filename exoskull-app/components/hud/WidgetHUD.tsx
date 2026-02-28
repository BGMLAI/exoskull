"use client";

import { useSpatialStore } from "@/lib/stores/useSpatialStore";
import type { WidgetZone } from "@/lib/stores/useSpatialStore";
import { HUDWidget } from "./HUDWidget";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Zone position mapping — absolute CSS for each corner
// ---------------------------------------------------------------------------

const ZONE_CLASSES: Record<WidgetZone, string> = {
  "top-left": "top-3 left-3 items-start",
  "top-right": "top-3 right-3 items-end",
  "bottom-left": "bottom-20 left-3 items-start",
  "bottom-right": "bottom-20 right-3 items-end",
};

// ---------------------------------------------------------------------------
// WidgetHUD — floating widget overlay on screen edges
// ---------------------------------------------------------------------------

export function WidgetHUD() {
  const {
    widgets,
    widgetHudVisible,
    activeHashtag,
    toggleWidgetMinimized,
    removeWidget,
  } = useSpatialStore();

  if (!widgetHudVisible || widgets.length === 0) return null;

  // Filter by active hashtag (if set)
  const visibleWidgets = activeHashtag
    ? widgets.filter((w) => !w.hashtag || w.hashtag === activeHashtag)
    : widgets;

  // Group by zone
  const zones: Record<WidgetZone, typeof visibleWidgets> = {
    "top-left": [],
    "top-right": [],
    "bottom-left": [],
    "bottom-right": [],
  };

  for (const w of visibleWidgets) {
    zones[w.zone].push(w);
  }

  return (
    <div className="absolute inset-0 z-[8] pointer-events-none">
      {(Object.entries(zones) as [WidgetZone, typeof visibleWidgets][]).map(
        ([zone, zoneWidgets]) => {
          if (zoneWidgets.length === 0) return null;
          return (
            <div
              key={zone}
              className={cn(
                "absolute flex flex-col gap-2 pointer-events-none",
                ZONE_CLASSES[zone],
              )}
            >
              {zoneWidgets.map((w) => (
                <HUDWidget
                  key={w.id}
                  config={w}
                  onMinimize={() => toggleWidgetMinimized(w.id)}
                  onRemove={() => removeWidget(w.id)}
                />
              ))}
            </div>
          );
        },
      )}
    </div>
  );
}
