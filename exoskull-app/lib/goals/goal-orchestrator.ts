/**
 * Goal Orchestrator — Unified goal-driven orchestration layer.
 *
 * Replaces three independent loops (MAPE-K, Ralph, Strategy) with one
 * goal-driven orchestration entry point.
 *
 * For each tenant with active goals:
 *   1. Fetch all goals + latest checkpoints + strategies
 *   2. Determine needed action per goal
 *   3. Prioritize by urgency (deadline, weight, trajectory)
 *   4. Execute top 3 actions
 *   5. Record outcomes for learning
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getGoalStatus } from "@/lib/goals/engine";
import { logger } from "@/lib/logger";
import type { GoalStatus, Trajectory } from "./types";

// ============================================================================
// TYPES
// ============================================================================

interface GoalAction {
  goalId: string;
  goalName: string;
  type:
    | "generate_strategy"
    | "regenerate_strategy"
    | "execute_strategy_step"
    | "build_capability"
    | "nudge_user"
    | "celebrate"
    | "monitor";
  priority: number; // Lower = more urgent
  reason: string;
}

export interface OrchestrationResult {
  tenantId: string;
  goalsEvaluated: number;
  actionsPlanned: number;
  actionsExecuted: number;
  outcomes: Array<{
    goalId: string;
    action: string;
    success: boolean;
    detail?: string;
  }>;
  durationMs: number;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run goal orchestration for a tenant.
 * Called by loop-15 and conductor.
 */
export async function runGoalOrchestration(
  tenantId: string,
  budgetMs: number = 25_000,
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const result: OrchestrationResult = {
    tenantId,
    goalsEvaluated: 0,
    actionsPlanned: 0,
    actionsExecuted: 0,
    outcomes: [],
    durationMs: 0,
  };

  try {
    // Step 1: Fetch all goals with status
    const goalStatuses = await getGoalStatus(tenantId);
    result.goalsEvaluated = goalStatuses.length;

    if (goalStatuses.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Step 2: Determine actions per goal
    const actions = await planActions(tenantId, goalStatuses);
    result.actionsPlanned = actions.length;

    if (actions.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Step 3: Sort by priority (lower = more urgent) and take top 3
    actions.sort((a, b) => a.priority - b.priority);
    const topActions = actions.slice(0, 3);

    // Step 4: Execute actions
    for (const action of topActions) {
      if (Date.now() - startTime > budgetMs - 5_000) break;

      try {
        const outcome = await executeAction(tenantId, action);
        result.outcomes.push(outcome);
        result.actionsExecuted++;
      } catch (err) {
        logger.error("[GoalOrchestrator] Action failed:", {
          tenantId,
          goalId: action.goalId,
          action: action.type,
          error: err instanceof Error ? err.message : err,
        });
        result.outcomes.push({
          goalId: action.goalId,
          action: action.type,
          success: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 5: Record outcomes for learning
    if (result.outcomes.length > 0) {
      recordLearning(tenantId, result.outcomes).catch(() => {});
    }
  } catch (err) {
    logger.error("[GoalOrchestrator] Orchestration failed:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ============================================================================
// PLANNING
// ============================================================================

async function planActions(
  tenantId: string,
  goalStatuses: GoalStatus[],
): Promise<GoalAction[]> {
  const supabase = getServiceSupabase();
  const actions: GoalAction[] = [];

  for (const status of goalStatuses) {
    const goal = status.goal;
    const trajectory = status.trajectory;

    // Check if goal has an active strategy
    let hasActiveStrategy = false;
    try {
      const { getActiveStrategy } = await import("./strategy-store");
      const strategy = await getActiveStrategy(goal.id);
      hasActiveStrategy = !!strategy;
    } catch {
      // strategy-store may not be available
    }

    // Determine action based on trajectory + strategy state
    if (trajectory === "completed") {
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: "celebrate",
        priority: 50,
        reason: "Goal completed",
      });
    } else if (trajectory === "off_track" && !hasActiveStrategy) {
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: "generate_strategy",
        priority: 10, // Highest urgency
        reason: "Off-track without strategy",
      });
    } else if (trajectory === "off_track" && hasActiveStrategy) {
      // Check if strategy is stuck (no step completed in 3+ days)
      const isStuck = await isStrategyStuck(goal.id);
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: isStuck ? "regenerate_strategy" : "execute_strategy_step",
        priority: isStuck ? 15 : 20,
        reason: isStuck
          ? "Strategy stuck 3+ days"
          : "Execute next strategy step",
      });
    } else if (trajectory === "at_risk" && !hasActiveStrategy) {
      // Check if goal has data source
      const hasMeasurableData = status.last_checkpoint !== undefined;
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: hasMeasurableData ? "generate_strategy" : "build_capability",
        priority: hasMeasurableData ? 25 : 30,
        reason: hasMeasurableData
          ? "At-risk, needs strategy"
          : "At-risk, missing data source",
      });
    } else if (
      (trajectory === "at_risk" || trajectory === "on_track") &&
      hasActiveStrategy
    ) {
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: "execute_strategy_step",
        priority: trajectory === "at_risk" ? 35 : 60,
        reason: "Execute next strategy step",
      });
    } else if (trajectory === "unknown") {
      actions.push({
        goalId: goal.id,
        goalName: goal.name,
        type: "monitor",
        priority: 40,
        reason: "Unknown trajectory — needs monitoring",
      });
    }
  }

  return actions;
}

