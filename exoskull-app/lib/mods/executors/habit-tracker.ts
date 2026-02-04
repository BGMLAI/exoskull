// =====================================================
// HABIT TRACKER MOD - Build and maintain positive habits
// =====================================================

import { createClient } from "@supabase/supabase-js";
import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// =====================================================
// Types
// =====================================================

export interface Habit {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  frequency: "daily" | "weekly";
  target_days?: number[]; // 0=Sunday, 1=Monday, etc. (for weekly)
  reminder_time?: string; // HH:MM format
  icon?: string;
  color?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HabitCompletion {
  id: string;
  habit_id: string;
  tenant_id: string;
  completed_at: string;
  notes?: string;
}

export interface HabitStreak {
  habit_id: string;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  completion_rate: number; // 0-100
  last_completed?: string;
}

export interface HabitWithStats extends Habit {
  streak: HabitStreak;
  completed_today: boolean;
}

// =====================================================
// Habit Tracker Executor
// =====================================================

export class HabitTrackerExecutor implements IModExecutor {
  readonly slug: ModSlug = "habit-tracker";

  // =====================================================
  // getData - Get habits with streaks and stats
  // =====================================================
  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const weekAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Get all active habits
      const { data: habits, error: habitsError } = await getSupabase()
        .from("exo_habits")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (habitsError) {
        console.error("[HabitTracker] Error fetching habits:", habitsError);
        throw habitsError;
      }

      const habitList = habits || [];

      // Get completions for the last 30 days
      const monthAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: completions, error: completionsError } = await getSupabase()
        .from("exo_habit_completions")
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("completed_at", monthAgo)
        .order("completed_at", { ascending: false });

      if (completionsError) {
        console.error(
          "[HabitTracker] Error fetching completions:",
          completionsError,
        );
      }

      const completionList = completions || [];

      // Calculate stats for each habit
      const habitsWithStats: HabitWithStats[] = habitList.map((habit) => {
        const habitCompletions = completionList.filter(
          (c) => c.habit_id === habit.id,
        );
        const streak = this.calculateStreak(habit, habitCompletions);
        const completedToday = habitCompletions.some((c) =>
          c.completed_at.startsWith(today),
        );

        return {
          ...habit,
          streak,
          completed_today: completedToday,
        };
      });

      // Today's summary
      const todayCompleted = habitsWithStats.filter(
        (h) => h.completed_today,
      ).length;
      const todayPending = habitsWithStats.filter(
        (h) => !h.completed_today,
      ).length;

      // Overall stats
      const totalCompletions = completionList.length;
      const avgCompletionRate =
        habitsWithStats.length > 0
          ? habitsWithStats.reduce(
              (sum, h) => sum + h.streak.completion_rate,
              0,
            ) / habitsWithStats.length
          : 0;

