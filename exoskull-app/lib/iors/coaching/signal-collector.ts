/**
 * Coaching Signal Collector
 *
 * Collects signals from 12+ tables for the coaching decision engine.
 * Runs in parallel to minimize latency (~150ms total).
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export interface CoachingSignals {
  // Tasks
  overdueTasks: number;
  stalledTasks: number; // pending > 3 days
  totalPendingTasks: number;

  // Goals
  totalGoals: number;
  offTrackGoals: Array<{
    name: string;
    progress: number;
    trajectory: string;
    daysRemaining: number | null;
  }>;

  // Health
  sleepTrend: "improving" | "declining" | "stable" | "unknown";
  lastSleepScore: number | null;
  lastHRV: number | null;

  // Engagement
  daysSinceLastMessage: number;
  messagesLast7d: number;

  // Loop
  pendingInterventions: number;
  recentFeedbackAvg: number | null;

  // Config
  behaviorPresets: string[];
  proactivity: number;

  // Budget
  budgetUsedToday: number;
  dailyBudgetCents: number;

  // Primary goal (if set)
  primaryGoal: string | null;
}

/**
 * Collect all coaching signals for a tenant.
 * All queries run in parallel for speed.
 */
export async function collectCoachingSignals(
  tenantId: string,
): Promise<CoachingSignals> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);

  const startTime = Date.now();

  const [
    overdueResult,
    stalledResult,
    pendingResult,
    goalsResult,
    sleepResult,
    messagesResult,
    interventionsResult,
    feedbackResult,
    tenantResult,
    loopConfigResult,
    usageResult,
  ] = await Promise.allSettled([
    // 1. Overdue tasks
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("due_date", now.toISOString()),

    // 2. Stalled tasks (pending > 3 days)
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .lt("created_at", threeDaysAgo.toISOString()),

    // 3. Total pending
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),

    // 4. Goals with status
    supabase
      .from("exo_goal_statuses")
      .select(
        "trajectory, progress_percent, days_remaining, goal:exo_goals(name)",
      )
      .eq("tenant_id", tenantId),

    // 5. Last sleep entry
    supabase
      .from("exo_sleep_entries")
      .select("score, hrv_avg, date")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(7),

    // 6. Messages last 7 days
    supabase
      .from("exo_unified_messages")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", sevenDaysAgo.toISOString()),

    // 7. Pending interventions
    supabase
      .from("exo_interventions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),

    // 8. Recent feedback avg
    supabase
      .from("exo_feedback")
      .select("rating")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),

    // 9. Tenant config
    supabase
      .from("exo_tenants")
      .select("iors_personality, iors_behavior_presets")
      .eq("id", tenantId)
      .single(),

    // 10. Loop config
    supabase
      .from("exo_tenant_loop_config")
      .select("daily_ai_budget_cents")
      .eq("tenant_id", tenantId)
      .single(),

    // 11. Today's AI usage
    supabase
      .from("exo_ai_usage")
      .select("estimated_cost")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${today}T00:00:00Z`),
  ]);

  // Extract results safely
  const overdueTasks =
    overdueResult.status === "fulfilled" ? (overdueResult.value.count ?? 0) : 0;
  const stalledTasks =
    stalledResult.status === "fulfilled" ? (stalledResult.value.count ?? 0) : 0;
  const totalPendingTasks =
    pendingResult.status === "fulfilled" ? (pendingResult.value.count ?? 0) : 0;

  // Goals
  const goalRows =
    goalsResult.status === "fulfilled" ? (goalsResult.value.data ?? []) : [];
  const offTrackGoals = goalRows
    .filter(
      (g: { trajectory: string }) =>
        g.trajectory === "at_risk" || g.trajectory === "off_track",
    )
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (g: any) => {
        const goal = Array.isArray(g.goal) ? g.goal[0] : g.goal;
        return {
          name: goal?.name ?? "Unknown",
          progress: g.progress_percent ?? 0,
          trajectory: g.trajectory as string,
          daysRemaining: g.days_remaining as number | null,
        };
      },
    );

  // Sleep
  const sleepEntries =
    sleepResult.status === "fulfilled" ? (sleepResult.value.data ?? []) : [];
  const lastSleepScore =
    sleepEntries.length > 0
      ? (sleepEntries[0] as { score: number }).score
      : null;
  const lastHRV =
    sleepEntries.length > 0
      ? (sleepEntries[0] as { hrv_avg: number | null }).hrv_avg
      : null;

  // Sleep trend: compare avg of last 3 vs prior 3
  let sleepTrend: CoachingSignals["sleepTrend"] = "unknown";
  if (sleepEntries.length >= 4) {
    const recent =
      sleepEntries
        .slice(0, 3)
        .reduce((s: number, e: { score: number }) => s + (e.score ?? 0), 0) / 3;
    const prior =
      sleepEntries
        .slice(3, 6)
        .reduce((s: number, e: { score: number }) => s + (e.score ?? 0), 0) /
      Math.min(3, sleepEntries.length - 3);
    if (recent > prior + 5) sleepTrend = "improving";
    else if (recent < prior - 5) sleepTrend = "declining";
    else sleepTrend = "stable";
  }

  // Messages
  const messagesLast7d =
    messagesResult.status === "fulfilled"
      ? (messagesResult.value.count ?? 0)
      : 0;

  // Last message time
  let daysSinceLastMessage = 999;
  if (messagesLast7d > 0) {
    daysSinceLastMessage = 0; // at least one message in last 7d
  }

  // Interventions
  const pendingInterventions =
    interventionsResult.status === "fulfilled"
      ? (interventionsResult.value.count ?? 0)
      : 0;

  // Feedback
  const feedbackRows =
    feedbackResult.status === "fulfilled"
      ? (feedbackResult.value.data ?? [])
      : [];
  const recentFeedbackAvg =
    feedbackRows.length > 0
      ? feedbackRows.reduce(
          (s: number, r: { rating: number }) => s + (r.rating ?? 3),
          0,
        ) / feedbackRows.length
      : null;

  // Tenant config
  const tenant =
    tenantResult.status === "fulfilled" ? tenantResult.value.data : null;
  const personality =
    (tenant?.iors_personality as Record<string, unknown>) ?? {};
  const proactivity = (personality.proactivity as number) ?? 50;
  const behaviorPresets = (
    (tenant?.iors_behavior_presets as string[]) ?? []
  ).filter((p) => typeof p === "string");

  // Budget
  const dailyBudgetCents =
    loopConfigResult.status === "fulfilled"
      ? ((loopConfigResult.value.data?.daily_ai_budget_cents as number) ?? 50)
      : 50;
  const usageRows =
    usageResult.status === "fulfilled" ? (usageResult.value.data ?? []) : [];
  const budgetUsedToday =
    usageRows.reduce(
      (s: number, r: { estimated_cost: number }) => s + (r.estimated_cost ?? 0),
      0,
    ) * 100; // dollars to cents

  // Primary goal
  const primaryGoalRow =
    goalRows.length > 0 ? (goalRows[0] as Record<string, unknown>) : null;
  const primaryGoalRef = primaryGoalRow?.goal;
  const primaryGoal = primaryGoalRef
    ? ((Array.isArray(primaryGoalRef)
        ? primaryGoalRef[0]?.name
        : (primaryGoalRef as { name: string })?.name) ?? null)
    : null;

  logger.info(`[SignalCollector] Collected in ${Date.now() - startTime}ms`, {
    tenantId,
    overdueTasks,
    offTrackGoals: offTrackGoals.length,
    sleepTrend,
    messagesLast7d,
  });

  return {
    overdueTasks,
    stalledTasks,
    totalPendingTasks,
    totalGoals: goalRows.length,
    offTrackGoals,
    sleepTrend,
    lastSleepScore,
    lastHRV,
    daysSinceLastMessage,
    messagesLast7d,
    pendingInterventions,
    recentFeedbackAvg,
    behaviorPresets,
    proactivity,
    budgetUsedToday,
    dailyBudgetCents,
    primaryGoal,
  };
}
