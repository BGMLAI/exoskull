"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout";
import type { LayoutItem, Layout } from "react-grid-layout";
import type { CanvasWidget } from "@/lib/canvas/types";
import { widgetToLayout } from "@/lib/canvas/types";
import { getWidgetMeta } from "@/lib/canvas/widget-registry";
import { WidgetWrapper, WidgetSkeleton } from "./WidgetWrapper";
import { WidgetPicker } from "./WidgetPicker";
import { AddWidgetButton } from "./AddWidgetButton";

// Widget components
import { VoiceHero } from "@/components/dashboard/VoiceHero";
import { HealthWidget } from "@/components/widgets/HealthWidget";
import { TasksWidget } from "@/components/widgets/TasksWidget";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { ConversationsWidget } from "@/components/widgets/ConversationsWidget";
import { EmotionalWidget } from "@/components/widgets/EmotionalWidget";
import { GuardianWidget } from "@/components/widgets/GuardianWidget";
import { QuickActionsWidget } from "@/components/widgets/QuickActionsWidget";
import { IORSStatusWidget } from "@/components/widgets/IORSStatusWidget";
import { ActivityFeedWidget } from "@/components/widgets/ActivityFeedWidget";
import { OptimizationWidget } from "@/components/widgets/OptimizationWidget";
import { InterventionInboxWidget } from "@/components/widgets/InterventionInboxWidget";
import { InsightHistoryWidget } from "@/components/widgets/InsightHistoryWidget";

import type {
  HealthSummary,
  TaskStats,
  DataPoint,
  OptimizationStats,
  InterventionInboxData,
} from "@/lib/dashboard/types";

// ============================================================================
// TYPES
// ============================================================================

interface CanvasGridProps {
  tenantId: string;
  assistantName: string;
  phoneNumber?: string;
}

// ============================================================================
// SELF-FETCHING WIDGET WRAPPERS
// ============================================================================

function CanvasHealthWidget() {
  const [data, setData] = useState<HealthSummary | null>(null);
  useEffect(() => {
    fetch("/api/canvas/data/health")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => console.error("[CanvasHealth] Fetch error:", e));
  }, []);
  if (!data) return <WidgetSkeleton />;
  return <HealthWidget summary={data} />;
}

function CanvasTasksWidget() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [series, setSeries] = useState<DataPoint[]>([]);
  useEffect(() => {
    fetch("/api/canvas/data/tasks")
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        setSeries(d.series || []);
      })
      .catch((e) => console.error("[CanvasTasks] Fetch error:", e));
  }, []);
  if (!stats) return <WidgetSkeleton />;
  return <TasksWidget stats={stats} series={series} />;
}

function CanvasCalendarWidget() {
  const [items, setItems] = useState<
    import("@/lib/dashboard/types").CalendarItem[]
  >([]);
  useEffect(() => {
    fetch("/api/canvas/data/calendar")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch((e) => console.error("[CanvasCalendar] Fetch error:", e));
  }, []);
  return <CalendarWidget items={items} />;
}

function CanvasConversationsWidget() {
  const [stats, setStats] = useState<{
    totalToday: number;
    totalWeek: number;
    avgDuration: number;
  } | null>(null);
  const [series, setSeries] = useState<DataPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/canvas/data/conversations")
      .then((r) => r.json())
      .then((d) => {
        setStats({
          totalToday: d.totalToday || 0,
          totalWeek: d.totalWeek || 0,
          avgDuration: d.avgDuration || 0,
        });
        setSeries(d.series || []);
        setLastUpdated(d.lastUpdated || null);
      })
      .catch((e) => console.error("[CanvasConversations] Fetch error:", e));
  }, []);
  if (!stats) return <WidgetSkeleton />;
  return (
    <ConversationsWidget
      stats={stats}
      series={series}
      lastUpdated={lastUpdated}
    />
  );
}

function CanvasOptimizationWidget() {
  const [stats, setStats] = useState<OptimizationStats | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/canvas/data/optimization")
        .then((r) => r.json())
        .then(setStats)
        .catch((e) => console.error("[CanvasOptimization] Fetch error:", e));
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);
  if (!stats) return <WidgetSkeleton />;
  return <OptimizationWidget stats={stats} />;
}

function CanvasInterventionInboxWidget() {
  const [data, setData] = useState<InterventionInboxData | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/canvas/data/interventions")
        .then((r) => r.json())
        .then(setData)
        .catch((e) =>
          console.error("[CanvasInterventionInbox] Fetch error:", e),
        );
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);
  if (!data) return <WidgetSkeleton />;
  return (
    <InterventionInboxWidget
      pending={data.pending}
      needsFeedback={data.needsFeedback}
    />
  );
}