      return {
        habits: habitsWithStats,
        today: {
          completed: todayCompleted,
          pending: todayPending,
          total: habitsWithStats.length,
          progress_percent:
            habitsWithStats.length > 0
              ? Math.round((todayCompleted / habitsWithStats.length) * 100)
              : 0,
        },
        weekly: {
          completions: completionList.filter((c) => c.completed_at >= weekAgo)
            .length,
        },
        overall: {
          total_habits: habitsWithStats.length,
          total_completions: totalCompletions,
          average_completion_rate: Math.round(avgCompletionRate),
          longest_streak: Math.max(
            ...habitsWithStats.map((h) => h.streak.longest_streak),
            0,
          ),
        },
      };
    } catch (error) {
      console.error("[HabitTracker] getData error:", error);
      return {
        habits: [],
        today: { completed: 0, pending: 0, total: 0, progress_percent: 0 },
        weekly: { completions: 0 },
        overall: {
          total_habits: 0,
          total_completions: 0,
          average_completion_rate: 0,
          longest_streak: 0,
        },
        error: (error as Error).message,
      };
    }
  }

  // =====================================================
  // getInsights - Generate habit insights
  // =====================================================
  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const insights: ModInsight[] = [];
    const now = new Date();

    try {
      const data = await this.getData(tenantId);
      const habits = data.habits as HabitWithStats[];
      const today = data.today as {
        completed: number;
        pending: number;
        total: number;
        progress_percent: number;
      };
      const overall = data.overall as {
        average_completion_rate: number;
        longest_streak: number;
      };

      // No habits yet
      if (habits.length === 0) {
        insights.push({
          type: "info",
          title: "Start Building Habits",
          message:
            "You haven't created any habits yet. Start with one simple habit to build momentum.",
          action: {
            label: "Create Habit",
            type: "button",
            onClick: "create_habit",
          },
          created_at: now.toISOString(),
        });
        return insights;
      }

      // Today's progress
      if (today.pending > 0) {
        insights.push({
          type: "info",
          title: "Today's Habits",
          message: `${today.completed}/${today.total} completed. ${today.pending} habit(s) remaining.`,
          data: { progress: today.progress_percent },
          created_at: now.toISOString(),
        });
      } else if (today.total > 0) {
        insights.push({
          type: "success",
          title: "All Habits Complete!",
          message: `Great job! You've completed all ${today.total} habits today.`,
          created_at: now.toISOString(),
        });
      }

      // Streak achievements
      const longestStreakHabit = habits.reduce(
        (best, h) =>
          h.streak.current_streak > (best?.streak.current_streak || 0)
            ? h
            : best,
        habits[0],
      );

      if (longestStreakHabit && longestStreakHabit.streak.current_streak >= 7) {
        insights.push({
          type: "success",
          title: `${longestStreakHabit.streak.current_streak}-Day Streak!`,
          message: `"${longestStreakHabit.name}" is on fire! Keep the momentum going.`,
          data: {
            habit: longestStreakHabit.name,
            streak: longestStreakHabit.streak.current_streak,
          },
          created_at: now.toISOString(),
        });
      }

      // Broken streaks (not completed today, had streak > 3)
      const brokenStreaks = habits.filter(
        (h) =>
          !h.completed_today &&
          h.streak.current_streak === 0 &&
          h.streak.longest_streak >= 3,
      );

      if (brokenStreaks.length > 0) {
        insights.push({
          type: "warning",
          title: "Streak at Risk",
          message: `Don't break your "${brokenStreaks[0].name}" streak! Complete it today.`,
          action: {
            label: "Complete Now",
            type: "button",
            onClick: "complete_habit",
          },
          created_at: now.toISOString(),
        });
      }

      // Low completion rate habits
      const strugglingHabits = habits.filter(
        (h) => h.streak.completion_rate < 50 && h.streak.total_completions >= 5,
      );
      if (strugglingHabits.length > 0) {
        insights.push({
          type: "warning",
          title: "Struggling Habit",
          message: `"${strugglingHabits[0].name}" has a ${strugglingHabits[0].streak.completion_rate}% completion rate. Consider making it easier or more specific.`,
          created_at: now.toISOString(),
        });
      }

      // Weekly milestone
      if (overall.average_completion_rate >= 80) {
        insights.push({
          type: "success",
          title: "Strong Consistency",
          message: `You're maintaining ${overall.average_completion_rate}% average completion rate. Excellent discipline!`,
          created_at: now.toISOString(),
        });
      }

      return insights;
    } catch (error) {
      console.error("[HabitTracker] getInsights error:", error);
      return [
        {
          type: "warning",
          title: "Error Loading Insights",
          message: "Unable to generate habit insights at this time.",
          created_at: now.toISOString(),
        },
      ];
    }
  }

  // =====================================================
  // executeAction - Habit management
  // =====================================================
  async executeAction(
    tenantId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case "create_habit": {
          const name = params.name as string;
          const description = params.description as string | undefined;
          const frequency = (params.frequency as "daily" | "weekly") || "daily";
          const targetDays = params.target_days as number[] | undefined;
          const reminderTime = params.reminder_time as string | undefined;
          const icon = params.icon as string | undefined;
          const color = params.color as string | undefined;

          if (!name || name.trim().length === 0) {
            return { success: false, error: "Habit name is required" };
          }

          const habit: Partial<Habit> = {
            tenant_id: tenantId,
            name: name.trim(),
            description,
            frequency,
            target_days: targetDays,
            reminder_time: reminderTime,
            icon,
            color,
            active: true,
          };

          const { data, error } = await getSupabase()
            .from("exo_habits")
            .insert(habit)
            .select()
            .single();

          if (error) {
            console.error("[HabitTracker] create_habit error:", error);
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: {
              habit: data,
              message: `Habit "${name}" created!`,
            },
          };
        }

        case "complete_habit": {
          const habitId = params.habit_id as string;
          const notes = params.notes as string | undefined;

          if (!habitId) {
            return { success: false, error: "Habit ID required" };
          }

          // Check if habit exists and belongs to tenant
          const { data: habit, error: habitError } = await getSupabase()
            .from("exo_habits")
            .select("id, name")
            .eq("id", habitId)
            .eq("tenant_id", tenantId)
            .single();

          if (habitError || !habit) {
            return { success: false, error: "Habit not found" };
          }

          // Check if already completed today
          const today = new Date().toISOString().split("T")[0];
          const { data: existing } = await getSupabase()
            .from("exo_habit_completions")
            .select("id")
            .eq("habit_id", habitId)
            .gte("completed_at", today)
            .limit(1);

          if (existing && existing.length > 0) {
            return { success: false, error: "Habit already completed today" };
          }

          // Create completion
          const completion: Partial<HabitCompletion> = {
            habit_id: habitId,
            tenant_id: tenantId,
            completed_at: new Date().toISOString(),
            notes,
          };

          const { data, error } = await getSupabase()
            .from("exo_habit_completions")
            .insert(completion)
            .select()
            .single();

          if (error) {
            console.error("[HabitTracker] complete_habit error:", error);
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: {
              completion: data,
              message: `"${habit.name}" completed!`,
            },
          };
        }

        case "update_habit": {
          const habitId = params.habit_id as string;
          if (!habitId) {
            return { success: false, error: "Habit ID required" };
          }

          const updates: Partial<Habit> = {};
          if (params.name) updates.name = params.name as string;
          if (params.description !== undefined)
            updates.description = params.description as string;
          if (params.frequency)
            updates.frequency = params.frequency as "daily" | "weekly";
          if (params.target_days)
            updates.target_days = params.target_days as number[];
          if (params.reminder_time !== undefined)
            updates.reminder_time = params.reminder_time as string;
          if (params.icon !== undefined) updates.icon = params.icon as string;
          if (params.color !== undefined)
            updates.color = params.color as string;
          if (params.active !== undefined)
            updates.active = params.active as boolean;

          const { data, error } = await getSupabase()
            .from("exo_habits")
            .update(updates)
            .eq("id", habitId)
            .eq("tenant_id", tenantId)
            .select()
            .single();

          if (error) {
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: { habit: data, message: "Habit updated" },
          };
        }

        case "delete_habit": {
          const habitId = params.habit_id as string;
          if (!habitId) {
            return { success: false, error: "Habit ID required" };
          }

          // Soft delete - just set active to false
          const { error } = await getSupabase()
            .from("exo_habits")
            .update({ active: false })
            .eq("id", habitId)
            .eq("tenant_id", tenantId);

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: { deleted: habitId } };
        }

        case "get_habit_history": {
          const habitId = params.habit_id as string;
          const days = (params.days as number) || 30;

          if (!habitId) {
            return { success: false, error: "Habit ID required" };
          }

          const since = new Date(
            Date.now() - days * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await getSupabase()
            .from("exo_habit_completions")
            .select("*")
            .eq("habit_id", habitId)
            .eq("tenant_id", tenantId)
            .gte("completed_at", since)
            .order("completed_at", { ascending: false });

          if (error) {
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: {
              completions: data || [],
              count: data?.length || 0,
              period_days: days,
            },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error("[HabitTracker] executeAction error:", error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // =====================================================
  // getActions - Available actions
  // =====================================================
  getActions(): ModAction[] {
    return [
      {
        slug: "create_habit",
        name: "Create Habit",
        description: "Create a new habit to track",
        params_schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "Name of the habit",
            },
            description: {
              type: "string",
              description: "Optional description",
            },
            frequency: {
              type: "string",
              enum: ["daily", "weekly"],
              default: "daily",
              description: "How often the habit should be completed",
            },
            target_days: {
              type: "array",
              items: { type: "number", minimum: 0, maximum: 6 },
              description:
                "For weekly habits: days to complete (0=Sun, 1=Mon, etc.)",
            },
            reminder_time: {
              type: "string",
              pattern: "^[0-2][0-9]:[0-5][0-9]$",
              description: "Reminder time in HH:MM format",
            },
            icon: {
              type: "string",
              description: "Emoji icon for the habit",
            },
            color: {
              type: "string",
              description: "Color for the habit (hex code)",
            },
          },
        },
      },
      {
        slug: "complete_habit",
        name: "Complete Habit",
        description: "Mark a habit as completed for today",
        params_schema: {
          type: "object",
          required: ["habit_id"],
          properties: {
            habit_id: {
              type: "string",
              description: "ID of the habit to complete",
            },
            notes: {
              type: "string",
              description: "Optional notes for this completion",
            },
          },
        },
      },
      {
        slug: "update_habit",
        name: "Update Habit",
        description: "Update habit properties",
        params_schema: {
          type: "object",
          required: ["habit_id"],
          properties: {
            habit_id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            frequency: { type: "string", enum: ["daily", "weekly"] },
            target_days: { type: "array", items: { type: "number" } },
            reminder_time: { type: "string" },
            icon: { type: "string" },
            color: { type: "string" },
            active: { type: "boolean" },
          },
        },
      },
      {
        slug: "delete_habit",
        name: "Delete Habit",
        description: "Deactivate a habit (soft delete)",
        params_schema: {
          type: "object",
          required: ["habit_id"],
          properties: {
            habit_id: {
              type: "string",
              description: "ID of the habit to delete",
            },
          },
        },
      },
      {
        slug: "get_habit_history",
        name: "Get Habit History",
        description: "Get completion history for a habit",
        params_schema: {
          type: "object",
          required: ["habit_id"],
          properties: {
            habit_id: {
              type: "string",
              description: "ID of the habit",
            },
            days: {
              type: "number",
              default: 30,
              description: "Number of days to look back",
            },
          },
        },
      },
    ];
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  private calculateStreak(
    habit: Habit,
    completions: HabitCompletion[],
  ): HabitStreak {
    if (completions.length === 0) {
      return {
        habit_id: habit.id,
        current_streak: 0,
        longest_streak: 0,
        total_completions: 0,
        completion_rate: 0,
      };
    }

    // Sort completions by date (newest first)
    const sortedCompletions = [...completions].sort(
      (a, b) =>
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
    );

    // Get unique completion days
    const completionDays = new Set(
      sortedCompletions.map((c) => c.completed_at.split("T")[0]),
    );

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i <= 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split("T")[0];

      if (completionDays.has(dateStr)) {
        currentStreak++;
      } else if (i > 0) {
        // Allow today to be incomplete, but break on any other missed day
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const sortedDays = Array.from(completionDays).sort();

    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDays[i - 1]);
        const currDate = new Date(sortedDays[i]);
        const diffDays = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate completion rate (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCompletions = sortedCompletions.filter(
      (c) => new Date(c.completed_at) >= thirtyDaysAgo,
    );

    // For daily habits, target is 30 days
    // For weekly habits, calculate expected based on target_days
    let expectedCompletions = 30;
    if (habit.frequency === "weekly" && habit.target_days) {
      expectedCompletions = habit.target_days.length * 4; // ~4 weeks
    }

    const completionRate = Math.min(
      100,
      Math.round(
        (new Set(recentCompletions.map((c) => c.completed_at.split("T")[0]))
          .size /
          expectedCompletions) *
          100,
      ),
    );

    return {
      habit_id: habit.id,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      total_completions: completions.length,
      completion_rate: completionRate,
      last_completed: sortedCompletions[0]?.completed_at,
    };
  }
}
