"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TasksWidget } from "@/components/widgets/TasksWidget";
import { HealthWidget } from "@/components/widgets/HealthWidget";
import { ConversationsWidget } from "@/components/widgets/ConversationsWidget";
import { KnowledgeWidget } from "@/components/widgets/KnowledgeWidget";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { DailySummaryCard } from "./DailySummaryCard";
import { QuickSettingsCard } from "./QuickSettingsCard";
import type {
  TaskStats,
  HealthSummary,
  ConversationStats,
  KnowledgeSummary,
  CalendarItem,
  DataPoint,
} from "@/lib/dashboard/types";

// ============================================================================
// TYPES
// ============================================================================

interface DashboardData {
  tasks: TaskStats;
  taskSeries: DataPoint[];
  health: HealthSummary;
  conversations: ConversationStats;
  conversationSeries: DataPoint[];
  knowledge: KnowledgeSummary;
  calendar: CalendarItem[];
  dailySummary: {
    tasksDoneToday: number;
    conversationsToday: number;
    sleepHours: number | null;
    hrvValue: number | null;
    alerts: string[];
  };
}

const DEFAULT_DATA: DashboardData = {
  tasks: { total: 0, pending: 0, in_progress: 0, done: 0, blocked: 0 },
  taskSeries: [],
  health: { steps: null, sleepMinutes: null, hrv: null, sleepSeries: [] },
  conversations: { totalToday: 0, totalWeek: 0, avgDuration: 0 },
  conversationSeries: [],
  knowledge: { loopsTotal: 0, activeCampaigns: 0 },
  calendar: [],
  dailySummary: {
    tasksDoneToday: 0,
    conversationsToday: 0,
    sleepHours: null,
    hrvValue: null,
    alerts: [],
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

interface DashboardStatsSectionProps {
  tenantId: string;
}

export function DashboardStatsSection({
  tenantId,
}: DashboardStatsSectionProps) {
  const [data, setData] = useState<DashboardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadAll() {
      try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        // Parallel fetches
        const [
          tasksRes,
          tasksDoneTodayRes,
          healthRes,
          conversationsRes,
          loopsRes,
          campaignsRes,
          calendarRes,
        ] = await Promise.all([
          // All tasks
          supabase.from("exo_tasks").select("status").eq("tenant_id", tenantId),

          // Tasks done today
          supabase
            .from("exo_tasks")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "done")
            .gte("completed_at", todayStart.toISOString()),

          // Health metrics (last 7 days)
          supabase
            .from("exo_health_metrics")
            .select("metric_type, value, recorded_at")
            .eq("tenant_id", tenantId)
            .in("metric_type", ["sleep", "steps", "hrv"])
            .gte("recorded_at", weekAgo.toISOString())
            .order("recorded_at", { ascending: false })
            .limit(50),

          // Conversations this week
          supabase
            .from("exo_conversations")
            .select("id, created_at, metadata")
            .eq("tenant_id", tenantId)
            .gte("created_at", weekAgo.toISOString()),

          // Loops count
          supabase
            .from("user_loops")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId),

          // Campaigns count
          supabase
            .from("user_campaigns")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId),

          // Upcoming tasks with due date
          supabase
            .from("exo_tasks")
            .select("id, title, due_date, priority")
            .eq("tenant_id", tenantId)
            .eq("status", "pending")
            .not("due_date", "is", null)
            .gte("due_date", now.toISOString())
            .order("due_date", { ascending: true })
            .limit(5),
        ]);

        // Process tasks
        const tasks = tasksRes.data || [];
        const taskStats: TaskStats = {
          total: tasks.length,
          pending: tasks.filter((t) => t.status === "pending").length,
          in_progress: tasks.filter((t) => t.status === "in_progress").length,
          done: tasks.filter((t) => t.status === "done").length,
          blocked: tasks.filter((t) => t.status === "blocked").length,
        };

        // Process health
        const healthMetrics = healthRes.data || [];
        const sleepData = healthMetrics.filter(
          (m) => m.metric_type === "sleep",
        );
        const stepsData = healthMetrics.filter(
          (m) => m.metric_type === "steps",
        );
        const hrvData = healthMetrics.filter((m) => m.metric_type === "hrv");

        const latestSleep = sleepData[0]?.value ?? null;
        const latestSteps = stepsData[0]?.value ?? null;
        const latestHrv = hrvData[0]?.value ?? null;

        // Build sleep series for chart (last 7 days)
        const sleepSeries: DataPoint[] = sleepData
          .slice(0, 7)
          .reverse()
          .map((m) => {
            const d = new Date(m.recorded_at);
            return {
              date: m.recorded_at,
              value: Math.round((m.value / 60) * 10) / 10,
              label: d.toLocaleDateString("pl-PL", { weekday: "short" }),
            };
          });

        const healthSummary: HealthSummary = {
          steps: latestSteps,
          sleepMinutes: latestSleep,
          hrv: latestHrv,
          sleepSeries,
        };

        // Process conversations
        const convos = conversationsRes.data || [];
        const todayConvos = convos.filter(
          (c) => new Date(c.created_at) >= todayStart,
        );
        const avgDuration = convos.length > 0 ? 300 : 0; // Default ~5min if conversations exist

        const conversationStats: ConversationStats = {
          totalToday: todayConvos.length,
          totalWeek: convos.length,
          avgDuration,
        };

        // Build conversation series
        const convoByDay = new Map<string, number>();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split("T")[0];
          convoByDay.set(key, 0);
        }
        for (const c of convos) {
          const key = c.created_at.split("T")[0];
          if (convoByDay.has(key)) {
            convoByDay.set(key, (convoByDay.get(key) || 0) + 1);
          }
        }
        const conversationSeries: DataPoint[] = Array.from(
          convoByDay.entries(),
        ).map(([date, value]) => ({
          date,
          value,
          label: new Date(date).toLocaleDateString("pl-PL", {
            weekday: "short",
          }),
        }));

        // Build task series (done per day last 7 days) - simplified
        const taskSeries: DataPoint[] = Array.from(convoByDay.keys()).map(
          (date) => ({
            date,
            value: 0, // Would need completed_at grouping for accuracy
            label: new Date(date).toLocaleDateString("pl-PL", {
              weekday: "short",
            }),
          }),
        );

        // Knowledge
        const knowledgeSummary: KnowledgeSummary = {
          loopsTotal: loopsRes.count ?? 0,
          activeCampaigns: campaignsRes.count ?? 0,
        };

        // Calendar items
        const calendarItems: CalendarItem[] = (calendarRes.data || []).map(
          (t) => ({
            id: t.id,
            title: t.title,
            date: t.due_date,
            type: "task" as const,
            link: "/dashboard/tasks",
            meta: t.priority ? `Priorytet: ${t.priority}` : undefined,
          }),
        );

        // Daily summary
        const alerts: string[] = [];
        if (latestSleep !== null && latestSleep < 360) {
          alerts.push(
            `Sen ponizej 6h (${Math.round((latestSleep / 60) * 10) / 10}h)`,
          );
        }
        if (latestHrv !== null && latestHrv < 30) {
          alerts.push(`HRV ponizej normy (${Math.round(latestHrv)}ms)`);
        }
        if (taskStats.blocked > 0) {
          alerts.push(`${taskStats.blocked} zablokowanych zadan`);
        }

        setData({
          tasks: taskStats,
          taskSeries,
          health: healthSummary,
          conversations: conversationStats,
          conversationSeries,
          knowledge: knowledgeSummary,
          calendar: calendarItems,
          dailySummary: {
            tasksDoneToday: tasksDoneTodayRes.count ?? 0,
            conversationsToday: todayConvos.length,
            sleepHours:
              latestSleep !== null
                ? Math.round((latestSleep / 60) * 10) / 10
                : null,
            hrvValue: latestHrv,
            alerts,
          },
        });
      } catch (err) {
        console.error("[DashboardStatsSection] Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [tenantId]);

  return (
    <div className="p-4 md:p-6 space-y-4 pb-20 md:pb-6">
      {/* Section header */}
      <h2 className="text-lg font-semibold text-foreground">Przeglad</h2>

      {/* Stats grid: 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TasksWidget
          stats={data.tasks}
          series={data.taskSeries}
          loading={loading}
        />
        <HealthWidget summary={data.health} />
        <ConversationsWidget
          stats={data.conversations}
          series={data.conversationSeries}
          loading={loading}
        />
        <KnowledgeWidget summary={data.knowledge} />
      </div>

      {/* Summary + Calendar row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailySummaryCard
          tasksDoneToday={data.dailySummary.tasksDoneToday}
          conversationsToday={data.dailySummary.conversationsToday}
          sleepHours={data.dailySummary.sleepHours}
          hrvValue={data.dailySummary.hrvValue}
          alerts={data.dailySummary.alerts}
          loading={loading}
        />
        <CalendarWidget items={data.calendar} />
      </div>

      {/* Quick settings */}
      <QuickSettingsCard tenantId={tenantId} />
    </div>
  );
}
