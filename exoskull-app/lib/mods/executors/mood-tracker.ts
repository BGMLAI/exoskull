// =====================================================
// MOOD TRACKER MOD - Daily mood check-ins and analysis
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

// =====================================================
// Types
// =====================================================

export interface MoodEntry {
  id: string;
  tenant_id: string;
  mood_value: number; // 1-10
  energy_level?: number; // 1-10
  notes?: string;
  emotions: string[]; // ['happy', 'anxious', 'calm', etc.]
  context?: string; // 'morning', 'afternoon', 'evening', 'night'
  logged_at: string;
  created_at: string;
}

export interface MoodStats {
  average_mood: number;
  average_energy: number;
  total_entries: number;
  mood_trend: "improving" | "stable" | "declining";
  top_emotions: { emotion: string; count: number }[];
  best_day: string | null;
  worst_day: string | null;
}

// Available emotions for tagging
export const MOOD_EMOTIONS = [
  "happy",
  "excited",
  "grateful",
  "calm",
  "content",
  "neutral",
  "tired",
  "stressed",
  "anxious",
  "sad",
  "frustrated",
  "angry",
  "overwhelmed",
  "hopeful",
  "motivated",
] as const;

export type MoodEmotion = (typeof MOOD_EMOTIONS)[number];

// =====================================================
// Mood Tracker Executor
// =====================================================

export class MoodTrackerExecutor implements IModExecutor {
  readonly slug: ModSlug = "mood-tracker";

  // =====================================================
  // getData - Get mood entries and stats
  // =====================================================
  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const weekAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const monthAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Get recent entries (last 30 days)
      const { data: recentEntries, error: entriesError } =
        await getServiceSupabase()
          .from("exo_mood_entries")
          .select("*")
          .eq("tenant_id", tenantId)
          .gte("logged_at", monthAgo)
          .order("logged_at", { ascending: false });

      if (entriesError) {
        console.error("[MoodTracker] Error fetching entries:", entriesError);
        throw entriesError;
      }

      const entries = recentEntries || [];

      // Calculate stats
      const stats = this.calculateStats(entries);

      // Get today's entries
      const todayEntries = entries.filter((e) => e.logged_at.startsWith(today));

      // Get weekly entries
      const weeklyEntries = entries.filter((e) => e.logged_at >= weekAgo);

