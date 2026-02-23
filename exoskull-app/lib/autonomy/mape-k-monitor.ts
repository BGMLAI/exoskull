/**
 * MAPE-K Monitor Phase — data collection from all sources.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { MonitorData, GoalStatusSummary } from "./types";
import { collectSystemMetrics } from "../optimization/system-metrics";
import { logger } from "@/lib/logger";
import { getTasks, getOverdueTasks } from "@/lib/tasks/task-service";
import type { Task } from "@/lib/tasks/task-service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { createGoogleClient } from "@/lib/rigs/google/client";
import { getGoalStatus } from "@/lib/goals/engine";

/**
 * Collect monitor data for a tenant (M phase of MAPE-K).
 */
export async function collectMonitorData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MonitorData> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Run all queries in parallel — task queries via task-service, rest via supabase
  const [
    conversationsResult,
    allTasks,
    overdueTasks,
    sleepResult,
    activityResult,
    lastInteractionResult,
    rigsResult,
    alertsResult,
    patternsResult,
    moodResult,
    healthMetricsResult,
    calendarEventsResult,
  ] = await Promise.all([
    // Conversations last 24h
    supabase
      .from("exo_conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", dayAgo.toISOString()),

    // All tasks (service handles dual-read) — filter client-side for counts
    getTasks(tenantId, undefined, supabase),

    // Overdue tasks via service
    getOverdueTasks(tenantId, undefined, supabase),

    // Sleep data last 7 days
    supabase
      .from("exo_sleep_entries")
      .select("duration_minutes, sleep_date")
      .eq("tenant_id", tenantId)
      .gte("sleep_date", weekAgo.toISOString().split("T")[0])
      .order("sleep_date", { ascending: true }),

    // Activity data last 7 days
    supabase
      .from("exo_activity_entries")
      .select("duration_minutes, entry_date")
      .eq("tenant_id", tenantId)
      .gte("entry_date", weekAgo.toISOString().split("T")[0])
      .order("entry_date", { ascending: true }),

    // Last interaction
    supabase
      .from("exo_conversations")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),

    // Connected rigs
    supabase
      .from("rig_connections")
      .select("rig_slug, last_sync_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),

    // Active alerts (pending interventions)
    supabase
      .from("exo_interventions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "proposed"),

    // Recent patterns
    supabase
      .from("user_patterns")
      .select("description")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(5),

    // Latest mood entry (last 24h)
    supabase
      .from("exo_mood_entries")
      .select("mood_value, energy_level, emotions, logged_at")
      .eq("tenant_id", tenantId)
      .gte("logged_at", dayAgo.toISOString())
      .order("logged_at", { ascending: false })
      .limit(1)
      .single(),

    // Google health metrics (last 48h from exo_health_metrics)
    supabase
      .from("exo_health_metrics")
      .select("metric_type, value, unit, recorded_at")
      .eq("tenant_id", tenantId)
      .eq("source", "google")
      .gte(
        "recorded_at",
        new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      )
      .order("recorded_at", { ascending: false })
      .limit(20),

    // Google Calendar events (graceful — returns null if no connection)
    (async () => {
      try {
        const { data: conn } = await supabase
          .from("exo_rig_connections")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("rig_slug", "google")
          .not("refresh_token", "is", null)
          .maybeSingle();
        if (!conn) return null;
        const freshToken = await ensureFreshToken(conn);
        if (freshToken !== conn.access_token) conn.access_token = freshToken;
        const client = createGoogleClient(conn);
        if (!client) return null;
        return await client.calendar.getTodaysEvents().catch(() => null);
      } catch {
        return null;
      }
    })(),
  ]);

  // Derive task counts from service results (client-side filtering)
  const tasksCreatedCount = allTasks.filter(
    (t: Task) => new Date(t.created_at) >= dayAgo,
  ).length;

  const tasksDueCount = allTasks.filter((t: Task) => {
    if (t.status !== "pending" || !t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= todayStart && d <= now;
  }).length;

  const tasksOverdueCount = overdueTasks.length;

  const upcomingTasksCount = allTasks.filter((t: Task) => {
    if (t.status !== "pending" || !t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= now && d <= tomorrow;
  }).length;

  // Process sleep data into hours array
  const sleepHoursLast7d: number[] = [];
  if (sleepResult.data) {
    for (const entry of sleepResult.data) {
      sleepHoursLast7d.push((entry.duration_minutes || 0) / 60);
    }
  }

  // Process activity data
  const activityMinutesLast7d: number[] = [];
  if (activityResult.data) {
    for (const entry of activityResult.data) {
      activityMinutesLast7d.push(entry.duration_minutes || 0);
    }
  }

  // Determine HRV trend (simplified)
  const hrvTrend = calculateHrvTrend(sleepHoursLast7d);

  // Process Google health metrics into individual values
  const healthByType: Record<string, number> = {};
  if (healthMetricsResult.data) {
    for (const m of healthMetricsResult.data) {
      if (!healthByType[m.metric_type]) {
        healthByType[m.metric_type] = m.value;
      }
    }
  }

  // Process Google Calendar events
  const calendarEvents: Array<{
    time: string;
    title: string;
    duration?: number;
  }> = [];
  let nextMeetingInMinutes: number | null = null;
  if (Array.isArray(calendarEventsResult)) {
    for (const evt of calendarEventsResult) {
      const startTime = evt.start?.dateTime || evt.start?.date || "";
      calendarEvents.push({
        time: startTime,
        title: evt.summary || "Untitled",
        duration:
          evt.end?.dateTime && evt.start?.dateTime
            ? Math.round(
                (new Date(evt.end.dateTime).getTime() -
                  new Date(evt.start.dateTime).getTime()) /
                  60000,
              )
            : undefined,
      });
      // Calculate minutes until next meeting
      if (evt.start?.dateTime) {
        const minutesUntil = Math.round(
          (new Date(evt.start.dateTime).getTime() - now.getTime()) / 60000,
        );
        if (
          minutesUntil > 0 &&
          (nextMeetingInMinutes === null || minutesUntil < nextMeetingInMinutes)
        ) {
          nextMeetingInMinutes = minutesUntil;
        }
      }
    }
  }

  // Proactive rig-sync: if connected rigs have stale data, trigger on-demand sync
  try {
    if (rigsResult.data && rigsResult.data.length > 0) {
      const STALE_THRESHOLD_MS = 45 * 60 * 1000; // 45 min (CRON runs every 30 min + buffer)
      const staleRigs = rigsResult.data.filter((r) => {
        if (!r.last_sync_at) return true; // Never synced
        return Date.now() - new Date(r.last_sync_at).getTime() > STALE_THRESHOLD_MS;
      });

      if (staleRigs.length > 0) {
        // Trigger on-demand sync for stale rigs (non-blocking, fire-and-forget)
        triggerOnDemandRigSync(supabase, tenantId, staleRigs).catch((err) =>
          logger.warn("[MAPE-K] On-demand rig sync failed:", err instanceof Error ? err.message : err),
        );
      }
    }
  } catch {
    // Non-critical — monitor continues without sync
  }

  // Collect goal statuses (non-blocking)
  let goalStatuses: GoalStatusSummary[] = [];
  try {
    const statuses = await getGoalStatus(tenantId);
    goalStatuses = await Promise.all(
      statuses.map(async (s) => {
        // Check if goal has active strategy
        let hasStrategy = false;
        try {
          const { getActiveStrategy } =
            await import("@/lib/goals/strategy-store");
          hasStrategy = !!(await getActiveStrategy(s.goal.id));
        } catch {
          /* non-critical */
        }

        return {
          goalId: s.goal.id,
          name: s.goal.name,
          category: s.goal.category,
          trajectory: s.trajectory,
          momentum: s.momentum,
          progressPercent: s.progress_percent,
          daysRemaining: s.days_remaining,
          hasStrategy,
          wellbeingWeight: s.goal.wellbeing_weight,
        };
      }),
    );
  } catch (err) {
    logger.warn(
      "[MAPE-K] Goal status collection failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Collect system metrics (non-blocking)
  let systemMetrics;
  try {
    systemMetrics = await collectSystemMetrics(tenantId);
  } catch (err) {
    logger.warn(
      "[MAPE-K] System metrics collection failed:",
      err instanceof Error ? err.message : err,
    );
    systemMetrics = undefined;
  }

  // Build last sync times
  const lastSyncTimes: Record<string, string> = {};
  if (rigsResult.data) {
    for (const rig of rigsResult.data) {
      if (rig.last_sync_at) {
        lastSyncTimes[rig.rig_slug] = rig.last_sync_at;
      }
    }
  }

  // Use real calendar event count if available, otherwise fall back to task-based estimate
  const eventCount = calendarEvents.length || upcomingTasksCount;

  return {
    conversationsLast24h: conversationsResult.count || 0,
    tasksCreated: tasksCreatedCount,
    tasksDue: tasksDueCount,
    tasksOverdue: tasksOverdueCount,
    sleepHoursLast7d,
    activityMinutesLast7d,
    hrvTrend,
    recentPatterns: patternsResult.data?.map((p) => p.description) || [],
    activeAlerts: alertsResult.count || 0,
    lastInteractionAt: lastInteractionResult.data?.created_at || null,
    currentMood:
      moodResult.data?.emotions?.[0] ||
      (moodResult.data?.mood_value ? `${moodResult.data.mood_value}/10` : null),
    energyLevel: moodResult.data?.energy_level || null,
    upcomingEvents24h: eventCount,
    freeTimeBlocks: Math.max(0, 8 - eventCount),
    calendarEvents: calendarEvents.length > 0 ? calendarEvents : undefined,
    nextMeetingInMinutes,
    yesterdaySteps: healthByType.steps ?? null,
    yesterdaySleepMinutes: healthByType.sleep ?? null,
    yesterdayCalories: healthByType.calories ?? null,
    lastHeartRate: healthByType.heart_rate ?? null,
    goalStatuses: goalStatuses.length > 0 ? goalStatuses : undefined,
    activeGoalCount: goalStatuses.length,
    goalsOffTrack: goalStatuses.filter((g) => g.trajectory === "off_track")
      .length,
    goalsAtRisk: goalStatuses.filter((g) => g.trajectory === "at_risk").length,
    connectedRigs: rigsResult.data?.map((r) => r.rig_slug) || [],
    lastSyncTimes,
    systemMetrics,
  };
}

/**
 * Trigger on-demand sync for stale rigs.
 * Runs in the background (fire-and-forget) to refresh data for the current MAPE-K cycle.
 */
async function triggerOnDemandRigSync(
  supabase: SupabaseClient,
  tenantId: string,
  staleRigs: Array<{ rig_slug: string; last_sync_at: string | null }>,
): Promise<void> {
  const { syncRig, CRON_SYNCABLE_SLUGS } = await import("@/lib/rigs/rig-syncer");
  const { ensureFreshToken } = await import("@/lib/rigs/oauth");

  for (const rig of staleRigs.slice(0, 3)) {
    // Only sync CRON-syncable rigs
    if (!CRON_SYNCABLE_SLUGS.has(rig.rig_slug)) continue;

    try {
      // Get full connection record
      const { data: conn } = await supabase
        .from("exo_rig_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("rig_slug", rig.rig_slug)
        .eq("status", "active")
        .maybeSingle();

      if (!conn) continue;

      // Refresh token if needed
      if (conn.refresh_token) {
        const freshToken = await ensureFreshToken(conn);
        if (freshToken !== conn.access_token) {
          conn.access_token = freshToken;
        }
      }

      await syncRig(conn, supabase);

      logger.info("[MAPE-K] On-demand rig sync completed:", {
        tenantId,
        rigSlug: rig.rig_slug,
      });
    } catch (err) {
      logger.warn(`[MAPE-K] On-demand sync failed for ${rig.rig_slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export function calculateHrvTrend(
  sleepHours: number[],
): "improving" | "stable" | "declining" | "unknown" {
  if (sleepHours.length < 3) return "unknown";

  const mid = Math.floor(sleepHours.length / 2);
  const firstHalf = sleepHours.slice(0, mid);
  const secondHalf = sleepHours.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;
  if (diff > 0.5) return "improving";
  if (diff < -0.5) return "declining";
  return "stable";
}
