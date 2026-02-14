/**
 * IORS MCP Server — wraps all 60+ ExoSkull tools for Claude Agent SDK
 *
 * Converts the existing ToolDefinition[] (Anthropic JSON Schema format)
 * into SdkMcpToolDefinitions (Zod schemas) and registers them as an
 * in-process MCP server. No network overhead — runs in same process.
 *
 * Usage:
 *   const server = createIorsMcpServer(tenantId);
 *   query({ prompt, options: { mcpServers: { iors: server } } });
 *
 * The tenantId is injected via closure — each query gets its own server instance.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import {
  IORS_EXTENSION_TOOLS,
  type ToolDefinition,
} from "@/lib/iors/tools/index";
import { logger } from "@/lib/logger";

// ============================================================================
// JSON Schema → Zod converter (handles common IORS tool patterns)
// ============================================================================

type JsonSchemaProp = {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: JsonSchemaProp;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
};

function jsonSchemaPropertyToZod(prop: JsonSchemaProp): z.ZodTypeAny {
  if (!prop || !prop.type) return z.any();

  switch (prop.type) {
    case "string": {
      if (prop.enum && prop.enum.length > 0) {
        const zodEnum = z.enum(prop.enum as [string, ...string[]]);
        return prop.description ? zodEnum.describe(prop.description) : zodEnum;
      }
      const s = z.string();
      return prop.description ? s.describe(prop.description) : s;
    }

    case "number":
    case "integer": {
      const n = z.number();
      return prop.description ? n.describe(prop.description) : n;
    }

    case "boolean": {
      const b = z.boolean();
      return prop.description ? b.describe(prop.description) : b;
    }

    case "array": {
      const itemSchema = prop.items
        ? jsonSchemaPropertyToZod(prop.items)
        : z.any();
      const arr = z.array(itemSchema);
      return prop.description ? arr.describe(prop.description) : arr;
    }

    case "object": {
      if (prop.properties) {
        const shape = buildZodShape(prop.properties, prop.required || []);
        const obj = z.object(shape);
        return prop.description ? obj.describe(prop.description) : obj;
      }
      const rec = z.record(z.any());
      return prop.description ? rec.describe(prop.description) : rec;
    }

    default:
      return z.any();
  }
}

function buildZodShape(
  properties: Record<string, JsonSchemaProp>,
  required: string[],
): z.ZodRawShape {
  const shape: z.ZodRawShape = {};

  for (const [key, prop] of Object.entries(properties)) {
    const zodType = jsonSchemaPropertyToZod(prop);
    shape[key] = required.includes(key) ? zodType : zodType.optional();
  }

  return shape;
}

// ============================================================================
// Convert IORS ToolDefinition → SDK MCP tool
// ============================================================================

function convertIorsTool(toolDef: ToolDefinition, tenantId: string) {
  const schema = toolDef.definition.input_schema as {
    type: string;
    properties?: Record<string, JsonSchemaProp>;
    required?: string[];
  };

  const properties = schema.properties || {};
  const required = schema.required || [];
  const zodShape = buildZodShape(properties, required);

  return tool(
    toolDef.definition.name,
    toolDef.definition.description || toolDef.definition.name,
    zodShape,
    async (args) => {
      const startMs = Date.now();
      const toolName = toolDef.definition.name;

      try {
        const timeout = toolDef.timeoutMs ?? 10_000;
        const result = await Promise.race([
          toolDef.execute(args as Record<string, unknown>, tenantId),
          new Promise<string>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Tool ${toolName} timed out after ${timeout}ms`),
                ),
              timeout,
            ),
          ),
        ]);

        logger.info(`[IORS-MCP] ${toolName} OK (${Date.now() - startMs}ms)`);

        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(
          `[IORS-MCP] ${toolName} FAILED (${Date.now() - startMs}ms):`,
          { error: msg },
        );

        return {
          content: [{ type: "text" as const, text: `Błąd: ${msg}` }],
          isError: true,
        };
      }
    },
    {
      annotations: {
        // Mark write tools as destructive, read tools as read-only
        readOnly: isReadOnlyTool(toolDef.definition.name),
      },
    },
  );
}

// ============================================================================
// Tool classification helpers
// ============================================================================

const READ_ONLY_TOOLS = new Set([
  "list_tasks",
  "list_apps",
  "app_get_data",
  "list_goals",
  "list_quests",
  "list_ops",
  "list_notes",
  "search_knowledge",
  "search_emails",
  "email_summary",
  "email_follow_ups",
  "email_sender_info",
  "search_web",
  "fetch_webpage",
  "get_autonomy_settings",
  "get_personality",
  "get_mods",
  "get_integrations",
  "list_canvas_widgets",
  "get_memories",
  "get_goals_progress",
  "get_energy_history",
  "get_emotion_state",
  "analyze_knowledge",
  "composio_list_connections",
  "get_feedback_stats",
  "get_google_fit_data",
  "list_google_drive_files",
  "get_debate_status",
  "get_value_profile",
]);

function isReadOnlyTool(name: string): boolean {
  return (
    READ_ONLY_TOOLS.has(name) ||
    name.startsWith("list_") ||
    name.startsWith("get_") ||
    name.startsWith("search_")
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create an in-process MCP server wrapping all IORS tools for a specific tenant.
 *
 * Returns an McpSdkServerConfigWithInstance that plugs directly into
 * query({ options: { mcpServers: { iors: server } } })
 *
 * @param tenantId - The ExoSkull tenant UUID
 * @param extraTools - Optional additional ToolDefinitions to include (e.g., dynamic tools)
 */
export function createIorsMcpServer(
  tenantId: string,
  extraTools?: ToolDefinition[],
) {
  const allToolDefs = extraTools
    ? [...IORS_EXTENSION_TOOLS, ...extraTools]
    : IORS_EXTENSION_TOOLS;

  const mcpTools = allToolDefs.map((t) => convertIorsTool(t, tenantId));

  logger.info(
    `[IORS-MCP] Server created: ${mcpTools.length} tools for tenant ${tenantId}`,
  );

  return createSdkMcpServer({
    name: "iors",
    version: "1.0.0",
    tools: mcpTools,
  });
}

/**
 * Create IORS MCP server including dynamic tools from the database.
 * Slightly slower than createIorsMcpServer() due to DB query for dynamic tools.
 */
export async function createIorsMcpServerWithDynamic(tenantId: string) {
  try {
    const { getDynamicToolsForTenant } =
      await import("@/lib/iors/tools/dynamic-handler");
    const dynamicTools = await getDynamicToolsForTenant(tenantId);
    return createIorsMcpServer(tenantId, dynamicTools);
  } catch (error) {
    logger.warn("[IORS-MCP] Failed to load dynamic tools, using static only:", {
      error: error instanceof Error ? error.message : error,
    });
    return createIorsMcpServer(tenantId);
  }
}
