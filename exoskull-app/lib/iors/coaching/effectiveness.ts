/**
 * Coaching Effectiveness Tracker
 *
 * Measures the impact of coaching interventions:
 * coaching message → user acknowledgement → user action → outcome.
 * Feeds back into optimization to improve coaching decisions.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { getTasks } from "@/lib/tasks/task-service";

export interface CoachingEffectivenessResult {
  /** Total coaching interventions in period */
  totalCoaching: number;
  /** Interventions acknowledged by user (replied to) */
  acknowledged: number;
  /** Interventions that led to user action (task completed, goal progress, etc.) */
  actedOn: number;
  /** Acknowledgement rate (0-1) */
  ackRate: number;
  /** Action rate (0-1) */
  actionRate: number;
  /** Average user feedback rating for coaching (1-5) */
  avgRating: number | null;
  /** Per-type breakdown */
  byType: Record<
    string,
    { count: number; ackRate: number; actionRate: number }
  >;
  /** Recommendations for optimization engine */
  recommendations: string[];
}

/**
 * Measure coaching effectiveness over the last 30 days.
 */
export async function measureEffectiveness(
  tenantId: string,
): Promise<CoachingEffectivenessResult> {
  const supabase = getServiceSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [interventionResult, feedbackResult, taskResult, msgResult] =
    await Promise.allSettled([
      // All coaching interventions
      supabase
        .from("exo_interventions")
        .select(
          "id, intervention_type, status, user_feedback, created_at, executed_at",
        )
        .eq("tenant_id", tenantId)
        .in("intervention_type", [
          "coaching_nudge",
          "proactive_insight",
          "goal_reminder",
          "health_alert",
          "task_followup",
          "reactivation",
          "day_planning",
          "gap_probe",
        ])
        .gte("created_at", thirtyDaysAgo),
      // Feedback specifically about coaching
      supabase
        .from("exo_feedback")
        .select("rating, context, created_at")
        .eq("tenant_id", tenantId)
        .in("feedback_type", ["response_quality", "personality"])
        .gte("created_at", thirtyDaysAgo),
      // Tasks completed (proxy for action) — via task-service
      getTasks(tenantId, { status: "done" }, supabase).then((tasks) => ({
        data: tasks
          .filter((t) => t.completed_at && t.completed_at >= thirtyDaysAgo)
          .map((t) => ({ completed_at: t.completed_at })),
        error: null,
      })),
      // User messages within 2h of coaching (acknowledgement proxy)
      supabase
        .from("exo_unified_messages")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("role", "user")
        .gte("created_at", thirtyDaysAgo),
    ]);

  const interventions =
    interventionResult.status === "fulfilled"
      ? (interventionResult.value.data ?? [])
      : [];
  const feedback =
    feedbackResult.status === "fulfilled"
      ? (feedbackResult.value.data ?? [])
      : [];
  const tasks =
    taskResult.status === "fulfilled" ? (taskResult.value.data ?? []) : [];
  const messages =
    msgResult.status === "fulfilled" ? (msgResult.value.data ?? []) : [];

  // Build timestamp sets for quick lookup
  const msgTimestamps = (messages as Array<{ created_at: string }>).map((m) =>
    new Date(m.created_at).getTime(),
  );

  const taskTimestamps = (tasks as Array<{ completed_at: string }>).map((t) =>
    new Date(t.completed_at).getTime(),
  );

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  let totalAcknowledged = 0;
  let totalActedOn = 0;
  const byType: Record<
    string,
    { count: number; acknowledged: number; actedOn: number }
  > = {};

  for (const iv of interventions as Array<{
    id: string;
    intervention_type: string;
    status: string;
    user_feedback: string | null;
    created_at: string;
    executed_at: string | null;
  }>) {
    const ivTime = new Date(iv.created_at).getTime();
    const type = iv.intervention_type;

    if (!byType[type]) byType[type] = { count: 0, acknowledged: 0, actedOn: 0 };
    byType[type].count++;

    // Acknowledged = user sent message within 2h of intervention
    const wasAcknowledged = msgTimestamps.some(
      (t) => t > ivTime && t < ivTime + TWO_HOURS,
    );
    if (wasAcknowledged || iv.user_feedback) {
      totalAcknowledged++;
      byType[type].acknowledged++;
    }

    // Acted on = task completed within 24h of intervention
    const wasActedOn =
      iv.status === "completed" ||
      taskTimestamps.some((t) => t > ivTime && t < ivTime + TWENTY_FOUR_HOURS);
    if (wasActedOn) {
      totalActedOn++;
      byType[type].actedOn++;
    }
  }

  const totalCoaching = interventions.length;
  const ackRate = totalCoaching > 0 ? totalAcknowledged / totalCoaching : 0;
  const actionRate = totalCoaching > 0 ? totalActedOn / totalCoaching : 0;

  // Feedback rating
  const ratings = (feedback as Array<{ rating: number | null }>)
    .map((f) => f.rating)
    .filter((r): r is number => r !== null && r > 0);
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;

  // Per-type rates
  const byTypeResult: CoachingEffectivenessResult["byType"] = {};
  for (const [type, data] of Object.entries(byType)) {
    byTypeResult[type] = {
      count: data.count,
      ackRate: data.count > 0 ? data.acknowledged / data.count : 0,
      actionRate: data.count > 0 ? data.actedOn / data.count : 0,
    };
  }

  // Generate recommendations for optimization engine
  const recommendations: string[] = [];

  if (ackRate < 0.3 && totalCoaching >= 5) {
    recommendations.push(
      "Niski ack rate (<30%) — coaching moze byc zbyt czesty lub w zlych godzinach.",
    );
  }

  if (actionRate < 0.2 && totalCoaching >= 5) {
    recommendations.push(
      "Niski action rate (<20%) — coaching nie prowadzi do dzialania. Zmien styl lub typ.",
    );
  }

  // Find worst-performing type
  const typeEntries = Object.entries(byTypeResult).filter(
    ([, d]) => d.count >= 3,
  );
  if (typeEntries.length > 0) {
    const worst = typeEntries.sort((a, b) => a[1].ackRate - b[1].ackRate)[0];
    if (worst[1].ackRate < 0.2) {
      recommendations.push(
        `Typ "${worst[0]}" ma najnizszy ack rate (${Math.round(worst[1].ackRate * 100)}%). Rozważ wyłączenie lub zmianę podejścia.`,
      );
    }
  }

  if (avgRating !== null && avgRating < 2.5) {
    recommendations.push(
      `Srednia ocena ${avgRating}/5 — uzytkownik niezadowolony. Coaching wymaga zmiany stylu.`,
    );
  }

  logger.info("[Effectiveness] Measured", {
    tenantId,
    totalCoaching,
    ackRate: Math.round(ackRate * 100),
    actionRate: Math.round(actionRate * 100),
    avgRating,
    recommendations: recommendations.length,
  });

  return {
    totalCoaching,
    acknowledged: totalAcknowledged,
    actedOn: totalActedOn,
    ackRate,
    actionRate,
    avgRating,
    byType: byTypeResult,
    recommendations,
  };
}
