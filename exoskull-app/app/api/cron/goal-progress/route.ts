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

          if (value === null) continue; // No data to collect

          const checkpoint = await logProgress(
            tenantId,
            goal.id,
            value,
            "auto_cron",
          );

          checkpointsCreated++;

          // Milestone detection (25%, 50%, 75%, 100%) → notify user
          const pct = checkpoint.progress_percent ?? 0;
          if (pct > 0) {
            const milestones = [25, 50, 75, 100];
            for (const m of milestones) {
              if (pct >= m && pct < m + 5) {
                milestonesHit++;
                const emoji = m === 100 ? "!!!" : m >= 75 ? "!!" : "!";
                await sendProactiveMessage(
                  tenantId,
                  `Cel "${goal.name}": ${m}% ukończone${emoji} ${m === 100 ? "Gratulacje, cel osiągnięty!" : "Tak trzymaj!"}`,
                  "goal_milestone",
                  "goal-progress-cron",
                );
              }
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
    return collectFromProxies(
      supabase,
      tenantId,
      goal.measurable_proxies,
      goal.frequency,
    );
  }

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
