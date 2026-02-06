// =====================================================
// FOOD LOGGER MOD EXECUTOR
// Track meals, calories, macronutrients
// Uses generic exo_mod_data table
// =====================================================

import { IModExecutor, ModInsight, ModAction, ModSlug } from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";

// =====================================================
// Types
// =====================================================

interface FoodEntry {
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  description: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  notes?: string;
}

interface FoodStats {
  total_meals: number;
  avg_daily_calories: number | null;
  total_calories: number;
  meals_by_type: Record<string, number>;
  days_tracked: number;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

// =====================================================
// Executor
// =====================================================

export class FoodLoggerExecutor implements IModExecutor {
  readonly slug: ModSlug = "food-logger";

  async getData(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const weekAgo = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: entries, error } = await getServiceSupabase()
        .from("exo_mod_data")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("mod_slug", "food-logger")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[FoodLogger] Fetch error:", error);
        throw error;
      }

      const all = (entries || []).map((e) => ({
        id: e.id,
        ...(e.data as FoodEntry),
        created_at: e.created_at,
      }));

      const todayEntries = all.filter((e) => e.created_at.startsWith(today));
      const todayCalories = todayEntries.reduce(
        (s, e) => s + (e.calories || 0),
        0,
      );

      return {
        today: {
          entries: todayEntries,
          total_calories: todayCalories,
          meals_logged: todayEntries.length,
        },
        weekly: { entries: all, stats: this.calculateStats(all) },
      };
    } catch (error) {
      console.error("[FoodLogger] getData error:", error);
      return {
        today: { entries: [], total_calories: 0, meals_logged: 0 },
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
        meals_logged: number;
        total_calories: number;
      };
      const stats = (data.weekly as { stats: FoodStats | null })?.stats;

      if (today.meals_logged === 0) {
        insights.push({
          type: "info",
          title: "Log Your Meals",
          message:
            "No meals logged today. Track what you eat for better insights!",
          action: { label: "Log Meal", type: "button", onClick: "log_meal" },
          created_at: now.toISOString(),
        });
      } else if (today.total_calories > 0) {
        const remaining = 2000 - today.total_calories;
        if (remaining > 0) {
          insights.push({
            type: "info",
            title: "Today's Intake",
            message: `${today.total_calories} kcal logged today. ~${remaining} kcal remaining.`,
            created_at: now.toISOString(),
          });
        } else {
          insights.push({
            type: "warning",
            title: "Calorie Goal Reached",
            message: `${today.total_calories} kcal today — you've hit your daily target.`,
            created_at: now.toISOString(),
          });
        }
      }

      if (stats && stats.days_tracked >= 3) {
        if (stats.avg_daily_calories && stats.avg_daily_calories < 1500) {
          insights.push({
            type: "warning",
            title: "Low Calorie Intake",
            message: `Averaging ${Math.round(stats.avg_daily_calories)} kcal/day. Make sure you're eating enough.`,
            created_at: now.toISOString(),
          });
        }

        const mealTypes = Object.keys(stats.meals_by_type);
        if (!mealTypes.includes("breakfast") && stats.total_meals > 5) {
          insights.push({
            type: "info",
            title: "Missing Breakfast",
            message:
              "You rarely log breakfast. A morning meal can boost energy and focus.",
            created_at: now.toISOString(),
          });
        }
      }

      return insights;
    } catch (error) {
      console.error("[FoodLogger] getInsights error:", error);
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
        case "log_meal": {
          const entry: FoodEntry = {
            meal_type: (params.meal_type as FoodEntry["meal_type"]) || "snack",
            description: (params.description as string) || "meal",
            calories: params.calories as number | undefined,
            protein_g: params.protein_g as number | undefined,
            carbs_g: params.carbs_g as number | undefined,
            fat_g: params.fat_g as number | undefined,
            notes: params.notes as string | undefined,
          };

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .insert({
              tenant_id: tenantId,
              mod_slug: "food-logger",
              data: entry,
            })
            .select()
            .single();

          if (error) return { success: false, error: error.message };
          return {
            success: true,
            result: {
              entry: data,
              message: `Logged ${entry.meal_type}: ${entry.description}`,
            },
          };
        }

        case "get_history": {
          const days = (params.days as number) || 7;
          const since = new Date(
            Date.now() - days * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await getServiceSupabase()
            .from("exo_mod_data")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("mod_slug", "food-logger")
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
      console.error("[FoodLogger] executeAction error:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  getActions(): ModAction[] {
    return [
      {
        slug: "log_meal",
        name: "Log Meal",
        description: "Record a meal or snack",
        params_schema: {
          type: "object",
          required: ["description"],
          properties: {
            meal_type: {
              type: "string",
              enum: MEAL_TYPES,
              description: "Meal type",
            },
            description: { type: "string", description: "What you ate" },
            calories: { type: "number", description: "Estimated calories" },
            protein_g: { type: "number", description: "Protein in grams" },
            carbs_g: { type: "number", description: "Carbs in grams" },
            fat_g: { type: "number", description: "Fat in grams" },
            notes: { type: "string", description: "Optional notes" },
          },
        },
      },
      {
        slug: "get_history",
        name: "Get History",
        description: "Get food log history",
        params_schema: {
          type: "object",
          properties: {
            days: {
              type: "number",
              default: 7,
              description: "Days to look back",
            },
          },
        },
      },
    ];
  }

  private calculateStats(
    entries: (FoodEntry & { created_at: string })[],
  ): FoodStats {
    if (entries.length === 0) {
      return {
        total_meals: 0,
        avg_daily_calories: null,
        total_calories: 0,
        meals_by_type: {},
        days_tracked: 0,
      };
    }

    const totalCalories = entries.reduce((s, e) => s + (e.calories || 0), 0);
    const days = new Set(entries.map((e) => e.created_at.split("T")[0]));

    const mealsByType: Record<string, number> = {};
    for (const e of entries) {
      mealsByType[e.meal_type] = (mealsByType[e.meal_type] || 0) + 1;
    }

    return {
      total_meals: entries.length,
      avg_daily_calories:
        days.size > 0 ? Math.round(totalCalories / days.size) : null,
      total_calories: totalCalories,
      meals_by_type: mealsByType,
      days_tracked: days.size,
    };
  }
}
