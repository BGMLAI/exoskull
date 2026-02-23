/**
 * Goal Feedback Loop
 *
 * When a task with goal_id is completed → auto-log progress, update strategy step status.
 * Closes the loop: Goal → Task → Completion → Progress Update
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logProgress } from "@/lib/goals/engine";
import { logger } from "@/lib/logger";

/**
 * Called when a task linked to a goal is completed.
 * Non-blocking — errors are logged, not thrown.
 */
export async function onTaskCompleted(
  tenantId: string,
  goalId: string,
  taskId: string,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const today = new Date().toISOString().split("T")[0];

    // Count goal-linked tasks completed today
    const { count } = await supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .filter("context->>goal_id", "eq", goalId)
      .in("status", ["done", "completed"])
      .gte("updated_at", today + "T00:00:00Z");

    const completedToday = count || 1;

    // Log progress checkpoint (value = completed tasks count)
    await logProgress(
      tenantId,
      goalId,
      completedToday,
      "task_completion",
      `Task ${taskId} completed`,
    );

    // Update strategy step if applicable
    await updateStrategyStepFromTask(goalId, taskId);

    // Record learning event
    await supabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: "goal_action_completed",
      data: {
        goal_id: goalId,
        task_id: taskId,
        completed_today: completedToday,
      },
      agent_id: "goal-feedback",
    });

    logger.info("[GoalFeedback] Task completion → goal progress logged:", {
      tenantId,
      goalId,
      taskId,
      completedToday,
    });
  } catch (error) {
    logger.error("[GoalFeedback] onTaskCompleted failed:", {
      error: error instanceof Error ? error.message : error,
      tenantId,
      goalId,
      taskId,
    });
  }
}

/**
 * If the completed task maps to a strategy step, mark it completed.
 */
async function updateStrategyStepFromTask(
  goalId: string,
  taskId: string,
): Promise<void> {
  try {
    const { getActiveStrategy, updateStepStatus } =
      await import("@/lib/goals/strategy-store");
    const strategy = await getActiveStrategy(goalId);
    if (!strategy) return;

    // Find step that created this task (by matching task title in step params)
    const supabase = getServiceSupabase();
    const { data: task } = await supabase
      .from("exo_tasks")
      .select("title")
      .eq("id", taskId)
      .single();

    if (!task) return;

    const stepIndex = strategy.steps.findIndex(
      (s) =>
        s.status === "in_progress" &&
        s.type === "create_task" &&
        (s.params.title as string)?.includes(task.title.slice(0, 30)),
    );

    if (stepIndex >= 0) {
      await updateStepStatus(
        strategy.id,
        stepIndex,
        "completed",
        `Task completed: ${task.title}`,
      );
    }
  } catch {
    // Non-critical — strategy step update is best-effort
  }
}
