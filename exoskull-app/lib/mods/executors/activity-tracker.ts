// =====================================================
// ACTIVITY TRACKER MOD EXECUTOR
// Track activity via Oura Ring, Google Fit, or manual entries
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import {
  OuraClient,
  createOuraClient,
  OuraDailyActivity,
  OuraWorkout,
} from "../../rigs/oura/client";
import { RigConnection } from "../../rigs/types";

import { logger } from "@/lib/logger";
// =====================================================
// TYPES
// =====================================================

interface ActivityEntry {
  id: string;
  source: "oura" | "google-fit" | "manual" | "strava";
  date: string;
  activity_type: string;
  duration_minutes: number;
  calories_burned: number | null;
  steps: number | null;
  distance_meters: number | null;
  intensity: "easy" | "moderate" | "hard" | "very_hard" | null;
  average_hr: number | null;
  notes: string | null;
}

interface DailySummary {
  date: string;
  total_steps: number;
  total_calories: number;
  total_active_minutes: number;
  activity_score: number | null;
  workouts: ActivityEntry[];
}

interface ActivityGoal {
  daily_steps: number;
  daily_active_minutes: number;
  weekly_workouts: number;
}

interface ActivityStats {
  avg_daily_steps: number;
  avg_daily_calories: number;
  avg_daily_active_minutes: number;
  total_workouts: number;
  total_entries: number;
  goal_completion_rate: number;
}

// =====================================================
// EXECUTOR
// =====================================================

export class ActivityTrackerExecutor implements IModExecutor {
  // Note: 'energy-monitor' is in ModSlug, activity-tracker is not
  // Using 'energy-monitor' as the closest match until ModSlug is updated
  readonly slug: ModSlug = "energy-monitor";

  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async getOuraConnection(
    tenantId: string,
  ): Promise<RigConnection | null> {
    const { data, error } = await this.supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("rig_type", "oura")
      .single();

    if (error || !data) return null;
    return data as RigConnection;
  }

  private async getOuraClient(tenantId: string): Promise<OuraClient | null> {
    const connection = await this.getOuraConnection(tenantId);
    return connection ? createOuraClient(connection) : null;
  }

  private async getActivityGoal(tenantId: string): Promise<ActivityGoal> {
    const { data } = await this.supabase
      .from("exo_health_goals")
      .select("goal_type, target_value")
      .eq("tenant_id", tenantId)
      .in("goal_type", ["steps", "active_minutes", "workouts_per_week"]);

    const goals: ActivityGoal = {
      daily_steps: 10000,
      daily_active_minutes: 30,
      weekly_workouts: 3,
    };

    data?.forEach((g) => {
      if (g.goal_type === "steps") goals.daily_steps = g.target_value;
      if (g.goal_type === "active_minutes")
        goals.daily_active_minutes = g.target_value;
      if (g.goal_type === "workouts_per_week")
        goals.weekly_workouts = g.target_value;
    });

    return goals;
  }

