"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import {
  useCockpitStore,
  type CockpitZone,
} from "@/lib/stores/useCockpitStore";
import { ZoneWidgetPicker } from "./ZoneWidgetPicker";
import { Plus, X } from "lucide-react";

// Lazy-loaded widget components (same as CanvasGrid)
const HealthWidget = lazy(() =>
  import("@/components/widgets/HealthWidget").then((m) => ({
    default: m.HealthWidget,
  })),
);
const TasksWidget = lazy(() =>
  import("@/components/widgets/TasksWidget").then((m) => ({
    default: m.TasksWidget,
  })),
);
const CalendarWidget = lazy(() =>
  import("@/components/widgets/CalendarWidget").then((m) => ({
    default: m.CalendarWidget,
  })),
);
const ActivityFeedWidget = lazy(() =>
  import("@/components/widgets/ActivityFeedWidget").then((m) => ({
    default: m.ActivityFeedWidget,
  })),
);
const IORSStatusWidget = lazy(() =>
  import("@/components/widgets/IORSStatusWidget").then((m) => ({
    default: m.IORSStatusWidget,
  })),
);
const QuickActionsWidget = lazy(() =>
  import("@/components/widgets/QuickActionsWidget").then((m) => ({
    default: m.QuickActionsWidget,
  })),
);
const KnowledgeInsightsWidget = lazy(() =>
  import("@/components/widgets/KnowledgeInsightsWidget").then((m) => ({
    default: m.KnowledgeInsightsWidget,
  })),
);
const ValueTreeWidget = lazy(() =>
  import("@/components/widgets/ValueTreeWidget").then((m) => ({
    default: m.ValueTreeWidget,
  })),
);
const SystemHealthWidget = lazy(() =>
  import("@/components/widgets/SystemHealthWidget").then((m) => ({
    default: m.SystemHealthWidget,
  })),
);
const ProcessMonitorWidget = lazy(() =>
  import("@/components/widgets/ProcessMonitorWidget").then((m) => ({
    default: m.ProcessMonitorWidget,
  })),
);

/**
 * Renders a widget by type string — minimal self-fetching wrappers.
 */
function ZoneWidgetRenderer({ widgetType }: { widgetType: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground animate-pulse">
          Loading...
        </div>
      }
    >
      <ZoneWidgetInner widgetType={widgetType} />
    </Suspense>
  );
}

function ZoneWidgetInner({ widgetType }: { widgetType: string }) {
  switch (widgetType) {
    case "health":
      return <SelfFetchingHealth />;
    case "tasks":
      return <SelfFetchingTasks />;
    case "calendar":
      return <SelfFetchingCalendar />;
    case "activity_feed":
      return <ActivityFeedWidget />;
    case "iors_status":
      return <IORSStatusWidget />;
    case "quick_actions":
      return <QuickActionsWidget />;
    case "knowledge_insights":
      return <KnowledgeInsightsWidget />;
    case "value_tree":
      return <ValueTreeWidget />;
    case "system_health":
      return <SystemHealthWidget />;
    case "process_monitor":
      return <ProcessMonitorWidget />;
    default:
      return (
        <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground p-2">
          {widgetType}
        </div>
      );
  }
}

// Self-fetching wrappers for widgets that need data

function SelfFetchingHealth() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/canvas/data/health")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error("[ZoneHealth]", e));
  }, []);
  if (!data) return <WidgetSkeleton />;
  return <HealthWidget summary={data} lastUpdated={data.lastUpdated} />;
}

function SelfFetchingTasks() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/canvas/data/tasks")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error("[ZoneTasks]", e));
  }, []);
  if (!data?.stats) return <WidgetSkeleton />;
  return (
    <TasksWidget
      stats={data.stats}
      series={data.series || []}
      lastUpdated={data.lastUpdated}
    />
  );
}

function SelfFetchingCalendar() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/canvas/data/calendar")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error("[ZoneCalendar]", e));
  }, []);
  return (
    <CalendarWidget items={data?.items || []} lastUpdated={data?.lastUpdated} />
  );
}

function WidgetSkeleton() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CockpitZoneSlot — A slot in the cockpit that can hold a pinned widget
// ---------------------------------------------------------------------------

interface CockpitZoneSlotProps {
  zoneId: CockpitZone;
  className?: string;
}

export function CockpitZoneSlot({ zoneId, className }: CockpitZoneSlotProps) {
  const zoneWidgets = useCockpitStore((s) => s.zoneWidgets);
  const removeZoneWidget = useCockpitStore((s) => s.removeZoneWidget);
  const [pickerOpen, setPickerOpen] = useState(false);

  const widget = zoneWidgets.find((z) => z.zoneId === zoneId);

  const handleRemove = useCallback(() => {
    removeZoneWidget(zoneId);
    // Persist removal
    const updated = useCockpitStore
      .getState()
      .zoneWidgets.filter((z) => z.zoneId !== zoneId);
    persistZoneWidgets(updated);
  }, [zoneId, removeZoneWidget]);

  if (!widget) {
    // Empty slot — show add button
    return (
      <>
        <button
          onClick={() => setPickerOpen(true)}
          className={`hud-panel hud-panel-glass flex items-center justify-center gap-1 cursor-pointer hover:bg-white/5 transition-colors ${className || ""}`}
          title={`Pin widget to ${zoneId}`}
          style={{ minHeight: 80 }}
        >
          <Plus size={14} className="text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/50 font-mono">
            PIN
          </span>
        </button>
        <ZoneWidgetPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          zoneId={zoneId}
        />
      </>
    );
  }

  // Widget pinned — render it
  return (
    <div
      className={`hud-panel hud-panel-glass relative group ${className || ""}`}
      style={{ minHeight: 80 }}
    >
      {/* Remove button (visible on hover) */}
      <button
        onClick={handleRemove}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded bg-black/40 hover:bg-red-500/40"
        title="Unpin widget"
      >
        <X size={10} className="text-white/70" />
      </button>

      <div className="h-full overflow-hidden" style={{ fontSize: "0.75rem" }}>
        <ZoneWidgetRenderer widgetType={widget.widgetType} />
      </div>
    </div>
  );
}

/** Persist zone widgets to backend */
async function persistZoneWidgets(
  widgets: { zoneId: string; widgetType: string }[],
) {
  try {
    await fetch("/api/settings/cockpit", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_widgets: widgets }),
    });
  } catch (err) {
    console.error("[CockpitZoneSlot] Persist failed:", err);
  }
}
