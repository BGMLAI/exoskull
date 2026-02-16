"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { HUDPanel } from "./HUDPanel";
import type { DataItem } from "@/lib/cockpit/normalize-response";
import type { PreviewTarget } from "@/lib/stores/useCockpitStore";
import { relativeTime } from "@/lib/cockpit/utils";

/**
 * LeftWing — Left column of the cockpit HUD.
 * Panels: Tasks, IORS Activity, Email.
 */
export function LeftWing() {
  const sections = useCockpitStore((s) => s.sections);
  const isVisible = (id: string) =>
    sections.find((s) => s.id === id)?.visible !== false;

  return (
    <div className="hud-wing" style={{ height: "100%" }}>
      {isVisible("tasks") && (
        <HUDPanel
          panelId="tasks"
          title="Zadania"
          accentColor="#3b82f6"
          endpoint="/api/canvas/data/tasks"
          toPreview={taskToPreview}
          renderItem={renderTaskItem}
        />
      )}

      {isVisible("activity") && (
        <HUDPanel
          panelId="activity"
          title="IORS"
          accentColor="#8b5cf6"
          endpoint="/api/canvas/activity-feed?limit=15"
          toPreview={activityToPreview}
          renderItem={renderActivityItem}
        />
      )}

      {isVisible("email") && (
        <HUDPanel
          panelId="email"
          title="Email"
          accentColor="#06b6d4"
          endpoint="/api/canvas/data/emails"
          toPreview={emailToPreview}
          renderItem={renderEmailItem}
        />
      )}
    </div>
  );
}

/* ── Custom item renderers ── */

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

function renderEmailItem(item: DataItem, i: number) {
  const label = (item.subject as string) || item.title || "—";
  const fromName = item.from_name ? String(item.from_name) : null;
  return (
    <div
      key={(item.id as string) || i}
      className="hud-item"
      style={{ "--hud-accent": "#06b6d4" } as React.CSSProperties}
    >
      <span className="hud-item-dot" />
      <span className="hud-item-label">{label}</span>
      {fromName && <span className="hud-item-meta">{fromName}</span>}
    </div>
  );
}

/* ── Preview target mappers ── */

function taskToPreview(item: DataItem): PreviewTarget {
  return {
    type: "task",
    id: (item.id as string) || "",
    title: item.title || "Zadanie",
    data: item as Record<string, unknown>,
  };
}

function activityToPreview(item: DataItem): PreviewTarget {
  return {
    type: "activity",
    id: (item.id as string) || "",
    title: (item.action_name as string) || "Aktywność",
    data: item as Record<string, unknown>,
  };
}

function emailToPreview(item: DataItem): PreviewTarget {
  return {
    type: "email",
    id: (item.id as string) || "",
    title: (item.subject as string) || "Email",
    data: item as Record<string, unknown>,
  };
}
