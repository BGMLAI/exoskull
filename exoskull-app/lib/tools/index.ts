// =====================================================
// EXOSKULL TOOLS - Central Registry
// =====================================================

import {
  ExoTool,
  ToolHandler,
  ToolResult,
  ToolContext,
  ToolRegistration,
} from "./types";
import { taskTool, taskHandler } from "./task-tool";
import { calendarTool, calendarHandler } from "./calendar-tool";
// email-tool uses different structure - see EMAIL_TOOL_DEFINITIONS/EMAIL_TOOL_REGISTRY
import { searchTool, searchHandler } from "./search-tool";

import { logger } from "@/lib/logger";
// Re-export types
export * from "./types";

// =====================================================
// TOOL REGISTRY
// =====================================================

const TOOL_REGISTRY: Record<string, ToolRegistration> = {
  task: {
    definition: taskTool,
    handler: taskHandler,
    category: "productivity",
  },
  calendar: {
    definition: calendarTool,
    handler: calendarHandler,
    requires_rig: ["google-workspace"],
    category: "productivity",
  },
  // Email tools have separate registry - see lib/tools/email-tool.ts
  web_search: {
    definition: searchTool,
    handler: searchHandler,
    category: "search",
  },
};

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Get all tool definitions (for Claude tool use)
 */
export function getAllToolDefinitions(): ExoTool[] {
  return Object.values(TOOL_REGISTRY).map((r) => r.definition);
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  context: ToolContext,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const registration = TOOL_REGISTRY[name];

  if (!registration) {
    return {
      success: false,
      error: `Unknown tool: ${name}. Available tools: ${Object.keys(TOOL_REGISTRY).join(", ")}`,
    };
  }

  const startTime = Date.now();

  try {
    const result = await registration.handler(context, params);

    // Log execution for analytics
    logger.info("[Tools] Executed:", {
      tool: name,
      tenant_id: context.tenant_id,
      success: result.success,
      duration_ms: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    logger.error("[Tools] Execution error:", {
      tool: name,
      tenant_id: context.tenant_id,
      error: error instanceof Error ? error.message : error,
      duration_ms: Date.now() - startTime,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Tool execution failed",
    };
  }
}

/**
 * Get tool manifest for documentation/introspection
 */
export function getToolManifest() {
  return Object.entries(TOOL_REGISTRY).map(([name, reg]) => ({
    name,
    description: reg.definition.description,
    category: reg.category,
    requires_rig: reg.requires_rig,
    parameters: Object.keys(reg.definition.parameters.properties),
    required_parameters: reg.definition.parameters.required || [],
  }));
}
