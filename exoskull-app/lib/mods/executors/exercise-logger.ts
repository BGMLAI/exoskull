// =====================================================
// EXERCISE LOGGER MOD EXECUTOR
// Log workouts: type, activity, duration, intensity
// Uses generic exo_mod_data table
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// =====================================================
// Types
// =====================================================

interface ExerciseEntry {
  type: "strength" | "cardio" | "flexibility" | "sports" | "other";
  activity: string;
  duration_minutes: number;
  intensity: number; // 1-10
  calories_burned?: number;
  notes?: string;
}

interface ExerciseStats {
  total_workouts: number;
  total_minutes: number;
  avg_intensity: number;
  avg_duration: number;
  top_activities: { activity: string; count: number }[];
  weekly_goal_met: boolean;
}

const EXERCISE_TYPES = [
  "strength",
  "cardio",
  "flexibility",
  "sports",
  "other",
] as const;

// =====================================================
// Executor
// =====================================================

export class ExerciseLoggerExecutor implements IModExecutor {
  readonly slug: ModSlug = "exercise-logger";

  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const weekAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const monthAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: entries, error } = await getServiceSupabase()
        .from("exo_mod_data")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("mod_slug", "exercise-logger")
        .gte("created_at", monthAgo)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("[ExerciseLogger] Fetch error:", error);
        throw error;
      }

      const all = (entries || []).map((e) => ({
        id: e.id,
        ...(e.data as ExerciseEntry),
        created_at: e.created_at,
      }));

      const weekly = all.filter((e) => e.created_at >= weekAgo);
      const weeklyStats = this.calculateStats(weekly, 150);

      return {
        recent: all.slice(0, 10),
        weekly: { entries: weekly, stats: weeklyStats },
        monthly: { entries: all, stats: this.calculateStats(all, 150) },
      };
    } catch (error) {
      logger.error("[ExerciseLogger] getData error:", error);
      return {
        recent: [],
        weekly: { entries: [], stats: null },
        monthly: { entries: [], stats: null },
      };
    }
  }

  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const insights: ModInsight[] = [];
    const now = new Date();

    try {
      const data = await this.getData(tenantId);
      const weeklyStats = (data.weekly as { stats: ExerciseStats | null })
        ?.stats;

      if (!weeklyStats || weeklyStats.total_workouts === 0) {
        insights.push({
          type: "info",
          title: "Start Moving",
          message:
            "No workouts logged this week. Try a quick 20-minute session!",
          action: {
            label: "Log Workout",
            type: "button",
            onClick: "log_exercise",
          },
          created_at: now.toISOString(),
        });
        return insights;
      }

      if (weeklyStats.weekly_goal_met) {
        insights.push({
          type: "success",
          title: "Goal Met!",
          message: `${weeklyStats.total_minutes} minutes of exercise this week. Great job!`,
          created_at: now.toISOString(),
        });
      } else {
        const remaining = 150 - weeklyStats.total_minutes;
        insights.push({
          type: "info",
          title: "Keep Going",
          message: `${weeklyStats.total_minutes}/150 minutes this week. ${remaining} more to hit your goal.`,
          created_at: now.toISOString(),
        });
      }

      if (weeklyStats.avg_intensity >= 7) {
        insights.push({
          type: "warning",
          title: "High Intensity",
          message:
            "Your average intensity is high. Make sure to include rest days.",
          created_at: now.toISOString(),
        });
      }

      if (weeklyStats.top_activities.length === 1) {
        insights.push({
          type: "info",
          title: "Mix It Up",
          message: `You've only done ${weeklyStats.top_activities[0].activity}. Try adding variety for balanced fitness.`,
          created_at: now.toISOString(),
        });
      }

      return insights;
    } catch (error) {
      logger.error("[ExerciseLogger] getInsights error:", error);
      return [
        {
          type: "warning",
          title: "Error",
          message: "Could not generate insights.",
          created_at: now.toISOString(),
        },
      ];
    }
  }

  async executeAction(
    tenantId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case "log_exercise": {
          const entry: ExerciseEntry = {
            type: (params.type as ExerciseEntry["type"]) || "other",
            activity: (params.activity as string) || "workout",
            duration_minutes: (params.duration_minutes as number) || 30,
            intensity: Math.min(
              10,
              Math.max(1, (params.intensity as number) || 5),
            ),
            calories_burned: params.calories_burned as number | undefined,
            notes: params.notes as string | undefined,
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .insert({
              tenant_id: tenantId,
              mod_slug: "exercise-logger",
              data: entry,
            })
            .select()
            .single();

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: {
              entry: data,
              message: `Logged ${entry.activity} (${entry.duration_minutes} min)`,
            },
          };
        }

        case "get_history": {
          const days = (params.days as number) || 30;
          const since = new Date(
            Date.now() - days * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("mod_slug", "exercise-logger")
            .gte("created_at", since)
            .order("created_at", { ascending: false });

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: { entries: data || [], count: data?.length || 0 },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      logger.error("[ExerciseLogger] executeAction error:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "log_exercise",
        name: "Log Exercise",
        description: "Record a workout session",
        params_schema: {
          type: "object",
          required: ["activity", "duration_minutes"],
          properties: {
            type: {
              type: "string",
              enum: EXERCISE_TYPES,
              description: "Exercise category",
            },
            activity: {
              type: "string",
              description: "Specific activity (e.g. running, bench press)",
            },
            duration_minutes: {
              type: "number",
              description: "Duration in minutes",
            },
            intensity: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Intensity 1-10",
            },
            calories_burned: {
              type: "number",
              description: "Estimated calories burned",
            },
            notes: { type: "string", description: "Optional notes" },
          },
        },
      },
      {
        slug: "get_history",
        name: "Get History",
        description: "Get exercise history",
        params_schema: {
          type: "object",
          properties: {
            days: {
              type: "number",
              default: 30,
              description: "Days to look back",
            },
          },
        },
      },
    ];
  }

  private calculateStats(
    entries: {
      duration_minutes: number;
      intensity: number;
      activity: string;
    }[],
    weeklyGoalMinutes: number,
  ): ExerciseStats {
    if (entries.length === 0) {
      return {
        total_workouts: 0,
        total_minutes: 0,
        avg_intensity: 0,
        avg_duration: 0,
        top_activities: [],
        weekly_goal_met: false,
      };
    }

    const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0);
    const avgIntensity =
      entries.reduce((s, e) => s + e.intensity, 0) / entries.length;

    const activityCounts: Record<string, number> = {};
    for (const e of entries) {
      activityCounts[e.activity] = (activityCounts[e.activity] || 0) + 1;
    }
    const topActivities = Object.entries(activityCounts)
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total_workouts: entries.length,
      total_minutes: totalMinutes,
      avg_intensity: Math.round(avgIntensity * 10) / 10,
      avg_duration: Math.round(totalMinutes / entries.length),
      top_activities: topActivities,
      weekly_goal_met: totalMinutes >= weeklyGoalMinutes,
    };
  }
}
