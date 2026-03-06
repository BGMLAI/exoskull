/**
 * v3 Tool Registry
 *
 * Phase 1: 10 brain tools (search, remember, web, vision, daily_summary, emotional_state)
 * Phase 2: +4 knowledge tools (import, list, get, learn_pattern)
 * Phase 3: +6 goal tools (set_goal, update_goal, get_goals, create_task, update_task, get_tasks)
 * Phase 4: +5 autonomy tools (enqueue_action, check_permissions, send_notification, log_autonomy, get_autonomy_log)
 * Phase 5: +4 builder tools (build_app, generate_content, self_extend_tool, scan_receipt)
 * Phase 6: +3 channel tools (send_sms, send_email, make_call)
 * Phase 7: +2 evolution tools (get_capabilities, reflexion_evaluate)
 *
 * Phase 8: +1 marketplace tool (publish_to_allegro)
 *
 * Current: 35 tools (Phase 1-8)
 */

import type Anthropic from "@anthropic-ai/sdk";

// ============================================================================
// TYPES
// ============================================================================

export interface V3ToolDefinition {
  definition: Anthropic.Tool;
  execute: (
    input: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>;
  timeoutMs?: number;
}

/** Extract message from Error, Supabase PostgrestError, or unknown */
export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err)
    return String((err as Record<string, unknown>).message);
  return String(err);
}

// ============================================================================
// TOOL IMPORTS
// ============================================================================

import { brainTools } from "./brain-tools";
import { knowledgeTools } from "./knowledge-tools";
import { goalTools } from "./goal-tools";
import { autonomyTools } from "./autonomy-tools";
import { builderTools } from "./builder-tools";
import { channelTools } from "./channel-tools";
import { evolutionTools } from "./evolution-tools";
import { marketplaceTools } from "./marketplace-tools";

// ============================================================================
// MERGED REGISTRY
// ============================================================================

export const V3_TOOLS: V3ToolDefinition[] = [
  ...brainTools, // 10: search_brain, remember, log_note, search_web, fetch_url, analyze_image, extract_text_from_image, get_daily_summary, correct_daily_summary, analyze_emotional_state
  ...knowledgeTools, // 4: import_url, list_knowledge, get_document, learn_pattern
  ...goalTools, // 6: set_goal, update_goal (with name resolution), get_goals, create_task, update_task, get_tasks
  ...autonomyTools, // 5: enqueue_action, check_permissions, send_notification, log_autonomy, get_autonomy_log
  ...builderTools, // 4: build_app, generate_content, self_extend_tool, scan_receipt
  ...channelTools, // 3: send_sms, send_email, make_call
  ...evolutionTools, // 2: get_capabilities, reflexion_evaluate
  ...marketplaceTools, // 1: publish_to_allegro
];

/**
 * Get tool schemas for Anthropic API.
 */
export function getV3ToolSchemas(): Anthropic.Tool[] {
  return V3_TOOLS.map((t) => ({
    name: t.definition.name,
    description: t.definition.description || t.definition.name,
    input_schema: t.definition.input_schema as Anthropic.Tool["input_schema"],
  }));
}

/**
 * Execute a v3 tool by name.
 */
export async function executeV3Tool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string | null> {
  const tool = V3_TOOLS.find((t) => t.definition.name === toolName);
  if (!tool) return null;

  const timeout = tool.timeoutMs ?? 10_000;
  return Promise.race([
    tool.execute(input, tenantId),
    new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`Tool ${toolName} timed out after ${timeout}ms`)),
        timeout,
      ),
    ),
  ]);
}
