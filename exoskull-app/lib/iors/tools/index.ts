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
];

/**
 * Get just the Anthropic tool definitions (for the API call).
 * These get spread into the IORS_TOOLS array in conversation-handler.ts.
 */
export function getExtensionToolDefinitions(): Anthropic.Tool[] {
  return IORS_EXTENSION_TOOLS.map((t) => t.definition);
}

/**
 * Execute an extension tool by name.
 * Returns null if the tool is not found (not an extension tool).
 */
const TOOL_TIMEOUT_MS = 10_000; // 10s per tool max

export async function executeExtensionTool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string | null> {
  const tool = IORS_EXTENSION_TOOLS.find((t) => t.definition.name === toolName);
  if (!tool) return null;

  try {
    const result = await Promise.race([
      tool.execute(input, tenantId),
      new Promise<string>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms`,
              ),
            ),
          TOOL_TIMEOUT_MS,
        ),
      ),
    ]);
    return result;
  } catch (error) {
    console.error(`[IORSTools] Tool ${toolName} failed:`, {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return `Blad: nie udalo sie wykonac ${toolName}. Sprobuj ponownie.`;
  }
}