async function isStrategyStuck(goalId: string): Promise<boolean> {
  try {
    const supabase = getServiceSupabase();
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data } = await supabase
      .from("exo_goal_strategy_steps")
      .select("completed_at")
      .eq("goal_id", goalId)
      .eq("status", "completed")
      .gte("completed_at", threeDaysAgo)
      .limit(1);

    return !data || data.length === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

async function executeAction(
  tenantId: string,
  action: GoalAction,
): Promise<{
  goalId: string;
  action: string;
  success: boolean;
  detail?: string;
}> {
  switch (action.type) {
    case "generate_strategy":
    case "regenerate_strategy": {
      const { generateGoalStrategy } = await import("./strategy-engine");
      const strategy = await generateGoalStrategy(tenantId, action.goalId);
      return {
        goalId: action.goalId,
        action: action.type,
        success: true,
        detail: `Strategy created: ${strategy.steps?.length || 0} steps`,
      };
    }

    case "execute_strategy_step": {
      const { executeNextStep } = await import("./strategy-engine");
      const stepResult = await executeNextStep(tenantId, action.goalId);
      return {
        goalId: action.goalId,
        action: action.type,
        success: stepResult.executed,
        detail:
          stepResult.result || (stepResult.step?.title ?? "No pending step"),
      };
    }

    case "build_capability": {
      // Route to Ralph for capability building
      const { runRalphCycle } = await import("@/lib/iors/ralph-loop");
      const ralphResult = await runRalphCycle(tenantId, 15_000);
      return {
        goalId: action.goalId,
        action: action.type,
        success: ralphResult.outcome === "success",
        detail: ralphResult.action.description,
      };
    }

    case "nudge_user": {
      const { emitGoalEvent } = await import("./goal-events");
      await emitGoalEvent({
        type: "goal_blocked",
        tenantId,
        goalId: action.goalId,
        goalName: action.goalName,
        data: { reason: action.reason },
      });
      return {
        goalId: action.goalId,
        action: action.type,
        success: true,
        detail: "Nudge sent",
      };
    }

    case "celebrate": {
      const { emitGoalCompleted } = await import("./goal-events");
      await emitGoalCompleted(tenantId, action.goalId, action.goalName);
      return {
        goalId: action.goalId,
        action: action.type,
        success: true,
        detail: "Celebration sent",
      };
    }

    case "monitor": {
      // Run MAPE-K for monitoring
      const { runMapeKCycle } = await import("@/lib/autonomy/mape-k-loop");
      const mapekResult = await runMapeKCycle(
        tenantId,
        "cron",
        "goal-orchestrator",
      );
      return {
        goalId: action.goalId,
        action: action.type,
        success: true,
        detail: `MAPE-K: ${mapekResult.execute.interventionsExecuted} interventions`,
      };
    }

    default:
      return {
        goalId: action.goalId,
        action: action.type,
        success: false,
        detail: "Unknown action type",
      };
  }
}

// ============================================================================
// LEARNING
// ============================================================================

async function recordLearning(
  tenantId: string,
  outcomes: OrchestrationResult["outcomes"],
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const events = outcomes.map((o) => ({
      tenant_id: tenantId,
      event_type: `goal_orchestration_${o.action}`,
      event_data: {
        goal_id: o.goalId,
        success: o.success,
        detail: o.detail,
      },
      source: "goal-orchestrator",
      created_at: new Date().toISOString(),
    }));

    await supabase.from("exo_learning_events").insert(events);
  } catch {
    // Non-critical
  }
}
