"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { HUDPanel } from "./HUDPanel";
import type { DataItem } from "@/lib/cockpit/normalize-response";
import type { PreviewTarget } from "@/lib/stores/useCockpitStore";
import { relativeTime } from "@/lib/cockpit/utils";

/**
 * BottomPanelGrid — 2x2 floating panel grid at the bottom of the cockpit.
 *
 * Layout (per mockup):
 * ┌──────────┬──────────┐  ┌──────────┬──────────┐
 * │ Taski    │Kalendarz │  │Kalendarz │ Moje     │
 * │ IORS     │ /teraz   │  │ /plan    │ taski    │
 * └──────────┴──────────┘  └──────────┴──────────┘
 *
 * Left group: IORS tasks + Calendar Now
 * Right group: Values/Plan + My Tasks (knowledge)
 */
export function BottomPanelGrid() {
  const sections = useCockpitStore((s) => s.sections);
  const isVisible = (id: string) =>
    sections.find((s) => s.id === id)?.visible !== false;

  return (
    <div className="hud-bottom-panels">
      {/* Left group */}
      <div className="hud-panel-group">
        {isVisible("activity") && (
          <HUDPanel
            panelId="activity"
            title="IORS"
            accentColor="#8b5cf6"
            endpoint="/api/canvas/activity-feed?limit=8"
            toPreview={activityToPreview}
            renderItem={renderActivityItem}
            maxItems={6}
            className="hud-panel-glass"
          />
        )}
        {isVisible("calendar") && (
          <HUDPanel
            panelId="calendar"
            title="Teraz"
            accentColor="#f59e0b"
            endpoint="/api/canvas/data/calendar"
            toPreview={calendarToPreview}
            renderItem={renderCalendarItem}
            maxItems={5}
            className="hud-panel-glass"
          />
        )}
      </div>

      {/* Right group */}
      <div className="hud-panel-group">
        {isVisible("stats") && (
          <HUDPanel
            panelId="values"
            title="Plan"
            accentColor="#f59e0b"
            endpoint="/api/canvas/data/values?deep=true"
            toPreview={valueToPreview}
            renderItem={renderValueItem}
            maxItems={5}
            className="hud-panel-glass"
          />
        )}
        {isVisible("tasks") && (
          <HUDPanel
            panelId="tasks"
            title="Zadania"
            accentColor="#3b82f6"
            endpoint="/api/canvas/data/tasks"
            toPreview={taskToPreview}
            renderItem={renderTaskItem}
            maxItems={6}
            className="hud-panel-glass"
          />
        )}
      </div>
    </div>
  );
}

/* ── Item renderers ── */

function renderActivityItem(item: DataItem, i: number) {
  const label =
    (item.action_name as string) || (item.description as string) || "—";
  const time = item.created_at ? relativeTime(item.created_at as string) : "";
  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#8b5cf6" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {time && <span className="hud-item-meta">{time}</span>}
    </div>
  );
}

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

function renderTaskItem(item: DataItem, i: number) {
  const label = item.title || "—";
  const status = item.status ? String(item.status) : null;
  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#3b82f6" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {status && <span className="hud-item-meta">{status}</span>}
    </div>
  );
}

/* ── Preview target mappers ── */

function activityToPreview(item: DataItem): PreviewTarget {
  return {
    type: "activity",
    id: (item.id as string) || "",
    title: (item.action_name as string) || "Aktywność",
    data: item as Record<string, unknown>,
  };
}

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

function taskToPreview(item: DataItem): PreviewTarget {
  return {
    type: "task",
    id: (item.id as string) || "",
    title: item.title || "Zadanie",
    data: item as Record<string, unknown>,
  };
}
