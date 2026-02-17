/**
 * IORS Tool Registry
 *
 * Extension tools for the conversation handler.
 * Instead of adding more tools inline in the 1955-line conversation-handler.ts,
 * new IORS tools are registered here and merged into the tool array.
 *
 * Pattern:
 * - Each domain has its own file (autonomy-tools.ts, emergency-tools.ts, etc.)
 * - Each file exports an array of ToolDefinition
 * - This index merges them all and provides lookup functions
 */

import type Anthropic from "@anthropic-ai/sdk";

/**
 * A tool definition + its execution handler, bundled together.
 */
export interface ToolDefinition {
  /** Anthropic-format tool definition for the API call */
  definition: Anthropic.Tool;
  /** Execute the tool. Returns result string for tool_result. */
  execute: (
    input: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>;
  /** Override default timeout (ms). Code-gen tools need 55s vs 10s default. */
  timeoutMs?: number;
}

// Import from per-domain files
import { autonomyTools } from "./autonomy-tools";
import { emergencyTools } from "./emergency-tools";
import { personalityTools } from "./personality-tools";
import { canvasTools } from "./canvas-tools";
import { taskTools } from "./task-tools";
import { modTools } from "./mod-tools";
import { integrationTools } from "./integration-tools";
import { planningTools } from "./planning-tools";
import { memoryTools } from "./memory-tools";
import { skillGoalTools } from "./skill-goal-tools";
import { communicationTools } from "./communication-tools";
import { emotionTools } from "./emotion-tools";
import { composioTools } from "./composio-tools";
import { feedbackTools } from "./feedback-tools";
import { knowledgeTools } from "./knowledge-tools";
import { appBuilderTools } from "./app-builder-tools";
import { selfConfigTools } from "./self-config-tools";
import { knowledgeAnalysisTools } from "./knowledge-analysis-tools";
import { emailTools } from "./email-tools";
import { webTools } from "./web-tools";
import { ralphTools } from "./ralph-tools";
import { codeGenerationTools } from "./code-generation-tools";
import { tyrolkaTools } from "./tyrolka-tools";
import { valueTools } from "./value-tools";
import { debateTools } from "./debate-tools";
import { capabilitiesTools } from "./capabilities-tools";
import { dashboardTools } from "./dashboard-tools";

// New tools — Phase 2 (Total Overhaul)
import { googleFitTools } from "./google-fit-tools";
import { googleDriveTools } from "./google-drive-tools";
import { contentTools } from "./content-tools";
import { strategyTools } from "./strategy-tools";
import { outboundTools } from "./outbound-tools";
import { codeExecutionTools } from "./code-execution-tools";
import { mcpBridgeTools } from "./mcp-bridge-tools";

/**
 * All IORS extension tools, merged from all domain files.
 */
export const IORS_EXTENSION_TOOLS: ToolDefinition[] = [
  ...autonomyTools,
  ...emergencyTools,
  ...personalityTools,
  ...canvasTools,
  ...taskTools,
  ...modTools,
  ...integrationTools,
  ...planningTools,
  ...memoryTools,
  ...skillGoalTools,
  ...communicationTools,
  ...emotionTools,
  ...composioTools,
  ...feedbackTools,
  ...knowledgeTools,
  ...appBuilderTools,
  ...selfConfigTools,
  ...knowledgeAnalysisTools,
  ...emailTools,
  ...webTools,
  ...ralphTools,
  ...codeGenerationTools,
  ...tyrolkaTools,
  ...valueTools,
  ...debateTools,
  ...capabilitiesTools,
  ...dashboardTools,
  // Phase 2 tools
  ...googleFitTools,
  ...googleDriveTools,
  ...contentTools,
  ...strategyTools,
  ...outboundTools,
  // Code execution tools (VPS file ops, bash, git, web search, skills)
  ...codeExecutionTools,
  // MCP bridge tools (GitHub, Slack, Notion — direct API calls)
  ...mcpBridgeTools,
];

/**
 * Get just the Anthropic tool definitions (for the API call).
 * These get spread into the IORS_TOOLS array in conversation-handler.ts.
 */
export function getExtensionToolDefinitions(): Anthropic.Tool[] {
  return IORS_EXTENSION_TOOLS.map((t) => t.definition);
}

/**
 * Get all tools for a tenant: static IORS tools + dynamic tools from DB.
 * Dynamic tools are prefixed with "dyn_" and cached per tenant (5 min).
 */
export async function getToolsForTenant(tenantId: string): Promise<{
  definitions: Anthropic.Tool[];
  dynamicCount: number;
}> {
  // Lazy import to avoid circular deps
  const { getDynamicToolsForTenant } = await import("./dynamic-handler");
  const dynamicTools = await getDynamicToolsForTenant(tenantId);

  if (dynamicTools.length === 0) {
    return { definitions: getExtensionToolDefinitions(), dynamicCount: 0 };
  }

  const allDefs = [
    ...IORS_EXTENSION_TOOLS.map((t) => t.definition),
    ...dynamicTools.map((t) => t.definition),
  ];

  return { definitions: allDefs, dynamicCount: dynamicTools.length };
}

/**
 * Execute an extension tool by name.
 * Returns null if the tool is not found (not an extension tool).
 * Logs telemetry to exo_tool_executions (fire-and-forget).
 */
const TOOL_TIMEOUT_MS = 10_000; // 10s per tool max

export async function executeExtensionTool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string | null> {
  let tool = IORS_EXTENSION_TOOLS.find((t) => t.definition.name === toolName);

  // If not found in static tools, check dynamic tools (dyn_* prefix)
  if (!tool && toolName.startsWith("dyn_")) {
    try {
      const { getDynamicToolsForTenant } = await import("./dynamic-handler");
      const dynamicTools = await getDynamicToolsForTenant(tenantId);
      tool =
        dynamicTools.find((t) => t.definition.name === toolName) || undefined;
    } catch {
      // Dynamic tool lookup failed — fall through to null
    }
  }

  if (!tool) return null;

  const startMs = Date.now();

  try {
    const timeout = tool.timeoutMs ?? TOOL_TIMEOUT_MS;
    const result = await Promise.race([
      tool.execute(input, tenantId),
      new Promise<string>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Tool ${toolName} timed out after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);

    // Fire-and-forget telemetry
    logToolExecution(tenantId, toolName, true, null, Date.now() - startMs);

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error(`[IORSTools] Tool ${toolName} failed:`, {
      tenantId,
      error: errorMsg,
    });

    // Fire-and-forget telemetry
    logToolExecution(tenantId, toolName, false, errorMsg, Date.now() - startMs);

    return `Blad: nie udalo sie wykonac ${toolName}. Sprobuj ponownie.`;
  }
}

/**
 * Log tool execution to exo_tool_executions (fire-and-forget).
 * Never throws — errors are silently swallowed.
 */
function logToolExecution(
  tenantId: string,
  toolName: string,
  success: boolean,
  errorMessage: string | null,
  durationMs: number,
): void {
  // Dynamic import to avoid circular dependencies and module-level side effects
  import("@/lib/supabase/service")
    .then(({ getServiceSupabase }) => {
      const supabase = getServiceSupabase();
      supabase
        .from("exo_tool_executions")
        .insert({
          tenant_id: tenantId,
          tool_name: toolName,
          success,
          error_message: errorMessage,
          duration_ms: Math.round(durationMs),
        })
        .then(({ error }) => {
          if (error) {
            // Silently log — telemetry should never break the main flow
            console.warn("[IORSTools:Telemetry] Insert failed:", error.message);
          }
        });
    })
    .catch(() => {
      // Silently ignore — telemetry is non-critical
    });
}
