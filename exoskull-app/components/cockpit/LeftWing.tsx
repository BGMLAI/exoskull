"use client";

import { useState } from "react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { HUDPanel } from "./HUDPanel";
import { OrbFormDialog } from "./OrbFormDialog";
import { useOrbData } from "@/lib/hooks/useOrbData";
import type { DataItem } from "@/lib/cockpit/normalize-response";
import type { PreviewTarget } from "@/lib/stores/useCockpitStore";
import type { OrbNodeType } from "@/lib/types/orb-types";
import { relativeTime } from "@/lib/cockpit/utils";

/**
 * LeftWing — Left column of the cockpit HUD.
 * Panels: Tasks, IORS Activity, Email.
 */
export function LeftWing() {
  const sections = useCockpitStore((s) => s.sections);
  const isVisible = (id: string) =>
    sections.find((s) => s.id === id)?.visible !== false;

  const { addNode } = useOrbData();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNodeType, setAddNodeType] = useState<OrbNodeType>("value");

  return (
    <div className="hud-wing" style={{ height: "100%" }}>
      {/* Section header with add button */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            fontFamily: "monospace",
            textTransform: "uppercase",
          }}
        >
          Wartości
        </span>
        <button
          onClick={() => {
            setAddNodeType("value");
            setShowAddDialog(true);
          }}
          title="Dodaj nową wartość"
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            border: "1px solid rgba(6, 182, 212, 0.25)",
            background: "rgba(6, 182, 212, 0.08)",
            color: "rgba(6, 182, 212, 0.7)",
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.15)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.4)";
            e.currentTarget.style.color = "rgba(6, 182, 212, 1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.08)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.25)";
            e.currentTarget.style.color = "rgba(6, 182, 212, 0.7)";
          }}
        >
          +
        </button>
      </div>

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

      <OrbFormDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        mode="create"
        nodeType={addNodeType}
        onSubmit={async (data) => {
          const success = await addNode(null, addNodeType, data);
          return success;
        }}
      />
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
