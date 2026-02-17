// =====================================================
// WATER TRACKER MOD EXECUTOR
// Track daily water intake, monitor hydration goals
// Uses generic exo_mod_data table
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// =====================================================
// Types
// =====================================================

interface WaterEntry {
  amount_ml: number;
  notes?: string;
}

interface WaterStats {
  total_today_ml: number;
  daily_goal_ml: number;
  goal_progress: number; // 0-1
  avg_daily_ml: number;
  days_goal_met: number;
  days_tracked: number;
}

// =====================================================
// Executor
// =====================================================

export class WaterTrackerExecutor implements IModExecutor {
  readonly slug: ModSlug = "water-tracker";

  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const weekAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const dailyGoal = 2500; // ml

      const { data: entries, error } = await getServiceSupabase()
        .from("exo_mod_data")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("mod_slug", "water-tracker")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("[WaterTracker] Fetch error:", error);
        throw error;
      }

      const all = (entries || []).map((e) => ({
        id: e.id,
        ...(e.data as WaterEntry),
        created_at: e.created_at,
      }));

      const todayEntries = all.filter((e) => e.created_at.startsWith(today));
      const todayTotal = todayEntries.reduce((s, e) => s + e.amount_ml, 0);

      return {
        today: {
          entries: todayEntries,
          total_ml: todayTotal,
          goal_ml: dailyGoal,
          progress: Math.min(1, todayTotal / dailyGoal),
        },
        weekly: { entries: all, stats: this.calculateStats(all, dailyGoal) },
      };
    } catch (error) {
      logger.error("[WaterTracker] getData error:", error);
      return {
        today: { entries: [], total_ml: 0, goal_ml: 2500, progress: 0 },
        weekly: { entries: [], stats: null },
      };
    }
  }

  async getInsights(tenantId: string): Promise<ModInsight[]> {
    const insights: ModInsight[] = [];
    const now = new Date();

    try {
      const data = await this.getData(tenantId);
      const today = data.today as {
        total_ml: number;
        goal_ml: number;
        progress: number;
        entries: unknown[];
      };
      const stats = (data.weekly as { stats: WaterStats | null })?.stats;

      if (today.entries.length === 0) {
        insights.push({
          type: "info",
          title: "Stay Hydrated",
          message: "No water logged today yet. Drink a glass now!",
          action: { label: "Log Water", type: "button", onClick: "log_water" },
          created_at: now.toISOString(),
        });
      } else if (today.progress >= 1) {
        insights.push({
          type: "success",
          title: "Goal Met!",
          message: `${today.total_ml} ml today — hydration goal reached!`,
          created_at: now.toISOString(),
        });
      } else {
        const remaining = today.goal_ml - today.total_ml;
        insights.push({
          type: "info",
          title: "Keep Drinking",
          message: `${today.total_ml}/${today.goal_ml} ml today. ${remaining} ml to go.`,
          created_at: now.toISOString(),
        });
      }

      if (stats && stats.days_tracked >= 3) {
        const consistency = stats.days_goal_met / stats.days_tracked;
        if (consistency >= 0.8) {
          insights.push({
            type: "success",
            title: "Great Consistency",
            message: `You've met your water goal ${stats.days_goal_met}/${stats.days_tracked} days. Keep it up!`,
            created_at: now.toISOString(),
          });
        } else if (stats.avg_daily_ml < 1500) {
          insights.push({
            type: "warning",
            title: "Low Intake",
            message: `Averaging ${Math.round(stats.avg_daily_ml)} ml/day. Aim for at least 2000 ml.`,
            created_at: now.toISOString(),
          });
        }
      }

      return insights;
    } catch (error) {
      logger.error("[WaterTracker] getInsights error:", error);
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
        case "log_water": {
          const amount = (params.amount_ml as number) || 250;
          if (amount <= 0 || amount > 5000) {
            return {
              success: false,
              error: "Amount must be between 1 and 5000 ml",
            };
          }

          const entry: WaterEntry = {
            amount_ml: amount,
            notes: params.notes as string | undefined,
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .insert({
              tenant_id: tenantId,
              mod_slug: "water-tracker",
              data: entry,
            })
            .select()
            .single();

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: { entry: data, message: `Logged ${amount} ml of water` },
          };
        }

        case "get_today": {
          const today = new Date().toISOString().split("T")[0];

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("mod_slug", "water-tracker")
            .gte("created_at", today)
            .order("created_at", { ascending: false });

          if (error) return { success: false, error: error.message };

          const total = (data || []).reduce(
            (s, e) => s + ((e.data as WaterEntry).amount_ml || 0),
            0,
          );
          return {
            success: true,
            result: { entries: data || [], total_ml: total },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      logger.error("[WaterTracker] executeAction error:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "log_water",
        name: "Log Water",
        description: "Record water intake",
        params_schema: {
          type: "object",
          properties: {
            amount_ml: {
              type: "number",
              default: 250,
              description: "Amount in milliliters",
            },
            notes: { type: "string", description: "Optional notes" },
          },
        },
      },
      {
        slug: "get_today",
        name: "Get Today",
        description: "Get today's water intake",
        params_schema: { type: "object", properties: {} },
      },
    ];
  }

  private calculateStats(
    entries: (WaterEntry & { created_at: string })[],
    dailyGoal: number,
  ): WaterStats {
    if (entries.length === 0) {
      return {
        total_today_ml: 0,
        daily_goal_ml: dailyGoal,
        goal_progress: 0,
        avg_daily_ml: 0,
        days_goal_met: 0,
        days_tracked: 0,
      };
    }

    const byDay: Record<string, number> = {};
    for (const e of entries) {
      const day = e.created_at.split("T")[0];
      byDay[day] = (byDay[day] || 0) + e.amount_ml;
    }

    const days = Object.keys(byDay);
    const totalAll = Object.values(byDay).reduce((s, v) => s + v, 0);
    const daysGoalMet = Object.values(byDay).filter(
      (v) => v >= dailyGoal,
    ).length;

    const today = new Date().toISOString().split("T")[0];
    const todayTotal = byDay[today] || 0;

    return {
      total_today_ml: todayTotal,
      daily_goal_ml: dailyGoal,
      goal_progress: Math.min(1, todayTotal / dailyGoal),
      avg_daily_ml: Math.round(totalAll / days.length),
      days_goal_met: daysGoalMet,
      days_tracked: days.length,
    };
  }
}
