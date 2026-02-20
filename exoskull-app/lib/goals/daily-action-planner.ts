/**
 * Goal Daily Action Planner
 *
 * Each morning: reads active goals → generates concrete daily actions → creates tasks.
 * Each evening: checks which actions were completed → updates goal progress.
 *
 * This closes the loop: Goal → Daily Action → Execution → Progress Update
 */

import { createClient } from "@supabase/supabase-js";
import { getGoals } from "./goal-service";
import { createTask } from "@/lib/tasks/task-service";
import { ModelRouter } from "@/lib/ai/model-router";
import type { Trajectory } from "./types";
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

export interface DailyAction {
  goalId: string;
  goalName: string;
  action: string;
  priority: "high" | "medium" | "low";
  category: string;
}

export interface DailyPlanResult {
  tenantId: string;
  actions: DailyAction[];
  tasksCreated: number;
  goalsProcessed: number;
  briefingSection: string;
}

// ============================================================================
// MORNING: Generate daily actions from goals
// ============================================================================

/**
 * Generate today's actions based on active goals.
 * Called from morning-briefing CRON.
 *
 * Returns actions + a formatted text section for the morning briefing.
 */
export async function planDailyActions(
  tenantId: string,
): Promise<DailyPlanResult> {
  const result: DailyPlanResult = {
    tenantId,
    actions: [],
    tasksCreated: 0,
    goalsProcessed: 0,
    briefingSection: "",
  };

  try {
    const supabase = getServiceSupabase();

    // 1. Get active goals with latest checkpoint
    const goals = await getGoals(tenantId, { is_active: true, limit: 10 });
    if (!goals || goals.length === 0) return result;

    // 2. Get latest checkpoints for trajectory info
    const goalIds = goals.map((g: any) => g.id);
    const { data: checkpoints } = await supabase
      .from("exo_goal_checkpoints")
      .select("goal_id, trajectory, momentum, progress_percent, value")
      .in("goal_id", goalIds)
      .order("checkpoint_date", { ascending: false });

    // Build goal status map (latest checkpoint per goal)
    const statusMap = new Map<
      string,
      { trajectory: Trajectory; momentum: string; progress: number }
    >();
    if (checkpoints) {
      for (const cp of checkpoints) {
        if (!statusMap.has(cp.goal_id)) {
          statusMap.set(cp.goal_id, {
            trajectory: cp.trajectory || "on_track",
            momentum: cp.momentum || "stable",
            progress: cp.progress_percent || 0,
          });
        }
      }
    }

    // 3. Filter goals that need attention (off_track, at_risk, or no checkpoint)
    const goalsNeedingAction = goals.filter((g: any) => {
      const status = statusMap.get(g.id);
      if (!status) return true; // No checkpoint = needs action
      return (
        status.trajectory === "off_track" || status.trajectory === "at_risk"
      );
    });

    if (goalsNeedingAction.length === 0) {
      // All goals on track — still generate a brief summary
      result.briefingSection = formatOnTrackSummary(goals, statusMap);
      return result;
    }

    result.goalsProcessed = goalsNeedingAction.length;

    // 4. Generate daily actions via AI (Tier 1 — cheap)
    const router = new ModelRouter();
    const goalsContext = goalsNeedingAction.map((g: any) => {
      const status = statusMap.get(g.id);
      return {
        name: g.name || g.title,
        category: g.category,
        target: g.target_value
          ? `${g.target_value} ${g.target_unit || ""}`
          : null,
        trajectory: status?.trajectory || "unknown",
        momentum: status?.momentum || "unknown",
        progress: status ? `${status.progress}%` : "no data",
        deadline: g.target_date,
      };
    });

    const response = await router.route({
      messages: [
        {
          role: "system",
          content: `You generate CONCRETE daily actions for goals that are off-track or at-risk.
Rules:
- Max 2 actions per goal, max 5 actions total
- Each action must be specific and achievable TODAY
- Focus on the highest-impact action first
- Return JSON array: [{ "goalName": "...", "action": "...", "priority": "high|medium|low" }]
- Use the user's language (likely Polish)
- Keep actions under 80 chars`,
        },
        {
          role: "user",
          content: `Goals needing attention:\n${JSON.stringify(goalsContext, null, 2)}`,
        },
      ],
      taskCategory: "simple_response",
      tenantId,
      maxTokens: 400,
      temperature: 0.3,
    });

    // 5. Parse AI response
    let actions: DailyAction[] = [];
    try {
      const parsed = JSON.parse(
        response.content.replace(/```json?\n?/g, "").replace(/```/g, ""),
      );
      if (Array.isArray(parsed)) {
        actions = parsed.slice(0, 5).map((a: any) => ({
          goalId:
            goalsNeedingAction.find(
              (g: any) => (g.name || g.title) === a.goalName,
            )?.id || "",
          goalName: a.goalName || "",
          action: a.action || "",
          priority: a.priority || "medium",
          category:
            goalsNeedingAction.find(
              (g: any) => (g.name || g.title) === a.goalName,
            )?.category || "productivity",
        }));
      }
    } catch {
      logger.warn("[DailyActionPlanner] Failed to parse AI response");
    }

    result.actions = actions;

    // 6. Create tasks for each action
    for (const action of actions) {
      try {
        const priorityMap: Record<string, 1 | 2 | 3 | 4> = {
          high: 2,
          medium: 3,
          low: 4,
        };

        const taskResult = await createTask(tenantId, {
          title: action.action,
          description: `Cel: ${action.goalName}`,
          priority: priorityMap[action.priority] || 3,
          due_date: new Date().toISOString().split("T")[0],
          status: "pending",
          context: {
            source: "daily-action-planner",
            goal_id: action.goalId,
            auto_generated: true,
          },
        });

        if (taskResult.id) {
          result.tasksCreated++;
        }
      } catch (err) {
        logger.error("[DailyActionPlanner] Task creation failed:", {
          action: action.action,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    // 7. Build briefing section
    result.briefingSection = formatActionsBriefing(actions, goals, statusMap);

    logger.info("[DailyActionPlanner] Plan generated:", {
      tenantId,
      goalsProcessed: result.goalsProcessed,
      actions: actions.length,
      tasksCreated: result.tasksCreated,
    });

    return result;
  } catch (error) {
    logger.error("[DailyActionPlanner] Failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return result;
  }
}

// ============================================================================
// EVENING: Check daily action completion
// ============================================================================

/**
 * Check which daily actions were completed.
 * Called from evening-reflection CRON.
 */
export async function reviewDailyActions(
  tenantId: string,
): Promise<{ completed: number; total: number; summary: string }> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Find today's auto-generated tasks
  const { data: tasks } = await supabase
    .from("exo_tasks")
    .select("id, title, status, context")
    .eq("tenant_id", tenantId)
    .eq("due_date", today)
    .filter("context->>source", "eq", "daily-action-planner");

  if (!tasks || tasks.length === 0) {
    return { completed: 0, total: 0, summary: "" };
  }

  const completed = tasks.filter(
    (t) => t.status === "completed" || t.status === "done",
  ).length;
  const total = tasks.length;

  // Track consecutive days of failure per goal
  if (completed < total) {
    const failedGoalIds = tasks
      .filter((t) => t.status !== "completed" && t.status !== "done")
      .map((t) => t.context?.goal_id)
      .filter(Boolean);

    // Record for learning engine
    for (const goalId of new Set(failedGoalIds)) {
      await supabase.from("learning_events").insert({
        tenant_id: tenantId,
        event_type: "goal_action_missed",
        data: { goal_id: goalId, date: today },
        agent_id: "daily-action-planner",
      });
    }
  }

  const summary =
    completed === total
      ? `Wszystkie ${total} działania na dziś wykonane!`
      : `Wykonano ${completed}/${total} zaplanowanych działań.`;

  return { completed, total, summary };
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatOnTrackSummary(
  goals: any[],
  statusMap: Map<string, { trajectory: Trajectory; progress: number }>,
): string {
  if (goals.length === 0) return "";
  const lines = goals.slice(0, 3).map((g: any) => {
    const status = statusMap.get(g.id);
    const progress = status ? `${status.progress}%` : "?";
    return `• ${g.name || g.title}: ${progress}`;
  });
  return `Cele na dobrej drodze:\n${lines.join("\n")}`;
}

function formatActionsBriefing(
  actions: DailyAction[],
  goals: any[],
  statusMap: Map<string, { trajectory: Trajectory; progress: number }>,
): string {
  if (actions.length === 0) return "";

  const lines = actions.map((a) => {
    const icon = a.priority === "high" ? "!" : "•";
    return `${icon} ${a.action}`;
  });

  return `Dziś dla celów:\n${lines.join("\n")}`;
}
