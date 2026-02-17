/**
 * Goal Engine — Layer 9: Self-Defining Success Metrics
 *
 * Core logic for defining goals, tracking progress, and detecting momentum.
 * AI-assisted goal extraction from natural language (Gemini Flash, Tier 1).
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import { aiChat } from "@/lib/ai";
import { createGoal as createGoalService } from "@/lib/goals/goal-service";
import { getGoal as getGoalById } from "@/lib/goals/goal-service";
import { dualReadGoal, dualReadGoals } from "@/lib/tasks/dual-read";
import type {
  UserGoal,
  GoalCheckpoint,
  GoalInput,
  GoalStatus,
  MeasurableProxy,
  Momentum,
  Trajectory,
  GoalCategory,
} from "./types";

import { logger } from "@/lib/logger";
// =====================================================
// DEFINE GOAL (AI-assisted)
// =====================================================

/**
 * Define a new goal from user input.
 * Uses AI to extract category, measurable proxies, and direction.
 */
export async function defineGoal(
  tenantId: string,
  input: GoalInput,
): Promise<UserGoal> {
  const supabase = createServiceClient();

  // Use AI to enrich goal if category/proxies not provided
  let enriched = { ...input };
  if (!input.category || !input.target_value) {
    enriched = await enrichGoalWithAI(input);
  }

  const category = (enriched.category || "health") as GoalCategory;

  // Use goal-service for dual-write (legacy + Tyrolka)
  const result = await createGoalService(tenantId, {
    name: enriched.name,
    category: category as any,
    description: enriched.description,
    target_type: enriched.target_value ? "numeric" : "boolean",
    target_value: enriched.target_value,
    target_unit: enriched.target_unit,
    baseline_value: enriched.baseline_value,
    frequency: enriched.frequency || "daily",
    direction: enriched.direction || "increase",
    start_date: new Date().toISOString().split("T")[0],
    target_date: enriched.target_date,
    is_active: true,
    wellbeing_weight: getWellbeingWeight(category),
  });

  if (!result.id) {
    logger.error("[GoalEngine] defineGoal failed:", {
      error: result.error,
      tenantId,
      input,
    });
    throw new Error(`Failed to create goal: ${result.error || "unknown"}`);
  }

  // Reload the full goal object for return (via goal-service: dual-read Tyrolka first, legacy fallback)
  const reloaded = await getGoalById(result.id, tenantId, supabase);
  if (!reloaded) {
    throw new Error(`Goal created but could not reload: ${result.id}`);
  }

  // Cast to UserGoal — goal-service returns Goal which covers base fields
  return reloaded as unknown as UserGoal;
}

/**
 * Use Gemini Flash to extract structured goal data from natural language.
 */
