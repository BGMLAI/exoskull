/**
 * Shared types and tool execution for IORS tools.
 *
 * Extracted from index.ts to break circular dependencies:
 * index.ts imports all tool files, and tool files need ToolDefinition.
 * By putting ToolDefinition here, tool files import from shared.ts
 * instead of index.ts, breaking the cycle.
 *
 * Also contains executeExtensionTool (used by dynamic-handler.ts)
 * with a registry pattern: index.ts registers the tools array and the
 * dynamic tool resolver at module load time, so shared.ts never needs
 * to import any sibling module.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { logger } from "@/lib/logger";
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

// ---------------------------------------------------------------------------
// Tool registry — populated by index.ts at module load time
// ---------------------------------------------------------------------------

let _registeredTools: ToolDefinition[] = [];

/** Callback to resolve dynamic (dyn_*) tools for a tenant. */
type DynamicToolResolver = (tenantId: string) => Promise<ToolDefinition[]>;
let _dynamicToolResolver: DynamicToolResolver | null = null;

/**
 * Called by index.ts to register the merged tools array.
 * Must be called before executeExtensionTool is used.
 */
export function registerExtensionTools(tools: ToolDefinition[]): void {
  _registeredTools = tools;
}

/**
 * Register the dynamic tool resolver (called by index.ts at module load).
 * This avoids shared.ts needing to import dynamic-handler.ts directly.
 */
export function registerDynamicToolResolver(
  resolver: DynamicToolResolver,
): void {
  _dynamicToolResolver = resolver;
}

/**
 * Get the registered extension tools array.
 * Used by index.ts for getToolsForTenant and other lookup functions.
 */
export function getRegisteredTools(): ToolDefinition[] {
  return _registeredTools;
}

// ---------------------------------------------------------------------------
// executeExtensionTool — lives here so dynamic-handler.ts doesn't need index.ts
// ---------------------------------------------------------------------------

const TOOL_TIMEOUT_MS = 10_000; // 10s per tool max

/**
 * Execute an extension tool by name.
 * Returns null if the tool is not found (not an extension tool).
 * Logs telemetry to exo_tool_executions (fire-and-forget).
 */
export async function executeExtensionTool(
  toolName: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string | null> {
  let tool = _registeredTools.find((t) => t.definition.name === toolName);

  // If not found in static tools, check dynamic tools (dyn_* prefix)
  if (!tool && toolName.startsWith("dyn_") && _dynamicToolResolver) {
    try {
      const dynamicTools = await _dynamicToolResolver(tenantId);
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

    logger.error(`[IORSTools] Tool ${toolName} failed:`, {
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
            logger.warn("[IORSTools:Telemetry] Insert failed:", error.message);
          }
        });
    })
    .catch(() => {
      // Silently ignore — telemetry is non-critical
    });
}
