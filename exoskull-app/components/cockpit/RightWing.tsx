"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { HUDPanel } from "./HUDPanel";
import type { DataItem } from "@/lib/cockpit/normalize-response";
import type { PreviewTarget } from "@/lib/stores/useCockpitStore";

/**
 * RightWing — Right column of the cockpit HUD.
 * Panels: Calendar, Values/Plan, Knowledge.
 */
export function RightWing() {
  const sections = useCockpitStore((s) => s.sections);
  const isVisible = (id: string) =>
    sections.find((s) => s.id === id)?.visible !== false;

  return (
    <div className="hud-wing" style={{ height: "100%" }}>
      {isVisible("calendar") && (
        <HUDPanel
          panelId="calendar"
          title="Kalendarz"
          accentColor="#f59e0b"
          endpoint="/api/canvas/data/calendar"
          toPreview={calendarToPreview}
          renderItem={renderCalendarItem}
        />
      )}

      {isVisible("stats") && (
        <HUDPanel
          panelId="values"
          title="Wartości / Plan"
          accentColor="#f59e0b"
          endpoint="/api/canvas/data/values?deep=true"
          toPreview={valueToPreview}
          renderItem={renderValueItem}
        />
      )}

      {isVisible("knowledge") && (
        <HUDPanel
          panelId="knowledge"
          title="Wiedza"
          accentColor="#10b981"
          endpoint="/api/knowledge"
          toPreview={knowledgeToPreview}
          renderItem={renderKnowledgeItem}
        />
      )}
    </div>
  );
}

/* ── Custom item renderers ── */

function renderCalendarItem(item: DataItem, i: number) {
  const label = item.title || "—";
  const dateStr = item.date as string;
  let timeDisplay = "";
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      timeDisplay =
        d.toLocaleDateString("pl-PL", { day: "2-digit", month: "short" }) +
        " " +
        d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    } catch {
      /* */
    }
  }

  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#f59e0b" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {timeDisplay && <span className="hud-item-meta">{timeDisplay}</span>}
    </div>
  );
}

function renderValueItem(item: DataItem, i: number) {
  const label = (item.name as string) || item.title || "—";
  const loopCount = Array.isArray(item.loops) ? item.loops.length : 0;

  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#f59e0b" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {loopCount > 0 && (
        <span className="hud-item-meta">{loopCount} loops</span>
      )}
    </div>
  );
}

function renderKnowledgeItem(item: DataItem, i: number) {
  const label =
    (item.filename as string) || item.title || item.name || "Dokument";
  const category = (item.category as string) || "";

  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#10b981" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {category && <span className="hud-item-meta">{category}</span>}
    </div>
  );
}

/* ── Preview target mappers ── */

function calendarToPreview(item: DataItem): PreviewTarget {
  return {
    type: "calendar",
    id: (item.id as string) || "",
    title: item.title || "Wydarzenie",
    data: item as Record<string, unknown>,
  };
}

function valueToPreview(item: DataItem): PreviewTarget {
  return {
    type: "value",
    id: (item.id as string) || "",
    title: (item.name as string) || "Wartość",
    data: item as Record<string, unknown>,
  };
}

function knowledgeToPreview(item: DataItem): PreviewTarget {
  return {
    type: "document",
    id: (item.id as string) || "",
    title: (item.filename as string) || "Dokument",
    data: item as Record<string, unknown>,
  };
}