  private async getManualEntries(
    tenantId: string,
    days: number = 7,
  ): Promise<ActivityEntry[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from("exo_activity_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("start_time", startDate.toISOString())
      .order("start_time", { ascending: false });

    if (error || !data) return [];

    return data.map((entry) => ({
      id: entry.id,
      source: entry.source,
      date: new Date(entry.start_time).toISOString().split("T")[0],
      activity_type: entry.activity_type,
      duration_minutes: entry.duration_minutes || 0,
      calories_burned: entry.calories_burned,
      steps: entry.steps,
      distance_meters: entry.distance_meters,
      intensity: entry.intensity,
      average_hr: entry.average_hr,
      notes: entry.notes,
    }));
  }

  private ouraActivityToEntry(activity: OuraDailyActivity): ActivityEntry {
    const activeMinutes = Math.round(
      (activity.high_activity_time +
        activity.medium_activity_time +
        activity.low_activity_time) /
        60,
    );

    return {
      id: `oura:${activity.id}`,
      source: "oura",
      date: activity.day,
      activity_type: "daily_summary",
      duration_minutes: activeMinutes,
      calories_burned: activity.active_calories,
      steps: activity.steps,
      distance_meters: activity.equivalent_walking_distance,
      intensity: null,
      average_hr: null,
      notes: null,
    };
  }

  private ouraWorkoutToEntry(workout: OuraWorkout): ActivityEntry {
    const start = new Date(workout.start_datetime);
    const end = new Date(workout.end_datetime);
    const durationMinutes = Math.round(
      (end.getTime() - start.getTime()) / 60000,
    );

    return {
      id: `oura:workout:${workout.id}`,
      source: "oura",
      date: workout.day,
      activity_type: workout.activity,
      duration_minutes: durationMinutes,
      calories_burned: workout.calories,
      steps: null,
      distance_meters: workout.distance,
      intensity: workout.intensity,
      average_hr: null,
      notes: workout.label,
    };
  }

  private calculateStats(
    entries: ActivityEntry[],
    goal: ActivityGoal,
  ): ActivityStats {
    if (entries.length === 0) {
      return {
        avg_daily_steps: 0,
        avg_daily_calories: 0,
        avg_daily_active_minutes: 0,
        total_workouts: 0,
        total_entries: 0,
        goal_completion_rate: 0,
      };
    }

    // Group by date
    const byDate = new Map<string, ActivityEntry[]>();
    entries.forEach((e) => {
      const existing = byDate.get(e.date) || [];
      byDate.set(e.date, [...existing, e]);
    });

    let totalSteps = 0;
    let totalCalories = 0;
    let totalActiveMinutes = 0;
    let daysMetGoal = 0;
    let workoutCount = 0;

    byDate.forEach((dayEntries) => {
      const daySteps = dayEntries.reduce((sum, e) => sum + (e.steps || 0), 0);
      const dayCalories = dayEntries.reduce(
        (sum, e) => sum + (e.calories_burned || 0),
        0,
      );
      const dayMinutes = dayEntries.reduce(
        (sum, e) => sum + e.duration_minutes,
        0,
      );

      totalSteps += daySteps;
      totalCalories += dayCalories;
      totalActiveMinutes += dayMinutes;

      if (daySteps >= goal.daily_steps) daysMetGoal++;

      // Count workouts (non-summary activities)
      workoutCount += dayEntries.filter(
        (e) => e.activity_type !== "daily_summary",
      ).length;
    });

    const numDays = byDate.size;

    return {
      avg_daily_steps: Math.round(totalSteps / numDays),
      avg_daily_calories: Math.round(totalCalories / numDays),
      avg_daily_active_minutes: Math.round(totalActiveMinutes / numDays),
      total_workouts: workoutCount,
      total_entries: entries.length,
      goal_completion_rate: Math.round((daysMetGoal / numDays) * 100),
    };
  }

  // =====================================================
  // IModExecutor IMPLEMENTATION
  // =====================================================

  async getData(tenant_id: string): Promise<Record<string, unknown>> {
    const ouraClient = await this.getOuraClient(tenant_id);
    const goal = await this.getActivityGoal(tenant_id);
    let entries: ActivityEntry[] = [];
    let todaySummary: DailySummary | null = null;
    let sources: string[] = ["manual"];

    // Try to get Oura data first
    if (ouraClient) {
      try {
        const dashboard = await ouraClient.getDashboardData(7);
        sources.push("oura");

        // Get daily activities
        dashboard.activity.recentActivity.forEach((activity) => {
          entries.push(this.ouraActivityToEntry(activity));
        });

        // Get workouts
        dashboard.workouts.forEach((workout) => {
          entries.push(this.ouraWorkoutToEntry(workout));
        });

        // Today's summary
        const todayActivity = dashboard.activity.recentActivity.find(
          (a) => a.day === new Date().toISOString().split("T")[0],
        );

        if (todayActivity) {
          todaySummary = {
            date: todayActivity.day,
            total_steps: todayActivity.steps,
            total_calories: todayActivity.active_calories,
            total_active_minutes: Math.round(
              (todayActivity.high_activity_time +
                todayActivity.medium_activity_time +
                todayActivity.low_activity_time) /
                60,
            ),
            activity_score: todayActivity.score,
            workouts: dashboard.workouts
              .filter((w) => w.day === todayActivity.day)
              .map((w) => this.ouraWorkoutToEntry(w)),
          };
        }
      } catch (error) {
        logger.error("[ActivityTracker] Oura error:", error);
      }
    }

    // Also get manual entries
    const manualEntries = await this.getManualEntries(tenant_id, 7);
    entries = [...entries, ...manualEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const stats = this.calculateStats(entries, goal);

    return {
      today: todaySummary,
      entries,
      stats,
      goal,
      sources,
      oura_connected: !!ouraClient,
    };
  }

  async getInsights(tenant_id: string): Promise<ModInsight[]> {
    const data = await this.getData(tenant_id);
    const insights: ModInsight[] = [];
    const stats = data.stats as ActivityStats;
    const goal = data.goal as ActivityGoal;
    const today = data.today as DailySummary | null;

    // Check step goal progress
    if (today) {
      const stepProgress = (today.total_steps / goal.daily_steps) * 100;

      if (stepProgress >= 100) {
        insights.push({
          type: "success",
          title: "Step Goal Achieved!",
          message: `You've hit ${today.total_steps.toLocaleString()} steps today. Great job!`,
          data: { steps: today.total_steps, goal: goal.daily_steps },
          created_at: new Date().toISOString(),
        });
      } else if (stepProgress >= 80) {
        insights.push({
          type: "info",
          title: "Almost There!",
          message: `You're at ${Math.round(stepProgress)}% of your step goal. Just ${(goal.daily_steps - today.total_steps).toLocaleString()} more steps to go!`,
          data: {
            steps: today.total_steps,
            remaining: goal.daily_steps - today.total_steps,
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    // Check weekly workout goal
    const weeklyWorkouts = stats.total_workouts;
    if (weeklyWorkouts >= goal.weekly_workouts) {
      insights.push({
        type: "success",
        title: "Workout Goal Met",
        message: `You've completed ${weeklyWorkouts} workouts this week, meeting your goal of ${goal.weekly_workouts}!`,
        data: { workouts: weeklyWorkouts, goal: goal.weekly_workouts },
        created_at: new Date().toISOString(),
      });
    } else if (weeklyWorkouts === 0 && new Date().getDay() >= 3) {
      insights.push({
        type: "warning",
        title: "No Workouts Yet",
        message: `You haven't logged any workouts this week. Your goal is ${goal.weekly_workouts} workouts.`,
        data: { goal: goal.weekly_workouts },
        created_at: new Date().toISOString(),
      });
    }

    // Check consistency
    if (stats.goal_completion_rate < 50 && stats.total_entries > 0) {
      insights.push({
        type: "warning",
        title: "Activity Consistency",
        message: `You've met your step goal on ${stats.goal_completion_rate}% of days. Try for more consistent activity.`,
        data: { completion_rate: stats.goal_completion_rate },
        created_at: new Date().toISOString(),
      });
    }

    return insights;
  }

  async executeAction(
    tenant_id: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case "log_activity": {
          const {
            activity_type,
            duration_minutes,
            steps,
            calories_burned,
            notes,
          } = params as {
            activity_type: string;
            duration_minutes: number;
            steps?: number;
            calories_burned?: number;
            notes?: string;
          };

          if (!activity_type || !duration_minutes) {
            return {
              success: false,
              error: "activity_type and duration_minutes are required",
            };
          }

          const { data, error } = await this.supabase
            .from("exo_activity_entries")
            .insert({
              tenant_id,
              source: "manual",
              activity_type,
              start_time: new Date().toISOString(),
              duration_minutes,
              steps: steps || null,
              calories_burned: calories_burned || null,
              notes: notes || null,
            })
            .select()
            .single();

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: data };
        }

        case "log_workout": {
          const {
            activity_type,
            start_time,
            end_time,
            intensity,
            calories_burned,
            distance_meters,
            notes,
          } = params as {
            activity_type: string;
            start_time: string;
            end_time?: string;
            intensity?: "easy" | "moderate" | "hard" | "very_hard";
            calories_burned?: number;
            distance_meters?: number;
            notes?: string;
          };

          if (!activity_type || !start_time) {
            return {
              success: false,
              error: "activity_type and start_time are required",
            };
          }

          const startDate = new Date(start_time);
          const endDate = end_time ? new Date(end_time) : new Date();
          const durationMinutes = Math.round(
            (endDate.getTime() - startDate.getTime()) / 60000,
          );

          const { data, error } = await this.supabase
            .from("exo_activity_entries")
            .insert({
              tenant_id,
              source: "manual",
              activity_type,
              start_time: startDate.toISOString(),
              end_time: endDate.toISOString(),
              duration_minutes: durationMinutes,
              intensity: intensity || null,
              calories_burned: calories_burned || null,
              distance_meters: distance_meters || null,
              notes: notes || null,
            })
            .select()
            .single();

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: data };
        }

        case "set_step_goal": {
          const { daily_steps } = params as { daily_steps: number };

          if (!daily_steps || daily_steps < 1000 || daily_steps > 50000) {
            return {
              success: false,
              error: "daily_steps must be between 1000 and 50000",
            };
          }

          const { error } = await this.supabase.from("exo_health_goals").upsert(
            {
              tenant_id,
              goal_type: "steps",
              target_value: daily_steps,
              target_unit: "steps",
              frequency: "daily",
            },
            {
              onConflict: "tenant_id,goal_type",
            },
          );

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: { daily_steps } };
        }

        case "get_history": {
          const { days = 30 } = params as { days?: number };
          const entries = await this.getManualEntries(tenant_id, days);
          return { success: true, result: { entries, days } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      logger.error("[ActivityTracker] Action error:", {
        action,
        tenant_id,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Action failed",
      };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "log_activity",
        name: "Log Activity",
        description: "Log a quick activity (steps, active minutes)",
        params_schema: {
          type: "object",
          properties: {
            activity_type: {
              type: "string",
              description: "Type of activity (walking, running, etc.)",
            },
            duration_minutes: {
              type: "number",
              description: "Duration in minutes",
            },
            steps: { type: "number", description: "Number of steps" },
            calories_burned: { type: "number", description: "Calories burned" },
            notes: { type: "string", description: "Optional notes" },
          },
          required: ["activity_type", "duration_minutes"],
        },
      },
      {
        slug: "log_workout",
        name: "Log Workout",
        description: "Log a structured workout session",
        params_schema: {
          type: "object",
          properties: {
            activity_type: { type: "string", description: "Type of workout" },
            start_time: {
              type: "string",
              description: "Start time (ISO 8601)",
            },
            end_time: { type: "string", description: "End time (ISO 8601)" },
            intensity: {
              type: "string",
              enum: ["easy", "moderate", "hard", "very_hard"],
            },
            calories_burned: { type: "number", description: "Calories burned" },
            distance_meters: {
              type: "number",
              description: "Distance in meters",
            },
            notes: { type: "string", description: "Optional notes" },
          },
          required: ["activity_type", "start_time"],
        },
      },
      {
        slug: "set_step_goal",
        name: "Set Step Goal",
        description: "Set your daily step goal",
        params_schema: {
          type: "object",
          properties: {
            daily_steps: { type: "number", description: "Target daily steps" },
          },
          required: ["daily_steps"],
        },
      },
      {
        slug: "get_history",
        name: "Get Activity History",
        description: "Get activity history for a number of days",
        params_schema: {
          type: "object",
          properties: {
            days: {
              type: "number",
              description: "Number of days to retrieve (default 30)",
            },
          },
        },
      },
    ];
  }
}
