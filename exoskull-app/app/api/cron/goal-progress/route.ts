// =====================================================
// CRON: /api/cron/goal-progress
// Daily goal progress calculation + milestone detection
// Schedule: 20:00 UTC (22:00 Poland, before evening reflection)
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { logProgress, detectMomentum } from "@/lib/goals/engine";
import { getTasks } from "@/lib/tasks/task-service";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import {
  reviewGoalStrategy,
  generateGoalStrategy,
  executeNextStep,
} from "@/lib/goals/strategy-engine";
import { getActiveStrategy } from "@/lib/goals/strategy-store";
import type { UserGoal, MeasurableProxy } from "@/lib/goals/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emitMilestoneReached,
  emitTrajectoryChanged,
  emitDeadlineApproaching,
  emitGoalCompleted,
} from "@/lib/goals/goal-events";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  try {
    // Get tenants with active goals
    const { data: tenantGoals } = await supabase
      .from("exo_user_goals")
      .select(
        "tenant_id, id, name, category, target_value, target_unit, frequency, direction, baseline_value, measurable_proxies, target_date, start_date",
      )
      .eq("is_active", true);

    if (!tenantGoals || tenantGoals.length === 0) {
      return NextResponse.json({
        status: "completed",
        message: "No active goals",
        duration_ms: Date.now() - startTime,
      });
    }

    // Group by tenant
    const byTenant = new Map<string, typeof tenantGoals>();
    for (const g of tenantGoals) {
      const existing = byTenant.get(g.tenant_id) || [];
      existing.push(g);
      byTenant.set(g.tenant_id, existing);
    }

    let checkpointsCreated = 0;
    let milestonesHit = 0;
    let interventionsProposed = 0;

    for (const [tenantId, goals] of byTenant) {
      for (const goal of goals) {
        try {
          const value = await collectGoalValue(
            supabase,
            tenantId,
            goal as unknown as UserGoal,
          );

          // Handle null data: create missing-data checkpoint instead of skipping
          if (value === null) {
            await handleMissingData(supabase, tenantId, goal);
            continue;
          }

          const checkpoint = await logProgress(
            tenantId,
            goal.id,
            value,
            "auto_cron",
          );

          checkpointsCreated++;

          // Persist trajectory to exo_user_goals for quick access
          await supabase
            .from("exo_user_goals")
            .update({
              trajectory: checkpoint.trajectory,
              last_checkpoint_at: new Date().toISOString(),
            })
            .eq("id", goal.id);

          // Milestone detection + goal events
          const pct = checkpoint.progress_percent ?? 0;
          if (pct > 0) {
            const milestones = [25, 50, 75, 100];
            for (const m of milestones) {
              if (pct >= m && pct < m + 5) {
                milestonesHit++;
                await emitMilestoneReached(tenantId, goal.id, goal.name, m);
                if (m === 100) {
                  await emitGoalCompleted(tenantId, goal.id, goal.name);
                }
              }
            }
          }

          // Trajectory change detection → emit event
          const { data: prevCheckpoint } = await supabase
            .from("exo_goal_checkpoints")
            .select("trajectory")
            .eq("goal_id", goal.id)
            .neq("checkpoint_date", new Date().toISOString().split("T")[0])
            .order("checkpoint_date", { ascending: false })
            .limit(1)
            .single();

          if (
            prevCheckpoint &&
            prevCheckpoint.trajectory !== checkpoint.trajectory
          ) {
            await emitTrajectoryChanged(
              tenantId,
              goal.id,
              goal.name,
              prevCheckpoint.trajectory,
              checkpoint.trajectory,
            );
          }

          // Deadline approaching detection
          if (goal.target_date) {
            const daysRemaining = Math.ceil(
              (new Date(goal.target_date).getTime() - Date.now()) / 86400000,
            );
            if ([7, 3, 1].includes(daysRemaining)) {
              await emitDeadlineApproaching(
                tenantId,
                goal.id,
                goal.name,
                daysRemaining,
                pct,
              );
            }
          }

          // Off-track detection → Strategy Engine (realize the goal, don't just nudge)
          if (
            checkpoint.trajectory === "off_track" ||
            checkpoint.trajectory === "at_risk"
          ) {
            try {
              const existingStrategy = await getActiveStrategy(goal.id);

              if (existingStrategy) {
                // Has active strategy → review and execute next step
                const review = await reviewGoalStrategy(tenantId, goal.id);
                if (review.needsNewPlan) {
                  await generateGoalStrategy(tenantId, goal.id);
                  interventionsProposed++;
                } else if (review.nextStep) {
                  await executeNextStep(tenantId, goal.id);
                  interventionsProposed++;
                }
              } else {
                // No strategy → generate one
                await generateGoalStrategy(tenantId, goal.id);
                interventionsProposed++;
              }
            } catch (strategyError) {
              // Fallback to old intervention if strategy engine fails
              logger.warn(
                "[GoalProgress] Strategy engine failed, falling back:",
                {
                  goalId: goal.id,
                  error:
                    strategyError instanceof Error
                      ? strategyError.message
                      : strategyError,
                },
              );
              try {
                await supabase.rpc("propose_intervention", {
                  p_tenant_id: tenantId,
                  p_type: "gap_detection",
                  p_title: `Cel zagrożony: ${goal.name}`,
                  p_description: `Cel "${goal.name}" wymaga uwagi. Postęp: ${Math.round(pct)}%. Trend: ${checkpoint.momentum}.`,
                  p_action_payload: {
                    action: "goal_strategy",
                    params: {
                      goalId: goal.id,
                      goalTitle: goal.name,
                      phase: "generate",
                    },
                  },
                  p_priority: "medium",
                  p_source_agent: "goal-progress-cron",
                  p_requires_approval: true,
                  p_scheduled_for: new Date(
                    Date.now() + 4 * 60 * 60 * 1000,
                  ).toISOString(),
                });
                interventionsProposed++;
              } catch {
                // Non-blocking
              }
            }
          }
        } catch (error) {
          logger.error("[GoalProgress] Error processing goal:", {
            goalId: goal.id,
            tenantId,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    // Strategy execution sweep: execute pending steps for ALL tenants
    for (const [tenantId] of byTenant) {
      if (Date.now() - startTime > 50_000) break; // Safety timeout
      try {
        const { reviewAllStrategies } =
          await import("@/lib/goals/strategy-engine");
        const reviewResult = await reviewAllStrategies(tenantId);
        if (reviewResult.stepsExecuted > 0 || reviewResult.regenerated > 0) {
          logger.info("[GoalProgress] Strategy sweep:", {
            tenantId,
            ...reviewResult,
          });
        }
      } catch (err) {
        logger.warn("[GoalProgress] Strategy sweep failed:", {
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[GoalProgress] Cron complete:", {
      tenantsProcessed: byTenant.size,
      goalsChecked: tenantGoals.length,
      checkpointsCreated,
      milestonesHit,
      interventionsProposed,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      tenants_processed: byTenant.size,
      goals_checked: tenantGoals.length,
      checkpoints_created: checkpointsCreated,
      milestones_hit: milestonesHit,
      interventions_proposed: interventionsProposed,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[GoalProgress] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

// =====================================================
// MISSING DATA HANDLING
// =====================================================

async function handleMissingData(
  supabase: SupabaseClient,
  tenantId: string,
  goal: { id: string; name: string },
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Create checkpoint with unknown trajectory
  await supabase
    .from("exo_goal_checkpoints")
    .upsert(
      {
        tenant_id: tenantId,
        goal_id: goal.id,
        checkpoint_date: today,
        value: 0,
        data_source: "auto_cron_missing",
        progress_percent: null,
        momentum: "stable",
        trajectory: "unknown",
        notes: "No data source available for automatic collection",
      },
      { onConflict: "goal_id,checkpoint_date" },
    )
    .then(({ error }) => {
      if (error)
        logger.warn(
          "[GoalProgress] Missing data checkpoint failed:",
          error.message,
        );
    });

  // Check consecutive missing-data checkpoints
  const { data: recentCheckpoints } = await supabase
    .from("exo_goal_checkpoints")
    .select("data_source")
    .eq("goal_id", goal.id)
    .order("checkpoint_date", { ascending: false })
    .limit(3);

  const consecutiveMissing = (recentCheckpoints || []).filter(
    (c) => c.data_source === "auto_cron_missing",
  ).length;

  // After 3 consecutive missing-data checkpoints → propose intervention
  if (consecutiveMissing >= 3) {
    try {
      await supabase.rpc("propose_intervention", {
        p_tenant_id: tenantId,
        p_type: "gap_detection",
        p_title: `Brak danych dla celu: ${goal.name}`,
        p_description: `Cel "${goal.name}" nie ma źródła danych od 3+ dni. Potrzebuję integracji lub skilla do śledzenia postępu.`,
        p_action_payload: {
          action: "build_app",
          params: {
            goalId: goal.id,
            goalName: goal.name,
            reason: "missing_data_source",
          },
        },
        p_priority: "medium",
        p_source_agent: "goal-progress-cron",
        p_requires_approval: true,
      });
    } catch {
      // Non-blocking
    }
  }
}

// =====================================================
// DATA COLLECTION FROM EXISTING TABLES
// =====================================================

async function collectGoalValue(
  supabase: SupabaseClient,
  tenantId: string,
  goal: UserGoal,
): Promise<number | null> {
  const today = new Date().toISOString().split("T")[0];

  // If goal has explicit measurable proxies, use them
  if (goal.measurable_proxies && goal.measurable_proxies.length > 0) {
    const proxyResult = await collectFromProxies(
      supabase,
      tenantId,
      goal.measurable_proxies,
      goal.frequency,
    );
    if (proxyResult !== null) return proxyResult;
  }

  // Try auto-fetch from connected rig data (exo_health_metrics)
  const rigValue = await collectFromRigData(supabase, tenantId, goal);
  if (rigValue !== null) return rigValue;

  // Auto-detect data source by category
  switch (goal.category) {
    case "health":
      return collectHealthData(supabase, tenantId, goal, today);
    case "productivity":
      return collectProductivityData(supabase, tenantId, today);
    case "mental":
      return collectMentalData(supabase, tenantId, today);
    case "finance":
      return collectFinanceData(supabase, tenantId, today);
    default:
      return null; // Manual-only for other categories
  }
}

/**
 * Auto-fetch goal progress from connected rig data (Oura, Google Fit, etc.)
 * Maps goal name/unit/category to known metric types in exo_health_metrics.
 */
async function collectFromRigData(
  supabase: SupabaseClient,
  tenantId: string,
  goal: UserGoal,
): Promise<number | null> {
  const unit = (goal.target_unit || "").toLowerCase();
  const name = (goal.name || "").toLowerCase();
  const since = getFrequencyStart(goal.frequency);

  // Map goal attributes to health metric types
  const metricMapping: Array<{
    match: (u: string, n: string, cat: string) => boolean;
    metricType: string;
    transform: (value: number) => number;
    aggregation: "avg" | "sum" | "latest";
  }> = [
    {
      match: (u, n) =>
        u.includes("hour") || u.includes("godzin") || n.includes("sleep") || n.includes("sen") || n.includes("śpi"),
      metricType: "sleep_duration_hours",
      transform: (v) => v,
      aggregation: "avg",
    },
    {
      match: (u, n) =>
        u.includes("krok") || u.includes("step") || n.includes("krok") || n.includes("step"),
      metricType: "steps",
      transform: (v) => v,
      aggregation: "avg",
    },
    {
      match: (u, n) =>
        u.includes("kalori") || u.includes("calor") || u.includes("kcal"),
      metricType: "calories",
      transform: (v) => v,
      aggregation: "avg",
    },
    {
      match: (u, n) =>
        n.includes("heart") || n.includes("puls") || n.includes("tętno") || n.includes("hrv"),
      metricType: "heart_rate",
      transform: (v) => v,
      aggregation: "avg",
    },
    {
      match: (u, n, cat) =>
        (u.includes("min") || u.includes("minut")) && cat === "health",
      metricType: "active_minutes",
      transform: (v) => v,
      aggregation: "sum",
    },
    {
      match: (u, n) =>
        n.includes("wag") || n.includes("weight") || u.includes("kg"),
      metricType: "weight",
      transform: (v) => v,
      aggregation: "latest",
    },
  ];

  for (const mapping of metricMapping) {
    if (!mapping.match(unit, name, goal.category)) continue;

    try {
      const { data: metrics } = await supabase
        .from("exo_health_metrics")
        .select("value, recorded_at")
        .eq("tenant_id", tenantId)
        .eq("metric_type", mapping.metricType)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false });

      if (!metrics || metrics.length === 0) continue;

      const values = metrics.map((m) => mapping.transform(Number(m.value))).filter((v) => !isNaN(v));
      if (values.length === 0) continue;

      switch (mapping.aggregation) {
        case "avg":
          return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
        case "sum":
          return values.reduce((a, b) => a + b, 0);
        case "latest":
          return values[0];
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function collectFromProxies(
  supabase: SupabaseClient,
  tenantId: string,
  proxies: MeasurableProxy[],
  frequency: string,
): Promise<number | null> {
  const tableMap: Record<string, string> = {
    activity_entries: "exo_activity_entries",
    sleep_entries: "exo_sleep_entries",
    mood_entries: "exo_mood_entries",
    habit_completions: "exo_habit_completions",
    tasks: "exo_tasks",
    transactions: "exo_transactions",
    health_metrics: "exo_health_metrics",
  };

  for (const proxy of proxies) {
    const tableName = tableMap[proxy.source];
    if (!tableName) continue;

    const since = getFrequencyStart(frequency);

    try {
      let query = supabase
        .from(tableName)
        .select(proxy.field)
        .eq("tenant_id", tenantId)
        .gte("created_at", since);

      // Apply filters if any
      if (proxy.filter) {
        for (const [key, val] of Object.entries(proxy.filter)) {
          query = query.eq(key, val);
        }
      }

      const { data } = await query;
      if (!data || data.length === 0) return null;

      const rows = data as unknown as Record<string, unknown>[];
      const values = rows
        .map((r) => Number(r[proxy.field]))
        .filter((v) => !isNaN(v));

      if (values.length === 0) return null;

      switch (proxy.aggregation) {
        case "sum":
          return values.reduce((a: number, b: number) => a + b, 0);
        case "avg":
          return (
            values.reduce((a: number, b: number) => a + b, 0) / values.length
          );
        case "count":
          return values.length;
        case "max":
          return Math.max(...values);
        case "min":
          return Math.min(...values);
        case "latest":
          return values[values.length - 1];
        default:
          return values[values.length - 1];
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function collectHealthData(
  supabase: SupabaseClient,
  tenantId: string,
  goal: UserGoal,
  today: string,
): Promise<number | null> {
  const unit = (goal.target_unit || "").toLowerCase();

  // Sleep-related goals
  if (
    unit.includes("hour") ||
    unit.includes("godzin") ||
    unit.includes("sleep")
  ) {
    const { data } = await supabase
      .from("exo_sleep_entries")
      .select("duration_minutes")
      .eq("tenant_id", tenantId)
      .eq("sleep_date", today)
      .limit(1)
      .single();

    if (data?.duration_minutes) {
      return Math.round((data.duration_minutes / 60) * 10) / 10;
    }
  }

  // Activity count (e.g., "3 workouts per week")
  if (
    unit.includes("raz") ||
    unit.includes("times") ||
    unit.includes("workout") ||
    unit.includes("trening")
  ) {
    const since = getFrequencyStart(goal.frequency);
    const { count } = await supabase
      .from("exo_activity_entries")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    return count || 0;
  }

  return null;
}

async function collectProductivityData(
  supabase: SupabaseClient,
  tenantId: string,
  today: string,
): Promise<number | null> {
  // Use dual-read service — handles both exo_tasks and user_ops
  const doneTasks = await getTasks(tenantId, { status: "done" });
  const todayStart = new Date(today).toISOString();
  const completedToday = doneTasks.filter(
    (t) => t.completed_at && t.completed_at >= todayStart,
  );
  return completedToday.length;
}

async function collectMentalData(
  supabase: SupabaseClient,
  tenantId: string,
  today: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("exo_mood_entries")
    .select("mood_value")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(today).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.mood_value || null;
}

async function collectFinanceData(
  supabase: SupabaseClient,
  tenantId: string,
  today: string,
): Promise<number | null> {
  const since = getFrequencyStart("monthly");

  const { data } = await supabase
    .from("exo_transactions")
    .select("amount")
    .eq("tenant_id", tenantId)
    .gte("created_at", since);

  if (!data || data.length === 0) return null;
  return data.reduce(
    (sum: number, t: { amount: number }) => sum + Math.abs(t.amount),
    0,
  );
}

function getFrequencyStart(frequency: string): string {
  const now = new Date();
  switch (frequency) {
    case "daily":
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    case "weekly":
      now.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    case "monthly":
      now.setDate(1);
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
    default:
      now.setHours(0, 0, 0, 0);
      return now.toISOString();
  }
}

export const GET = withCronGuard({ name: "goal-progress" }, handler);
