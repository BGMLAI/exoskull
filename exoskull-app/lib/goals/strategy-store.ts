/**
 * Goal Strategy Store — persistence layer for goal strategies.
 *
 * Strategies are stored in exo_goal_strategies table.
 * Each goal can have multiple versions; only one can be active at a time.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface GoalStep {
  order: number;
  title: string;
  type:
    | "create_task"
    | "send_message"
    | "run_skill"
    | "schedule_reminder"
    | "research"
    | "build_app"
    | "delegate"
    | "create_event"
    | "send_email"
    | "make_call"
    | "connect_people"
    | "acquire_tool"
    | "modify_source";
  params: Record<string, unknown>;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  dueDate?: string;
  result?: string;
  failReason?: string;
}

export interface GoalStrategy {
  id: string;
  tenantId: string;
  goalId: string;
  approach: string;
  steps: GoalStep[];
  status:
    | "proposed"
    | "approved"
    | "active"
    | "completed"
    | "abandoned"
    | "regenerating";
  confidence: number;
  reasoning: string;
  contextSnapshot: Record<string, unknown>;
  version: number;
  nextStepIndex: number;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  lastReviewedAt: string | null;
}

// ============================================================================
// CRUD
// ============================================================================

export async function createStrategy(
  tenantId: string,
  goalId: string,
  data: {
    approach: string;
    steps: GoalStep[];
    confidence: number;
    reasoning: string;
    contextSnapshot?: Record<string, unknown>;
  },
): Promise<GoalStrategy> {
  const supabase = getServiceSupabase();

  // Get current max version for this goal
  const { data: existing } = await supabase
    .from("exo_goal_strategies")
    .select("version")
    .eq("goal_id", goalId)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = existing?.[0]?.version ? existing[0].version + 1 : 1;

  // Abandon any existing active/approved strategies
  await supabase
    .from("exo_goal_strategies")
    .update({ status: "abandoned" })
    .eq("goal_id", goalId)
    .in("status", ["proposed", "approved", "active"]);

  const { data: row, error } = await supabase
    .from("exo_goal_strategies")
    .insert({
      tenant_id: tenantId,
      goal_id: goalId,
      approach: data.approach,
      steps: data.steps,
      confidence: data.confidence,
      reasoning: data.reasoning,
      context_snapshot: data.contextSnapshot || {},
      version: nextVersion,
      status: "proposed",
      next_step_index: 0,
    })
    .select()
    .single();

  if (error || !row) {
    logger.error("[StrategyStore] Failed to create strategy:", {
      error: error?.message,
      goalId,
    });
    throw new Error(`Failed to create strategy: ${error?.message}`);
  }

  return mapRow(row);
}

export async function getActiveStrategy(
  goalId: string,
): Promise<GoalStrategy | null> {
  const supabase = getServiceSupabase();

  const { data: row } = await supabase
    .from("exo_goal_strategies")
    .select("*")
    .eq("goal_id", goalId)
    .in("status", ["approved", "active"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return row ? mapRow(row) : null;
}

export async function getLatestStrategy(
  goalId: string,
): Promise<GoalStrategy | null> {
  const supabase = getServiceSupabase();

  const { data: row } = await supabase
    .from("exo_goal_strategies")
    .select("*")
    .eq("goal_id", goalId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return row ? mapRow(row) : null;
}

export async function approveStrategy(strategyId: string): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .from("exo_goal_strategies")
    .update({
      status: "active",
      approved_at: new Date().toISOString(),
    })
    .eq("id", strategyId);
}

export async function updateStepStatus(
  strategyId: string,
  stepIndex: number,
  status: GoalStep["status"],
  result?: string,
  failReason?: string,
): Promise<void> {
  const supabase = getServiceSupabase();

  // Load current steps
  const { data: row } = await supabase
    .from("exo_goal_strategies")
    .select("steps, next_step_index")
    .eq("id", strategyId)
    .single();

  if (!row) return;

  const steps = row.steps as GoalStep[];
  if (stepIndex >= steps.length) return;

  steps[stepIndex].status = status;
  if (result) steps[stepIndex].result = result;
  if (failReason) steps[stepIndex].failReason = failReason;

  // Advance next_step_index if current step completed
  let nextStepIndex = row.next_step_index;
  if (status === "completed" || status === "skipped") {
    nextStepIndex = Math.max(nextStepIndex, stepIndex + 1);
  }

  // Check if all steps done
  const allDone = steps.every(
    (s) => s.status === "completed" || s.status === "skipped",
  );

  await supabase
    .from("exo_goal_strategies")
    .update({
      steps,
      next_step_index: nextStepIndex,
      status: allDone ? "completed" : undefined,
      completed_at: allDone ? new Date().toISOString() : undefined,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("id", strategyId);
}

export async function markReviewed(strategyId: string): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("exo_goal_strategies")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", strategyId);
}

export async function getStrategiesNeedingReview(
  tenantId: string,
): Promise<GoalStrategy[]> {
  const supabase = getServiceSupabase();

  // Active strategies not reviewed in 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("exo_goal_strategies")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${dayAgo}`);

  return (rows || []).map(mapRow);
}

// ============================================================================
// HELPERS
// ============================================================================

function mapRow(row: Record<string, unknown>): GoalStrategy {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    goalId: row.goal_id as string,
    approach: row.approach as string,
    steps: row.steps as GoalStep[],
    status: row.status as GoalStrategy["status"],
    confidence: Number(row.confidence) || 0,
    reasoning: (row.reasoning as string) || "",
    contextSnapshot: (row.context_snapshot as Record<string, unknown>) || {},
    version: (row.version as number) || 1,
    nextStepIndex: (row.next_step_index as number) || 0,
    createdAt: row.created_at as string,
    approvedAt: (row.approved_at as string) || null,
    completedAt: (row.completed_at as string) || null,
    lastReviewedAt: (row.last_reviewed_at as string) || null,
  };
}
