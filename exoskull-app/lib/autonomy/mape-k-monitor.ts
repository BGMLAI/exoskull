/**
 * MAPE-K Monitor Phase — data collection from all sources.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { MonitorData } from "./types";
import { collectSystemMetrics } from "../optimization/system-metrics";
import { logger } from "@/lib/logger";

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

  // Run all queries in parallel
  const [
    conversationsResult,
    tasksCreatedResult,
    tasksDueResult,
    tasksOverdueResult,
    sleepResult,
    activityResult,
    lastInteractionResult,
    rigsResult,
    alertsResult,
    patternsResult,
    moodResult,
    upcomingTasksResult,
  ] = await Promise.all([
    // Conversations last 24h
    supabase
      .from("exo_conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", dayAgo.toISOString()),

    // Tasks created last 24h
    supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", dayAgo.toISOString()),

    // Tasks due today
    supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lte("due_date", now.toISOString())
      .gte("due_date", new Date(now.setHours(0, 0, 0, 0)).toISOString()),

    // Overdue tasks
    supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("due_date", new Date(now.setHours(0, 0, 0, 0)).toISOString()),

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

    // Tasks due in next 24h (proxy for calendar events)
    supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .gte("due_date", now.toISOString())
      .lte(
        "due_date",
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ),
  ]);

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

  return {
    conversationsLast24h: conversationsResult.count || 0,
    tasksCreated: tasksCreatedResult.count || 0,
    tasksDue: tasksDueResult.count || 0,
    tasksOverdue: tasksOverdueResult.count || 0,
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
    upcomingEvents24h: upcomingTasksResult.count || 0,
    freeTimeBlocks: Math.max(0, 8 - (upcomingTasksResult.count || 0)),
    connectedRigs: rigsResult.data?.map((r) => r.rig_slug) || [],
    lastSyncTimes,
    systemMetrics,
  };
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
