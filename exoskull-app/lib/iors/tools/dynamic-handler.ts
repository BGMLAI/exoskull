/**
 * Dynamic Tool Handler
 *
 * Executes tenant-specific tools registered in exo_dynamic_tools.
 * Handler types:
 * - app_crud: CRUD operations on exo_app_* tables
 * - query: Read-only Supabase queries
 * - composite: Chain of existing static tools
 * - skill_exec: Reserved for future sandbox execution
 */

import type { ToolDefinition } from "./shared";
import { executeExtensionTool } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { executeInSandbox } from "@/lib/skills/sandbox/restricted-function";
import type { SkillExecutionContext } from "@/lib/skills/types";

import { logger } from "@/lib/logger";
interface DynamicToolRow {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler_type: "app_crud" | "query" | "composite" | "skill_exec";
  handler_config: Record<string, unknown>;
}

// In-memory cache: tenantId → { tools, expiresAt }
const dynamicToolCache = new Map<
  string,
  { tools: ToolDefinition[]; expiresAt: number }
>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch dynamic tools for a tenant from exo_dynamic_tools.
 * Returns Anthropic-compatible ToolDefinition[] ready to merge with static tools.
 * Cached per tenant for 5 minutes.
 */
export async function getDynamicToolsForTenant(
  tenantId: string,
): Promise<ToolDefinition[]> {
  // Check cache
  const cached = dynamicToolCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tools;
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("exo_dynamic_tools")
      .select(
        "id, name, description, input_schema, handler_type, handler_config",
      )
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .limit(15); // Max 15 dynamic tools per tenant

    if (error || !data || data.length === 0) {
      // Cache empty result too (avoids repeated DB hits)
      dynamicToolCache.set(tenantId, {
        tools: [],
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return [];
    }

    const tools = (data as DynamicToolRow[]).map((row) =>
      buildToolDefinition(row, tenantId),
    );

    dynamicToolCache.set(tenantId, {
      tools,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return tools;
  } catch (err) {
    logger.error("[DynamicTools] Failed to fetch dynamic tools:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

/**
 * Invalidate cache for a tenant (e.g., after Ralph registers a new tool).
 */
export function invalidateDynamicToolCache(tenantId: string): void {
  dynamicToolCache.delete(tenantId);
}

/**
 * Convert a DB row into a ToolDefinition with an execute handler.
 */
function buildToolDefinition(
  row: DynamicToolRow,
  ownerTenantId: string,
): ToolDefinition {
  return {
    definition: {
      name: `dyn_${row.name}`,
      description: row.description,
      input_schema: {
        type: "object" as const,
        properties:
          (row.input_schema?.properties as Record<string, unknown>) || {},
        required: (row.input_schema?.required as string[]) || [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      // Safety: dynamic tools only run for the tenant that owns them
      if (tenantId !== ownerTenantId) {
        return "Error: ten tool nie jest dostępny dla tego użytkownika.";
      }

      switch (row.handler_type) {
        case "app_crud":
          return executeAppCrud(input, tenantId, row.handler_config);
        case "query":
          return executeQuery(input, tenantId, row.handler_config);
        case "composite":
          return executeComposite(input, tenantId, row.handler_config);
        case "skill_exec":
          return executeSkill(input, tenantId, row.handler_config);
        default:
          return `Nieznany handler_type: ${row.handler_type}`;
      }
    },
  };
}

/**
 * app_crud: CRUD on exo_app_* tables.
 * handler_config: { table_name, slug, operation: "insert" | "select" | "update" | "delete" }
 */
async function executeAppCrud(
  input: Record<string, unknown>,
  tenantId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const supabase = getServiceSupabase();
  const tableName = config.table_name as string;
  const operation =
    (input.operation as string) || (config.operation as string) || "select";

  if (!tableName?.startsWith("exo_app_")) {
    return "Error: dynamic CRUD dozwolone tylko na tabelach exo_app_*";
  }

  try {
    switch (operation) {
      case "insert": {
        const data = input.data as Record<string, unknown>;
        if (!data) return "Error: brak danych do wstawienia (pole 'data')";
        const { error } = await supabase.from(tableName).insert({
          ...data,
          tenant_id: tenantId,
        });
        if (error) return `Error inserting: ${error.message}`;
        return "Wpis dodany pomyślnie.";
      }
      case "select": {
        const limit = Math.min(Number(input.limit) || 10, 25);
        const { data, error } = await supabase
          .from(tableName)
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return `Error querying: ${error.message}`;
        if (!data || data.length === 0) return "Brak wpisów.";
        return JSON.stringify(data, null, 2).slice(0, 3000);
      }
      case "update": {
        const id = input.id as string;
        const updates = input.data as Record<string, unknown>;
        if (!id || !updates) return "Error: brak id lub data do aktualizacji";
        const { error } = await supabase
          .from(tableName)
          .update(updates)
          .eq("id", id)
          .eq("tenant_id", tenantId);
        if (error) return `Error updating: ${error.message}`;
        return "Wpis zaktualizowany.";
      }
      case "delete": {
        const deleteId = input.id as string;
        if (!deleteId) return "Error: brak id do usunięcia";
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq("id", deleteId)
          .eq("tenant_id", tenantId);
        if (error) return `Error deleting: ${error.message}`;
        return "Wpis usunięty.";
      }
      default:
        return `Nieznana operacja: ${operation}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * query: Read-only Supabase query.
 * handler_config: { table_name, select_columns, filters, order_by, limit }
 */
async function executeQuery(
  input: Record<string, unknown>,
  tenantId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const supabase = getServiceSupabase();
  const tableName = config.table_name as string;

  if (!tableName) return "Error: brak table_name w konfiguracji toola";

  // Only allow reading exo_app_* or exo_ tables for safety
  if (!tableName.startsWith("exo_")) {
    return "Error: dynamic query dozwolone tylko na tabelach exo_*";
  }

  try {
    const selectCols = (config.select_columns as string) || "*";
    const limit = Math.min(
      Number(input.limit) || Number(config.limit) || 10,
      50,
    );

    let query = supabase
      .from(tableName)
      .select(selectCols)
      .eq("tenant_id", tenantId)
      .limit(limit);

    const orderBy = (config.order_by as string) || "created_at";
    query = query.order(orderBy, { ascending: false });

    const { data, error } = await query;
    if (error) return `Error: ${error.message}`;
    if (!data || data.length === 0) return "Brak wyników.";
    return JSON.stringify(data, null, 2).slice(0, 3000);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * composite: Chain of existing static tools.
 * handler_config: { steps: [{ tool_name, input_mapping }] }
 */
async function executeComposite(
  input: Record<string, unknown>,
  tenantId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const steps = config.steps as Array<{
    tool_name: string;
    input_mapping?: Record<string, string>;
  }>;

  if (!steps || steps.length === 0) {
    return "Error: brak kroków w composite tool";
  }

  const results: string[] = [];
  let lastResult = "";

  for (const step of steps.slice(0, 5)) {
    // Max 5 steps
    const toolInput: Record<string, unknown> = {};

    // Map inputs: static values + dynamic from previous step
    if (step.input_mapping) {
      for (const [key, source] of Object.entries(step.input_mapping)) {
        if (source === "$input") {
          toolInput[key] = input[key];
        } else if (source === "$last_result") {
          toolInput[key] = lastResult;
        } else {
          toolInput[key] = source; // Static value
        }
      }
    } else {
      Object.assign(toolInput, input);
    }

    const result = await executeExtensionTool(
      step.tool_name,
      toolInput,
      tenantId,
    );
    lastResult = result || "Brak wyniku";
    results.push(`[${step.tool_name}]: ${lastResult}`);
  }

  return results.join("\n\n");
}

/**
 * skill_exec: Execute an approved generated skill in the restricted sandbox.
 * handler_config: { skill_id: string }
 */
async function executeSkill(
  input: Record<string, unknown>,
  tenantId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const skillId = config.skill_id as string;
  if (!skillId) return "Error: brak skill_id w konfiguracji toola";

  try {
    const supabase = getServiceSupabase();

    // Fetch approved skill with code
    const { data: skill, error } = await supabase
      .from("exo_generated_skills")
      .select("id, name, executor_code, tenant_id, approval_status")
      .eq("id", skillId)
      .eq("tenant_id", tenantId)
      .eq("approval_status", "approved")
      .single();

    if (error || !skill) {
      return "Error: skill nie znaleziony lub nie zatwierdzony.";
    }

    if (!skill.executor_code) {
      return "Error: skill nie ma kodu do wykonania.";
    }

    // Build execution context
    const action = (input.action as string) || "getData";
    const params = (input.params as Record<string, unknown>) || {};

    const context: SkillExecutionContext = {
      skill_id: skillId,
      tenant_id: tenantId,
      method:
        action === "getData" || action === "getInsights"
          ? action
          : "executeAction",
      args:
        action === "getData" || action === "getInsights"
          ? []
          : [action, params],
    };

    // Execute in restricted sandbox
    const result = await executeInSandbox(context, skill.executor_code);

    if (!result.success) {
      logger.error("[DynamicTools] Skill execution failed:", {
        skillId,
        tenantId,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
      });
      return `Error: ${result.error}`;
    }

    // Format result for AI consumption
    const output = result.result;
    if (typeof output === "string") return output;
    if (output === undefined || output === null)
      return "Skill wykonany pomyślnie (brak wyniku).";
    return JSON.stringify(output, null, 2).slice(0, 4000);
  } catch (err) {
    logger.error("[DynamicTools] Skill exec error:", {
      skillId,
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