function CanvasInsightHistoryWidget() {
  const [insights, setInsights] = useState<
    Array<{
      id: string;
      insight_summary: string;
      delivery_channel: string;
      delivered_at: string;
      source_type: "intervention" | "highlight" | "learning" | "unknown";
    }>
  >([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/canvas/data/insights")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights || []))
      .catch((e) => console.error("[CanvasInsightHistory] Fetch error:", e))
      .finally(() => setLoaded(true));
  }, []);
  if (!loaded) return <WidgetSkeleton />;
  return <InsightHistoryWidget insights={insights} />;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CanvasGrid({
  tenantId,
  assistantName,
  phoneNumber,
}: CanvasGridProps) {
  const [widgets, setWidgets] = useState<CanvasWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Container width for responsive layout
  const { width, containerRef } = useContainerWidth();

  // Load widgets from API
  useEffect(() => {
    fetch("/api/canvas/widgets")
      .then((r) => r.json())
      .then((d) => setWidgets(d.widgets || []))
      .catch((e) => console.error("[CanvasGrid] Fetch error:", e))
      .finally(() => setLoading(false));
  }, []);

  // Convert widgets to react-grid-layout format
  const layouts = useMemo(() => {
    return {
      lg: widgets.map(widgetToLayout),
      md: widgets.map(widgetToLayout),
      sm: widgets.map((w) => ({
        ...widgetToLayout(w),
        x: w.pinned ? 0 : widgetToLayout(w).x % 2,
        w: w.pinned ? 2 : Math.min(widgetToLayout(w).w, 2),
      })),
      xs: widgets.map((w) => ({
        ...widgetToLayout(w),
        x: 0,
        w: 1,
      })),
    };
  }, [widgets]);

  // Save layout changes (debounced)
  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      if (loading || widgets.length === 0) return;

      const changed = layout.some((item) => {
        const widget = widgets.find((w) => w.id === item.i);
        if (!widget || widget.pinned) return false;
        return (
          widget.position_x !== item.x ||
          widget.position_y !== item.y ||
          widget.size_w !== item.w ||
          widget.size_h !== item.h
        );
      });

      if (!changed) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const updates = layout
          .filter((item) => {
            const widget = widgets.find((w) => w.id === item.i);
            return widget && !widget.pinned;
          })
          .map((item) => ({
            id: item.i,
            position_x: item.x,
            position_y: item.y,
            size_w: item.w,
            size_h: item.h,
          }));

        if (updates.length === 0) return;

        fetch("/api/canvas/widgets/batch", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layouts: updates }),
        }).catch((e) => console.error("[CanvasGrid] Save layout error:", e));

        setWidgets((prev) =>
          prev.map((w) => {
            const update = updates.find((u) => u.id === w.id);
            if (!update) return w;
            return {
              ...w,
              position_x: update.position_x,
              position_y: update.position_y,
              size_w: update.size_w,
              size_h: update.size_h,
            };
          }),
        );
      }, 500);
    },
    [loading, widgets],
  );

  // Add widget
  const handleAddWidget = useCallback(async (widgetType: string) => {
    try {
      const res = await fetch("/api/canvas/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_type: widgetType }),
      });
      const data = await res.json();
      if (data.widget) {
        setWidgets((prev) => [...prev, data.widget]);
      }
    } catch (e) {
      console.error("[CanvasGrid] Add widget error:", e);
    }
  }, []);

  // Remove widget
  const handleRemoveWidget = useCallback(async (widgetId: string) => {
    try {
      await fetch(`/api/canvas/widgets/${widgetId}`, { method: "DELETE" });
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    } catch (e) {
      console.error("[CanvasGrid] Remove widget error:", e);
    }
  }, []);

  // Render a widget component by type
  const renderWidget = (widget: CanvasWidget) => {
    switch (widget.widget_type) {
      case "voice_hero":
        return (
          <VoiceHero
            tenantId={tenantId}
            assistantName={assistantName}
            phoneNumber={phoneNumber}
          />
        );
      case "health":
        return <CanvasHealthWidget />;
      case "tasks":
        return <CanvasTasksWidget />;
      case "calendar":
        return <CanvasCalendarWidget />;
      case "conversations":
        return <CanvasConversationsWidget />;
      case "emotional":
        return <EmotionalWidget tenantId={tenantId} />;
      case "guardian":
        return <GuardianWidget />;
      case "quick_actions":
        return <QuickActionsWidget />;
      case "iors_status":
        return <IORSStatusWidget />;
      case "activity_feed":
        return <ActivityFeedWidget />;
      case "optimization":
        return <CanvasOptimizationWidget />;
      case "intervention_inbox":
        return <CanvasInterventionInboxWidget />;
      case "insight_history":
        return <CanvasInsightHistoryWidget />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
            <p>Widget: {widget.widget_type}</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-48 bg-muted rounded-lg animate-pulse" />
          <div className="h-48 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  const existingTypes = widgets.map((w) => w.widget_type);

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className="pb-4">
      {width > 0 && (
        <Responsive
          className="canvas-grid"
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 4, md: 4, sm: 2, xs: 1 }}
          rowHeight={150}
          dragConfig={{ handle: ".canvas-drag-handle" }}
          onLayoutChange={(layout) => handleLayoutChange(layout)}
          compactor={verticalCompactor}
          margin={[16, 16] as [number, number]}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="rounded-lg">
              <WidgetWrapper
                widgetId={widget.id}
                widgetType={widget.widget_type}
                pinned={widget.pinned}
                onRemove={handleRemoveWidget}
              >
                {renderWidget(widget)}
              </WidgetWrapper>
            </div>
          ))}
        </Responsive>
      )}

      <AddWidgetButton onClick={() => setPickerOpen(true)} />

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddWidget}
        existingTypes={existingTypes}
      />
    </div>
  );
}
