import { logger } from "@/lib/logger";

// =====================================================
// SKILL GENERATOR - System Prompt for AI Code Generation
// =====================================================

/**
 * Builds the system prompt for generating IModExecutor implementations.
 * The AI receives the interface contract, an example, and strict constraints.
 */
export function buildExecutorPrompt(): string {
  return `You are an expert TypeScript developer generating skill implementations for ExoSkull, an Adaptive Life Operating System.

## Your Task

Generate a TypeScript class that implements the IModExecutor interface. The class will be used to track, analyze, and act on user data.

## IModExecutor Interface (MUST implement exactly)

\`\`\`typescript
interface IModExecutor {
  readonly slug: string;  // Must start with "custom-"
  getData(tenant_id: string): Promise<Record<string, unknown>>;
  getInsights(tenant_id: string): Promise<ModInsight[]>;
  executeAction(tenant_id: string, action: string, params: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }>;
  getActions(): ModAction[];
}

interface ModInsight {
  type: 'info' | 'warning' | 'success' | 'alert';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  created_at: string;
}

interface ModAction {
  slug: string;
  name: string;
  description: string;
  params_schema: Record<string, unknown>;
}
\`\`\`

## Available API (only these are available in the sandbox)

You have access to a \`supabase\` object with these methods ONLY:
- \`supabase.from(table).select(columns).eq(col, val).order(col, opts).limit(n).single()\`
- \`supabase.from(table).insert(row).select().single()\`
- \`supabase.from(table).update(values).eq(col, val)\`
- \`supabase.from(table).select(columns).gte(col, val).lte(col, val).neq(col, val).ilike(col, pattern).in(col, values).is(col, val)\`

You also have: \`Date\`, \`JSON\`, \`Math\`, \`Promise\`, \`console.log\`, \`console.error\`, \`Array\`, \`Object\`, \`Map\`, \`Set\`, \`String\`, \`Number\`, \`Boolean\`, \`RegExp\`, \`Error\`.

## CONSTRAINTS (CRITICAL)

1. The class MUST be self-contained - NO imports, NO require, NO import()
2. The slug MUST start with "custom-" (e.g., "custom-water-tracker")
3. Use ONLY the supabase methods listed above - NO rpc(), NO delete(), NO auth, NO storage
4. NO eval(), NO Function(), NO process, NO fs, NO child_process, NO __dirname
5. NO globalThis, NO window, NO global
6. NO prototype manipulation (__proto__, constructor.constructor, Object.getPrototypeOf)
7. NO fetch() or HTTP calls
8. All table queries MUST filter by tenant_id: .eq("tenant_id", tenant_id)
9. Table names MUST start with "exo_" prefix
10. Error handling with try/catch is REQUIRED in every method
11. The code MUST end with a factory function: function createExecutor() { return new YourClass(); }

## Data Storage Convention

For custom data, use the generic mod data table:
\`\`\`typescript
// Store data:
await supabase.from("exo_mod_data").insert({
  tenant_id,
  mod_slug: this.slug,
  data_type: "entry_type_name",
  data: { /* your data */ },
  logged_at: new Date().toISOString()
});

// Read data:
const { data } = await supabase
  .from("exo_mod_data")
  .select("*")
  .eq("tenant_id", tenant_id)
  .eq("mod_slug", this.slug)
  .eq("data_type", "entry_type_name")
  .order("logged_at", { ascending: false });
\`\`\`

## Example Implementation

\`\`\`typescript
class WaterTrackerExecutor {
  readonly slug = "custom-water-tracker";

  async getData(tenant_id: string) {
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      const { data: entries, error } = await supabase
        .from("exo_mod_data")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("mod_slug", this.slug)
        .eq("data_type", "water_entry")
        .gte("logged_at", today)
        .order("logged_at", { ascending: false });

      if (error) {
        logger.error("[WaterTracker] getData error:", error);
        return { entries: [], total_ml: 0, error: error.message };
      }

      const total_ml = (entries || []).reduce(
        (sum, e) => sum + (e.data?.amount_ml || 0), 0
      );

      return { entries: entries || [], total_ml, goal_ml: 2000 };
    } catch (error) {
      logger.error("[WaterTracker] getData error:", error);
      return { entries: [], total_ml: 0, error: error.message };
    }
  }

  async getInsights(tenant_id: string) {
    try {
      const data = await this.getData(tenant_id);
      const insights = [];
      const now = new Date().toISOString();

      if (data.total_ml < 1000) {
        insights.push({
          type: "warning",
          title: "Drink more water!",
          message: "Only " + data.total_ml + "ml today. Goal: " + data.goal_ml + "ml.",
          created_at: now
        });
      } else if (data.total_ml >= data.goal_ml) {
        insights.push({
          type: "success",
          title: "Goal reached!",
          message: "You drank " + data.total_ml + "ml today!",
          created_at: now
        });
      }

      return insights;
    } catch (error) {
      logger.error("[WaterTracker] getInsights error:", error);
      return [];
    }
  }

  async executeAction(tenant_id, action, params) {
    try {
      if (action === "log_water") {
        const amount_ml = params.amount_ml;
        if (!amount_ml || amount_ml <= 0) {
          return { success: false, error: "amount_ml must be positive" };
        }

        const { data, error } = await supabase
          .from("exo_mod_data")
          .insert({
            tenant_id,
            mod_slug: this.slug,
            data_type: "water_entry",
            data: { amount_ml },
            logged_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, result: { entry: data, message: amount_ml + "ml logged" } };
      }

      return { success: false, error: "Unknown action: " + action };
    } catch (error) {
      logger.error("[WaterTracker] executeAction error:", error);
      return { success: false, error: error.message };
    }
  }

  getActions() {
    return [
      {
        slug: "log_water",
        name: "Log water",
        description: "Record water intake in milliliters",
        params_schema: {
          type: "object",
          required: ["amount_ml"],
          properties: {
            amount_ml: { type: "number", description: "Amount in ml" }
          }
        }
      }
    ];
  }
}

function createExecutor() { return new WaterTrackerExecutor(); }
\`\`\`

## Output Format

Return ONLY the TypeScript code. No markdown, no explanation, no backticks.
The code must contain:
1. A class implementing the interface
2. A \`function createExecutor()\` at the end that returns an instance

Generate the skill based on the user's description.`;
}

/**
 * Builds the user prompt with the specific skill description
 */
export function buildUserPrompt(description: string): string {
  return `Generate a skill implementation for the following user request:

"${description}"

Requirements:
1. Choose an appropriate slug (custom-xxx format)
2. Implement all 4 methods: getData, getInsights, executeAction, getActions
3. Use exo_mod_data table for storage (with mod_slug and data_type filters)
4. Include proper error handling
5. Make insights useful and actionable
6. End with: function createExecutor() { return new YourClass(); }

Return ONLY the code, no explanation.`;
}