      return {
        today: {
          entries: todayEntries,
          count: todayEntries.length,
          average_mood:
            todayEntries.length > 0
              ? Math.round(
                  (todayEntries.reduce((sum, e) => sum + e.mood_value, 0) /
                    todayEntries.length) *
                    10,
                ) / 10
              : null,
        },
        weekly: {
          entries: weeklyEntries,
          count: weeklyEntries.length,
          stats: this.calculateStats(weeklyEntries),
        },
        monthly: {
          entries: entries,
          count: entries.length,
          stats,
        },
        available_emotions: MOOD_EMOTIONS,
      };
    } catch (error) {
      console.error("[MoodTracker] getData error:", error);
      return {
        today: { entries: [], count: 0, average_mood: null },
        weekly: { entries: [], count: 0, stats: null },
        monthly: { entries: [], count: 0, stats: null },
        available_emotions: MOOD_EMOTIONS,
        error: (error as Error).message,
      };
    }
  }

  // =====================================================
  // getInsights - Generate mood insights
  // =====================================================
  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const insights: ModInsight[] = [];
    const now = new Date();

    try {
      const data = await this.getData(tenantId);
      const monthlyStats = data.monthly as {
        stats: MoodStats | null;
        count: number;
      };
      const weeklyStats = data.weekly as {
        stats: MoodStats | null;
        count: number;
      };
      const today = data.today as {
        count: number;
        average_mood: number | null;
      };

      // Check if user logged mood today
      if (today.count === 0) {
        insights.push({
          type: "info",
          title: "Mood Check-In",
          message: "You haven't logged your mood today. How are you feeling?",
          action: {
            label: "Log Mood",
            type: "button",
            onClick: "log_mood",
          },
          created_at: now.toISOString(),
        });
      }

      // Weekly consistency check
      if (weeklyStats.count < 7) {
        const missedDays = 7 - weeklyStats.count;
        insights.push({
          type: "warning",
          title: "Tracking Consistency",
          message: `You've logged your mood ${weeklyStats.count}/7 days this week. ${missedDays} day(s) missed.`,
          created_at: now.toISOString(),
        });
      } else if (weeklyStats.count >= 7) {
        insights.push({
          type: "success",
          title: "Great Consistency!",
          message: "You've tracked your mood every day this week. Keep it up!",
          created_at: now.toISOString(),
        });
      }

      // Mood trend insight
      if (monthlyStats.stats) {
        const stats = monthlyStats.stats;

        if (stats.mood_trend === "improving") {
          insights.push({
            type: "success",
            title: "Mood Improving",
            message: `Your mood has been trending upward! Average: ${stats.average_mood.toFixed(1)}/10`,
            data: { average: stats.average_mood, trend: "improving" },
            created_at: now.toISOString(),
          });
        } else if (stats.mood_trend === "declining") {
          insights.push({
            type: "warning",
            title: "Mood Declining",
            message: `Your mood has been trending downward. Consider what might be affecting you.`,
            data: { average: stats.average_mood, trend: "declining" },
            created_at: now.toISOString(),
          });
        }

        // Top emotions insight
        if (stats.top_emotions.length > 0) {
          const topEmotion = stats.top_emotions[0];
          insights.push({
            type: "info",
            title: "Most Common Feeling",
            message: `You've felt "${topEmotion.emotion}" most often (${topEmotion.count} times this month).`,
            data: { emotions: stats.top_emotions },
            created_at: now.toISOString(),
          });
        }

        // Low mood alert
        if (stats.average_mood < 4 && monthlyStats.count >= 5) {
          insights.push({
            type: "alert",
            title: "Low Mood Pattern",
            message:
              "Your average mood has been low recently. Consider reaching out to someone you trust or a mental health professional.",
            created_at: now.toISOString(),
          });
        }
      }

      return insights;
    } catch (error) {
      console.error("[MoodTracker] getInsights error:", error);
      return [
        {
          type: "warning",
          title: "Error Loading Insights",
          message: "Unable to generate mood insights at this time.",
          created_at: now.toISOString(),
        },
      ];
    }
  }

  // =====================================================
  // executeAction - Log mood entry
  // =====================================================
  async executeAction(
    tenantId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (action) {
        case "log_mood": {
          const moodValue = params.mood_value as number;
          const energyLevel = params.energy_level as number | undefined;
          const notes = params.notes as string | undefined;
          const emotions = params.emotions as string[] | undefined;
          const context = params.context as string | undefined;

          if (!moodValue || moodValue < 1 || moodValue > 10) {
            return {
              success: false,
              error: "Mood value must be between 1 and 10",
            };
          }

          const entry: Partial<MoodEntry> = {
            tenant_id: tenantId,
            mood_value: moodValue,
            energy_level: energyLevel,
            notes: notes,
            emotions: emotions || [],
            context: context || this.getTimeContext(),
            logged_at: new Date().toISOString(),
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mood_entries")
            .insert(entry)
            .select()
            .single();

          if (error) {
            console.error("[MoodTracker] log_mood error:", error);
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: {
              entry: data,
              message: `Mood logged: ${moodValue}/10`,
            },
          };
        }

        case "get_history": {
          const days = (params.days as number) || 30;
          const since = new Date(
            Date.now() - days * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await getServiceSupabase()
            .from("exo_mood_entries")
            .select("*")
            .eq("tenant_id", tenantId)
            .gte("logged_at", since)
            .order("logged_at", { ascending: false });

          if (error) {
            return { success: false, error: error.message };
          }

          return {
            success: true,
            result: {
              entries: data || [],
              count: data?.length || 0,
              period_days: days,
            },
          };
        }

        case "delete_entry": {
          const entryId = params.entry_id as string;
          if (!entryId) {
            return { success: false, error: "Entry ID required" };
          }

          const { error } = await getServiceSupabase()
            .from("exo_mood_entries")
            .delete()
            .eq("id", entryId)
            .eq("tenant_id", tenantId);

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true, result: { deleted: entryId } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error("[MoodTracker] executeAction error:", error);
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
        slug: "log_mood",
        name: "Log Mood",
        description: "Record your current mood and emotions",
        params_schema: {
          type: "object",
          required: ["mood_value"],
          properties: {
            mood_value: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Mood rating from 1 (very bad) to 10 (excellent)",
            },
            energy_level: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Energy level from 1 (exhausted) to 10 (energized)",
            },
            notes: {
              type: "string",
              description: "Optional notes about how you feel",
            },
            emotions: {
              type: "array",
              items: { type: "string", enum: MOOD_EMOTIONS },
              description: "Emotions you are feeling",
            },
            context: {
              type: "string",
              enum: ["morning", "afternoon", "evening", "night"],
              description: "Time of day context",
            },
          },
        },
      },
      {
        slug: "get_history",
        name: "Get History",
        description: "Retrieve mood entries for a time period",
        params_schema: {
          type: "object",
          properties: {
            days: {
              type: "number",
              default: 30,
              description: "Number of days to look back",
            },
          },
        },
      },
      {
        slug: "delete_entry",
        name: "Delete Entry",
        description: "Delete a mood entry",
        params_schema: {
          type: "object",
          required: ["entry_id"],
          properties: {
            entry_id: {
              type: "string",
              description: "ID of the entry to delete",
            },
          },
        },
      },
    ];
  }

  // =====================================================
  // Helper Methods
  // =====================================================

  private calculateStats(entries: MoodEntry[]): MoodStats | null {
    if (entries.length === 0) {
      return null;
    }

    // Average mood
    const avgMood =
      entries.reduce((sum, e) => sum + e.mood_value, 0) / entries.length;

    // Average energy (filter entries that have energy_level)
    const energyEntries = entries.filter((e) => e.energy_level != null);
    const avgEnergy =
      energyEntries.length > 0
        ? energyEntries.reduce((sum, e) => sum + (e.energy_level || 0), 0) /
          energyEntries.length
        : 0;

    // Mood trend (compare first half to second half)
    const sortedByDate = [...entries].sort(
      (a, b) =>
        new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
    );
    const halfPoint = Math.floor(sortedByDate.length / 2);
    const firstHalf = sortedByDate.slice(0, halfPoint);
    const secondHalf = sortedByDate.slice(halfPoint);

    let trend: "improving" | "stable" | "declining" = "stable";
    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstAvg =
        firstHalf.reduce((sum, e) => sum + e.mood_value, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((sum, e) => sum + e.mood_value, 0) /
        secondHalf.length;
      const diff = secondAvg - firstAvg;

      if (diff > 0.5) trend = "improving";
      else if (diff < -0.5) trend = "declining";
    }

    // Top emotions
    const emotionCounts: Record<string, number> = {};
    for (const entry of entries) {
      for (const emotion of entry.emotions || []) {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      }
    }
    const topEmotions = Object.entries(emotionCounts)
      .map(([emotion, count]) => ({ emotion, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Best and worst days
    const dailyAverages: Record<string, { sum: number; count: number }> = {};
    for (const entry of entries) {
      const day = entry.logged_at.split("T")[0];
      if (!dailyAverages[day]) {
        dailyAverages[day] = { sum: 0, count: 0 };
      }
      dailyAverages[day].sum += entry.mood_value;
      dailyAverages[day].count++;
    }

    let bestDay: string | null = null;
    let worstDay: string | null = null;
    let bestAvg = -Infinity;
    let worstAvg = Infinity;

    for (const [day, data] of Object.entries(dailyAverages)) {
      const avg = data.sum / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestDay = day;
      }
      if (avg < worstAvg) {
        worstAvg = avg;
        worstDay = day;
      }
    }

    return {
      average_mood: Math.round(avgMood * 10) / 10,
      average_energy: Math.round(avgEnergy * 10) / 10,
      total_entries: entries.length,
      mood_trend: trend,
      top_emotions: topEmotions,
      best_day: bestDay,
      worst_day: worstDay,
    };
  }

  private getTimeContext(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }
}
