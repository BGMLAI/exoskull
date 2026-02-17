// =====================================================
// SOCIAL TRACKER MOD EXECUTOR
// Track social interactions and relationship health
// Uses generic exo_mod_data table
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// =====================================================
// Types
// =====================================================

interface SocialEntry {
  interaction_type: "in_person" | "call" | "video" | "text";
  person: string;
  duration_minutes?: number;
  quality: number; // 1-10
  notes?: string;
}

interface SocialStats {
  total_interactions: number;
  unique_people: number;
  avg_quality: number;
  interactions_by_type: Record<string, number>;
  top_contacts: { person: string; count: number }[];
  weekly_goal_met: boolean;
}

const INTERACTION_TYPES = ["in_person", "call", "video", "text"] as const;

// =====================================================
// Executor
// =====================================================

export class SocialTrackerExecutor implements IModExecutor {
  readonly slug: ModSlug = "social-tracker";

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
        .eq("mod_slug", "social-tracker")
        .gte("created_at", monthAgo)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("[SocialTracker] Fetch error:", error);
        throw error;
      }

      const all = (entries || []).map((e) => ({
        id: e.id,
        ...(e.data as SocialEntry),
        created_at: e.created_at,
      }));

      const weekly = all.filter((e) => e.created_at >= weekAgo);

      return {
        recent: all.slice(0, 10),
        weekly: { entries: weekly, stats: this.calculateStats(weekly, 5) },
        monthly: { entries: all, stats: this.calculateStats(all, 20) },
      };
    } catch (error) {
      logger.error("[SocialTracker] getData error:", error);
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
      const weeklyStats = (data.weekly as { stats: SocialStats | null })?.stats;
      const monthlyStats = (data.monthly as { stats: SocialStats | null })
        ?.stats;

      if (!weeklyStats || weeklyStats.total_interactions === 0) {
        insights.push({
          type: "warning",
          title: "No Social Activity",
          message: "No interactions logged this week. Reach out to someone!",
          action: {
            label: "Log Interaction",
            type: "button",
            onClick: "log_interaction",
          },
          created_at: now.toISOString(),
        });
        return insights;
      }

      if (weeklyStats.weekly_goal_met) {
        insights.push({
          type: "success",
          title: "Social Goal Met",
          message: `${weeklyStats.total_interactions} interactions this week. Great social health!`,
          created_at: now.toISOString(),
        });
      } else {
        const remaining = 5 - weeklyStats.total_interactions;
        insights.push({
          type: "info",
          title: "Stay Connected",
          message: `${weeklyStats.total_interactions}/5 interactions this week. ${remaining} more to hit your goal.`,
          created_at: now.toISOString(),
        });
      }

      if (weeklyStats.avg_quality < 5) {
        insights.push({
          type: "warning",
          title: "Low Quality Interactions",
          message:
            "Your interaction quality has been low. Focus on deeper, more meaningful connections.",
          created_at: now.toISOString(),
        });
      }

      // Check for neglected contacts (monthly)
      if (
        monthlyStats &&
        monthlyStats.unique_people <= 2 &&
        monthlyStats.total_interactions >= 5
      ) {
        insights.push({
          type: "info",
          title: "Expand Your Circle",
          message: `You've only interacted with ${monthlyStats.unique_people} people this month. Consider reconnecting with someone you haven't talked to.`,
          created_at: now.toISOString(),
        });
      }

      // In-person vs digital ratio
      if (
        weeklyStats.interactions_by_type.in_person === 0 &&
        weeklyStats.total_interactions >= 3
      ) {
        insights.push({
          type: "info",
          title: "Go Offline",
          message:
            "All interactions this week were digital. Try meeting someone in person!",
          created_at: now.toISOString(),
        });
      }

      return insights;
    } catch (error) {
      logger.error("[SocialTracker] getInsights error:", error);
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
        case "log_interaction": {
          const entry: SocialEntry = {
            interaction_type:
              (params.interaction_type as SocialEntry["interaction_type"]) ||
              "text",
            person: (params.person as string) || "someone",
            duration_minutes: params.duration_minutes as number | undefined,
            quality: Math.min(10, Math.max(1, (params.quality as number) || 7)),
            notes: params.notes as string | undefined,
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .insert({
              tenant_id: tenantId,
              mod_slug: "social-tracker",
              data: entry,
            })
            .select()
            .single();

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: {
              entry: data,
              message: `Logged ${entry.interaction_type} with ${entry.person}`,
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
            .eq("mod_slug", "social-tracker")
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
      logger.error("[SocialTracker] executeAction error:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "log_interaction",
        name: "Log Interaction",
        description: "Record a social interaction",
        params_schema: {
          type: "object",
          required: ["person"],
          properties: {
            interaction_type: {
              type: "string",
              enum: INTERACTION_TYPES,
              description: "Type of interaction",
            },
            person: { type: "string", description: "Who you interacted with" },
            duration_minutes: {
              type: "number",
              description: "Duration in minutes",
            },
            quality: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Quality 1-10",
            },
            notes: { type: "string", description: "Optional notes" },
          },
        },
      },
      {
        slug: "get_history",
        name: "Get History",
        description: "Get social interaction history",
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
    entries: (SocialEntry & { created_at: string })[],
    weeklyGoal: number,
  ): SocialStats {
    if (entries.length === 0) {
      return {
        total_interactions: 0,
        unique_people: 0,
        avg_quality: 0,
        interactions_by_type: {},
        top_contacts: [],
        weekly_goal_met: false,
      };
    }

    const avgQuality =
      entries.reduce((s, e) => s + e.quality, 0) / entries.length;
    const people = new Set(entries.map((e) => e.person.toLowerCase()));

    const byType: Record<string, number> = {};
    const personCounts: Record<string, number> = {};
    for (const e of entries) {
      byType[e.interaction_type] = (byType[e.interaction_type] || 0) + 1;
      const key = e.person.toLowerCase();
      personCounts[key] = (personCounts[key] || 0) + 1;
    }

    const topContacts = Object.entries(personCounts)
      .map(([person, count]) => ({ person, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total_interactions: entries.length,
      unique_people: people.size,
      avg_quality: Math.round(avgQuality * 10) / 10,
      interactions_by_type: byType,
      top_contacts: topContacts,
      weekly_goal_met: entries.length >= weeklyGoal,
    };
  }
}
