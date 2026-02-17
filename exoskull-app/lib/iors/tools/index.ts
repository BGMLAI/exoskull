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
import { registerExtensionTools, registerDynamicToolResolver } from "./shared";
import { getDynamicToolsForTenant } from "./dynamic-handler";

// Re-export shared types and functions so external consumers
// (e.g. conversation-handler.ts, agent-sdk) can still import from "./index"
export type { ToolDefinition } from "./shared";
export { executeExtensionTool } from "./shared";

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
export const IORS_EXTENSION_TOOLS = [
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

// Register tools and dynamic resolver in the shared registry so
// executeExtensionTool can find them without circular deps.
registerExtensionTools(IORS_EXTENSION_TOOLS);
registerDynamicToolResolver(getDynamicToolsForTenant);

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