async function enrichGoalWithAI(input: GoalInput): Promise<GoalInput> {
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content: `You extract structured goal data from natural language. Output ONLY valid JSON.

Categories: health, productivity, finance, mental, social, learning, creativity.
Directions: "increase" (more is better), "decrease" (less is better).
Frequencies: "daily", "weekly", "monthly".

Example input: "Chcę schudnąć 5kg do lata"
Example output: {"name":"Schudnąć 5kg","category":"health","target_value":5,"target_unit":"kg_lost","direction":"decrease","frequency":"weekly","target_date":"2026-06-01","description":"Zmniejszyć wagę o 5kg"}

Example input: "Want to read 30 minutes every day"
Example output: {"name":"Read 30 min daily","category":"learning","target_value":30,"target_unit":"minutes","direction":"increase","frequency":"daily","description":"Daily reading habit"}

Return ONLY valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: `Extract goal data: "${input.name}"`,
        },
      ],
      {
        taskCategory: "simple_response", // Tier 1 - Gemini Flash
        maxTokens: 256,
      },
    );

    const parsed = JSON.parse(response.content);
    return {
      ...input,
      category: parsed.category || input.category,
      target_value: parsed.target_value || input.target_value,
      target_unit: parsed.target_unit || input.target_unit,
      direction: parsed.direction || input.direction,
      frequency: parsed.frequency || input.frequency,
      target_date: parsed.target_date || input.target_date,
      description: parsed.description || input.description,
    };
  } catch (error) {
    logger.error("[GoalEngine] AI enrichment failed:", {
      error: error instanceof Error ? error.message : error,
    });
    return input; // Return original if AI fails
  }
}

// =====================================================
// LOG PROGRESS
// =====================================================

/**
 * Log a progress checkpoint for a goal.
 */
export async function logProgress(
  tenantId: string,
  goalId: string,
  value: number,
  source: string = "manual",
  notes?: string,
): Promise<GoalCheckpoint> {
  const supabase = createServiceClient();

  // Load goal for progress calculation (dual-read: Tyrolka first, legacy fallback)
  const dualGoal = await dualReadGoal(goalId, tenantId);
  if (!dualGoal) {
    throw new Error(`Goal not found: ${goalId}`);
  }

  // TODO Phase 4: migrate to goal-service when Goal interface enriched with target_value, baseline_value, direction, frequency
  // Needs full UserGoal fields (target_value, baseline_value, direction, frequency) not available in Goal interface
  const { data: goal } = await supabase
    .from("exo_user_goals")
    .select("*")
    .eq("id", goalId)
    .single();

  if (!goal) {
    throw new Error(`Goal not found in legacy: ${goalId}`);
  }

  const progressPercent = calculateProgressPercent(goal as UserGoal, value);
  const momentum = await detectMomentum(goalId);
  const trajectory = determineTrajectory(
    goal as UserGoal,
    progressPercent,
    momentum,
  );

  const today = new Date().toISOString().split("T")[0];

  // TODO Phase 4: migrate when checkpoint service exists
  const { data, error } = await supabase
    .from("exo_goal_checkpoints")
    .upsert(
      {
        tenant_id: tenantId,
        goal_id: goalId,
        checkpoint_date: today,
        value,
        data_source: source,
        progress_percent: progressPercent,
        momentum,
        trajectory,
        notes,
      },
      { onConflict: "goal_id,checkpoint_date" },
    )
    .select()
    .single();

  if (error) {
    logger.error("[GoalEngine] logProgress failed:", {
      error: error.message,
      goalId,
      value,
    });
    throw new Error(`Failed to log progress: ${error.message}`);
  }

  return data as GoalCheckpoint;
}

/**
 * Log progress by goal name (fuzzy match).
 * Used by voice tools when user says "Dziś przebiegłem 5km".
 */
export async function logProgressByName(
  tenantId: string,
  goalName: string,
  value: number,
  source: string = "manual",
): Promise<GoalCheckpoint | null> {
  const supabase = createServiceClient();

  // Find best matching active goal (dual-read: Tyrolka + legacy)
  const goals = await dualReadGoals(tenantId, { is_active: true });

  if (!goals || goals.length === 0) return null;

  const nameLower = goalName.toLowerCase();
  const match = goals.find(
    (g) =>
      g.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(g.name.toLowerCase()) ||
      (g.target_unit && nameLower.includes(g.target_unit.toLowerCase())),
  );

  if (!match) return null;

  return logProgress(tenantId, match.id, value, source);
}

// =====================================================
// PROGRESS CALCULATION
// =====================================================

function calculateProgressPercent(
  goal: UserGoal,
  currentValue: number,
): number {
  if (!goal.target_value) return 0;

  const baseline = goal.baseline_value || 0;
  const target = goal.target_value;

  if (goal.direction === "decrease") {
    // E.g., lose 5kg: baseline=85, target=5 (kg to lose), current=83 → (85-83)/5 = 40%
    const lost = baseline - currentValue;
    return Math.min(100, Math.max(0, Math.round((lost / target) * 100)));
  }

  // Increase: target is the absolute goal
  if (goal.frequency === "daily") {
    // For daily goals, compare today's value vs target
    return Math.min(100, Math.round((currentValue / target) * 100));
  }

  // For cumulative goals
  const progress = currentValue - baseline;
  return Math.min(100, Math.max(0, Math.round((progress / target) * 100)));
}

/**
 * Detect momentum by analyzing recent checkpoints trend.
 */
export async function detectMomentum(
  goalId: string,
  days: number = 14,
): Promise<Momentum> {
  const supabase = createServiceClient();

  const { data: checkpoints } = await supabase.rpc(
    "get_goal_checkpoint_history",
    { p_goal_id: goalId, p_days: days },
  );

  if (!checkpoints || checkpoints.length < 3) return "stable";

  // Simple linear regression on values
  const values = (checkpoints as GoalCheckpoint[]).map((c) => c.value);
  const n = values.length;
  const half = Math.floor(n / 2);

  const firstHalfAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfAvg =
    values.slice(half).reduce((a, b) => a + b, 0) / (n - half);

  const diff = secondHalfAvg - firstHalfAvg;
  const threshold = firstHalfAvg * 0.05; // 5% change threshold

  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "stable";
}

function determineTrajectory(
  goal: UserGoal,
  progressPercent: number,
  momentum: Momentum,
): Trajectory {
  if (progressPercent >= 100) return "completed";

  if (!goal.target_date) {
    // No deadline — trajectory based on momentum
    if (momentum === "down" && goal.direction === "increase") return "at_risk";
    if (momentum === "up" && goal.direction === "decrease") return "at_risk";
    return "on_track";
  }

  // With deadline — check if velocity is sufficient
  const now = new Date();
  const deadline = new Date(goal.target_date);
  const start = new Date(goal.start_date);
  const totalDays = Math.max(
    1,
    (deadline.getTime() - start.getTime()) / 86400000,
  );
  const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / 86400000);
  const expectedProgress = (elapsedDays / totalDays) * 100;

  if (progressPercent >= expectedProgress * 0.9) return "on_track";
  if (progressPercent >= expectedProgress * 0.6) return "at_risk";
  return "off_track";
}

/**
 * Forecast completion date based on current velocity.
 */
export function forecastCompletion(
  goal: UserGoal,
  checkpoints: GoalCheckpoint[],
): string | null {
  if (!goal.target_value || checkpoints.length < 2) return null;

  const sorted = [...checkpoints].sort(
    (a, b) =>
      new Date(a.checkpoint_date).getTime() -
      new Date(b.checkpoint_date).getTime(),
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const daysBetween = Math.max(
    1,
    (new Date(last.checkpoint_date).getTime() -
      new Date(first.checkpoint_date).getTime()) /
      86400000,
  );

  const valueChange = last.value - first.value;
  const dailyVelocity = valueChange / daysBetween;

  if (Math.abs(dailyVelocity) < 0.001) return null; // No progress

  const remaining =
    goal.direction === "decrease"
      ? last.value - (goal.baseline_value || 0) + goal.target_value
      : goal.target_value - last.value;

  const daysToGo = Math.abs(remaining / dailyVelocity);
  const forecastDate = new Date();
  forecastDate.setDate(forecastDate.getDate() + Math.ceil(daysToGo));

  return forecastDate.toISOString().split("T")[0];
}

// =====================================================
// STATUS & QUERIES
// =====================================================

/**
 * Get all active goals with their current status.
 */
export async function getGoalStatus(tenantId: string): Promise<GoalStatus[]> {
  const supabase = createServiceClient();

  const { data: rows } = await supabase.rpc("get_active_goals_with_status", {
    p_tenant_id: tenantId,
  });

  if (!rows || rows.length === 0) return [];

  const statuses: GoalStatus[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    // Load recent checkpoints for forecast
    const { data: checkpoints } = await supabase.rpc(
      "get_goal_checkpoint_history",
      { p_goal_id: row.goal_id, p_days: 30 },
    );

    // Load full goal object (dual-read: Tyrolka first, legacy fallback)
    const dualG = await dualReadGoal(row.goal_id as string, tenantId);
    if (!dualG) continue;

    // TODO Phase 4: migrate to goal-service when Goal interface enriched with target_value, baseline_value, direction, frequency
    // Needs full UserGoal fields for forecastCompletion + trajectory calculation
    const { data: goal } = await supabase
      .from("exo_user_goals")
      .select("*")
      .eq("id", row.goal_id)
      .single();

    if (!goal) continue;

    const forecast = forecastCompletion(
      goal as UserGoal,
      (checkpoints || []) as GoalCheckpoint[],
    );

    // Calculate streak (consecutive days with checkpoints)
    const streak = calculateStreak((checkpoints || []) as GoalCheckpoint[]);

    statuses.push({
      goal: goal as UserGoal,
      progress_percent: (row.progress_percent as number) || 0,
      momentum: (row.momentum as Momentum) || "stable",
      trajectory: (row.trajectory as Trajectory) || "on_track",
      days_remaining: row.days_remaining as number | null,
      forecast_date: forecast,
      last_checkpoint: (checkpoints as GoalCheckpoint[])?.[
        (checkpoints as GoalCheckpoint[]).length - 1
      ],
      streak_days: streak,
    });
  }

  return statuses;
}

/**
 * Get goals formatted for voice response.
 */
export async function getGoalsForVoice(tenantId: string): Promise<string> {
  const statuses = await getGoalStatus(tenantId);

  if (statuses.length === 0) {
    return "Nie masz jeszcze zdefiniowanych celów. Powiedz mi czego chcesz, np. 'Chcę biegać 3 razy w tygodniu'.";
  }

  const lines = statuses.map((s) => {
    const emoji =
      s.trajectory === "on_track"
        ? "na dobrej drodze"
        : s.trajectory === "at_risk"
          ? "zagrożony"
          : s.trajectory === "completed"
            ? "OSIĄGNIĘTY!"
            : "wymaga uwagi";
    const days =
      s.days_remaining !== null ? `, ${s.days_remaining} dni do terminu` : "";
    const momentumText =
      s.momentum === "up"
        ? ", trend wzrostowy"
        : s.momentum === "down"
          ? ", trend spadkowy"
          : "";
    return `${s.goal.name}: ${Math.round(s.progress_percent)}% (${emoji}${days}${momentumText})`;
  });

  return `Twoje cele:\n${lines.join("\n")}`;
}

// =====================================================
// HELPERS
// =====================================================

function getWellbeingWeight(category: GoalCategory | string): number {
  // From ARCHITECTURE.md: mental health = 3x, physical = 2x, context = 1x
  const weights: Record<string, number> = {
    mental: 3.0,
    health: 2.0,
    social: 1.5,
    productivity: 1.0,
    finance: 1.0,
    learning: 1.0,
    creativity: 1.0,
  };
  return weights[category] || 1.0;
}

function calculateStreak(checkpoints: GoalCheckpoint[]): number {
  if (checkpoints.length === 0) return 0;

  const sorted = [...checkpoints].sort(
    (a, b) =>
      new Date(b.checkpoint_date).getTime() -
      new Date(a.checkpoint_date).getTime(),
  );

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const cpDate = new Date(sorted[i].checkpoint_date);
    cpDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);

    if (cpDate.getTime() === expectedDate.getTime()) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
