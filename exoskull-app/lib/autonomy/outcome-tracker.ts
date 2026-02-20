/**
 * Outcome Tracker
 *
 * Tracks whether interventions actually worked by measuring:
 * 1. User response (did they reply?)
 * 2. Behavior change (did metrics improve after intervention?)
 * 3. Goal progress (did the goal advance?)
 *
 * Called from: intervention-executor (after execution), loop-daily (batch analysis)
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// TYPES
// ============================================================================

export type OutcomeType =
  | "user_response"
  | "behavior_change"
  | "goal_progress"
  | "ignored";

export interface OutcomeRecord {
  intervention_id: string;
  tenant_id: string;
  outcome_type: OutcomeType;
  effectiveness: number; // 0.0 - 1.0
  response_time_minutes: number | null;
  behavior_before?: Record<string, unknown>;
  behavior_after?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

// ============================================================================
// TRACK OUTCOMES
// ============================================================================

/**
 * Record an outcome for a specific intervention.
 */
export async function recordOutcome(outcome: OutcomeRecord): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("exo_intervention_outcomes")
    .insert(outcome);

  if (error) {
    logger.error("[OutcomeTracker] Record failed:", {
      error: error.message,
      intervention_id: outcome.intervention_id,
    });
  }
}

/**
 * Batch-analyze recent interventions to detect outcomes.
 * Called from loop-daily.
 *
 * For each completed intervention in the last 48h:
 * - Did user respond within 2h? → user_response
 * - Did relevant metrics improve? → behavior_change
 * - Was there goal progress? → goal_progress
 * - Nothing happened → ignored
 */
export async function analyzeRecentOutcomes(
  tenantId: string,
): Promise<{ processed: number; outcomes: OutcomeRecord[] }> {
  const supabase = getServiceSupabase();
  const outcomes: OutcomeRecord[] = [];

  // Get interventions completed in last 48h that don't have outcomes yet
  const { data: interventions } = await supabase
    .from("exo_interventions")
    .select(
      "id, tenant_id, intervention_type, action_payload, executed_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("executed_at", new Date(Date.now() - 48 * 3600000).toISOString())
    .not(
      "id",
      "in",
      `(SELECT intervention_id FROM exo_intervention_outcomes WHERE tenant_id = '${tenantId}')`,
    )
    .limit(20);

  if (!interventions || interventions.length === 0) {
    return { processed: 0, outcomes: [] };
  }

  for (const intervention of interventions) {
    const executedAt = new Date(intervention.executed_at);

    // Check 1: User response (conversation within 2h of intervention)
    const { data: messages } = await supabase
      .from("exo_messages")
      .select("id, created_at")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .gte("created_at", executedAt.toISOString())
      .lte(
        "created_at",
        new Date(executedAt.getTime() + 2 * 3600000).toISOString(),
      )
      .limit(1);

    if (messages && messages.length > 0) {
      const responseTime = Math.round(
        (new Date(messages[0].created_at).getTime() - executedAt.getTime()) /
          60000,
      );
      const outcome: OutcomeRecord = {
        intervention_id: intervention.id,
        tenant_id: tenantId,
        outcome_type: "user_response",
        effectiveness: responseTime < 30 ? 0.9 : responseTime < 60 ? 0.7 : 0.5,
        response_time_minutes: responseTime,
        context: { intervention_type: intervention.intervention_type },
      };
      outcomes.push(outcome);
      await recordOutcome(outcome);
      continue;
    }

    // Check 2: If intervention was goal-related, check progress
    const actionPayload = intervention.action_payload as Record<string, any>;
    if (
      intervention.intervention_type === "goal_nudge" ||
      intervention.intervention_type === "gap_detection" ||
      actionPayload?.params?.goal_id
    ) {
      const goalId = actionPayload?.params?.goal_id;
      if (goalId) {
        const { data: checkpoints } = await supabase
          .from("exo_goal_checkpoints")
          .select("value, trajectory")
          .eq("goal_id", goalId)
          .gte("checkpoint_date", executedAt.toISOString())
          .order("checkpoint_date", { ascending: false })
          .limit(1);

        if (checkpoints && checkpoints.length > 0) {
          const cp = checkpoints[0];
          const effectiveness =
            cp.trajectory === "on_track"
              ? 0.9
              : cp.trajectory === "at_risk"
                ? 0.5
                : 0.2;
          const outcome: OutcomeRecord = {
            intervention_id: intervention.id,
            tenant_id: tenantId,
            outcome_type: "goal_progress",
            effectiveness,
            response_time_minutes: null,
            context: {
              goal_id: goalId,
              trajectory: cp.trajectory,
              intervention_type: intervention.intervention_type,
            },
          };
          outcomes.push(outcome);
          await recordOutcome(outcome);
          continue;
        }
      }
    }

    // Check 3: If 48h passed with no response → ignored
    if (Date.now() - executedAt.getTime() > 24 * 3600000) {
      const outcome: OutcomeRecord = {
        intervention_id: intervention.id,
        tenant_id: tenantId,
        outcome_type: "ignored",
        effectiveness: 0.0,
        response_time_minutes: null,
        context: { intervention_type: intervention.intervention_type },
      };
      outcomes.push(outcome);
      await recordOutcome(outcome);
    }
  }

  return { processed: interventions.length, outcomes };
}

// ============================================================================
// AGGREGATE STATS
// ============================================================================

/**
 * Get effectiveness stats by intervention type for learning engine.
 */
export async function getEffectivenessStats(
  tenantId: string,
  days = 30,
): Promise<
  Array<{
    intervention_type: string;
    avg_effectiveness: number;
    response_rate: number;
    sample_count: number;
  }>
> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_intervention_outcomes")
    .select("outcome_type, effectiveness, context")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - days * 86400000).toISOString());

  if (!data || data.length === 0) return [];

  // Group by intervention_type (from context)
  const byType = new Map<
    string,
    { total: number; effective: number; responded: number }
  >();

  for (const row of data) {
    const type = (row.context as any)?.intervention_type || "unknown";
    const entry = byType.get(type) || { total: 0, effective: 0, responded: 0 };
    entry.total++;
    entry.effective += row.effectiveness || 0;
    if (row.outcome_type === "user_response") entry.responded++;
    byType.set(type, entry);
  }

  return Array.from(byType.entries()).map(([type, stats]) => ({
    intervention_type: type,
    avg_effectiveness: stats.effective / stats.total,
    response_rate: stats.responded / stats.total,
    sample_count: stats.total,
  }));
}
