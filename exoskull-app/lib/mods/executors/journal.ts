// =====================================================
// JOURNAL MOD EXECUTOR
// Daily journaling with mood tagging and reflection
// Uses generic exo_mod_data table
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

// =====================================================
// Types
// =====================================================

interface JournalEntry {
  title?: string;
  content: string;
  mood?: number; // 1-10
  tags?: string[];
}

interface JournalStats {
  total_entries: number;
  avg_mood: number | null;
  days_with_entries: number;
  top_tags: { tag: string; count: number }[];
  streak: number;
}

// =====================================================
// Executor
// =====================================================

export class JournalExecutor implements IModExecutor {
  readonly slug: ModSlug = "journal";

  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const monthAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: entries, error } = await getServiceSupabase()
        .from("exo_mod_data")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("mod_slug", "journal")
        .gte("created_at", monthAgo)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Journal] Fetch error:", error);
        throw error;
      }

      const all = (entries || []).map((e) => ({
        id: e.id,
        ...(e.data as JournalEntry),
        created_at: e.created_at,
      }));

      return {
        recent: all.slice(0, 5),
        monthly: { entries: all, stats: this.calculateStats(all) },
      };
    } catch (error) {
      console.error("[Journal] getData error:", error);
      return { recent: [], monthly: { entries: [], stats: null } };
    }
  }

  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const insights: ModInsight[] = [];
    const now = new Date();

    try {
      const data = await this.getData(tenantId);
      const stats = (data.monthly as { stats: JournalStats | null })?.stats;
      const today = now.toISOString().split("T")[0];
      const recent = data.recent as { created_at: string }[];
      const wrotToday = recent.some((e) => e.created_at.startsWith(today));

      if (!wrotToday) {
        insights.push({
          type: "info",
          title: "Write Today",
          message: "You haven't journaled today. Take a moment to reflect.",
          action: {
            label: "Write Entry",
            type: "button",
            onClick: "write_entry",
          },
          created_at: now.toISOString(),
        });
      }

      if (stats) {
        if (stats.streak >= 7) {
          insights.push({
            type: "success",
            title: "Writing Streak!",
            message: `${stats.streak}-day journaling streak. Impressive consistency!`,
            created_at: now.toISOString(),
          });
        } else if (stats.streak >= 3) {
          insights.push({
            type: "success",
            title: "Building Habit",
            message: `${stats.streak}-day streak. Keep going to build the habit!`,
            created_at: now.toISOString(),
          });
        }

        if (
          stats.avg_mood !== null &&
          stats.avg_mood < 4 &&
          stats.total_entries >= 5
        ) {
          insights.push({
            type: "warning",
            title: "Low Mood Pattern",
            message:
              "Your journal mood ratings have been low. Consider talking to someone you trust.",
            created_at: now.toISOString(),
          });
        }

        if (stats.top_tags.length > 0) {
          const topTag = stats.top_tags[0];
          insights.push({
            type: "info",
            title: "Common Theme",
            message: `"${topTag.tag}" appears most in your entries (${topTag.count} times).`,
            data: { tags: stats.top_tags },
            created_at: now.toISOString(),
          });
        }
      }

      return insights;
    } catch (error) {
      console.error("[Journal] getInsights error:", error);
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
        case "write_entry": {
          const content = params.content as string;
          if (!content || content.trim().length === 0) {
            return { success: false, error: "Content is required" };
          }

          const entry: JournalEntry = {
            title: params.title as string | undefined,
            content: content.trim(),
            mood: params.mood as number | undefined,
            tags: params.tags as string[] | undefined,
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .insert({ tenant_id: tenantId, mod_slug: "journal", data: entry })
            .select()
            .single();

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: { entry: data, message: "Journal entry saved" },
          };
        }

        case "get_entries": {
          const days = (params.days as number) || 30;
          const since = new Date(
            Date.now() - days * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("mod_slug", "journal")
            .gte("created_at", since)
            .order("created_at", { ascending: false });

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: { entries: data || [], count: data?.length || 0 },
          };
        }

        case "search": {
          const query = (params.query as string) || "";
          if (!query) return { success: false, error: "Search query required" };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("mod_slug", "journal")
            .order("created_at", { ascending: false })
            .limit(50);

          if (error) return { success: false, error: error.message };

          const lowerQuery = query.toLowerCase();
          const matches = (data || []).filter((e) => {
            const d = e.data as JournalEntry;
            return (
              d.content.toLowerCase().includes(lowerQuery) ||
              d.title?.toLowerCase().includes(lowerQuery) ||
              d.tags?.some((t) => t.toLowerCase().includes(lowerQuery))
            );
          });

          return {
            success: true,
            result: { entries: matches, count: matches.length },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error("[Journal] executeAction error:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "write_entry",
        name: "Write Entry",
        description: "Write a new journal entry",
        params_schema: {
          type: "object",
          required: ["content"],
          properties: {
            title: { type: "string", description: "Optional title" },
            content: { type: "string", description: "Journal content" },
            mood: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Mood 1-10",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
        },
      },
      {
        slug: "get_entries",
        name: "Get Entries",
        description: "Get recent journal entries",
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
      {
        slug: "search",
        name: "Search",
        description: "Search journal entries by keyword",
        params_schema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "Search keyword" },
          },
        },
      },
    ];
  }

  private calculateStats(
    entries: (JournalEntry & { created_at: string })[],
  ): JournalStats {
    if (entries.length === 0) {
      return {
        total_entries: 0,
        avg_mood: null,
        days_with_entries: 0,
        top_tags: [],
        streak: 0,
      };
    }

    // Mood average
    const moodEntries = entries.filter((e) => e.mood != null);
    const avgMood =
      moodEntries.length > 0
        ? Math.round(
            (moodEntries.reduce((s, e) => s + (e.mood || 0), 0) /
              moodEntries.length) *
              10,
          ) / 10
        : null;

    // Days with entries
    const days = new Set(entries.map((e) => e.created_at.split("T")[0]));

    // Tags
    const tagCounts: Record<string, number> = {};
    for (const e of entries) {
      for (const tag of e.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Streak (consecutive days from today backwards)
    const sortedDays = [...days].sort().reverse();
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const checkDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      if (sortedDays.includes(checkDate)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return {
      total_entries: entries.length,
      avg_mood: avgMood,
      days_with_entries: days.size,
      top_tags: topTags,
      streak,
    };
  }
}
