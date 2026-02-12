/**
 * Code Generation Executor
 * Phase 2: Main entry point for multi-model code generation
 *
 * Features:
 * - Automatic model selection based on task
 * - Fallback chain (Kimi/GPT-o1 → Claude Code)
 * - Health monitoring
 */

import type {
  CodeModel,
  CodeGenerationTask,
  CodeGenerationResult,
} from "./types";
import { routeCodeGeneration } from "./model-selector";
import { ClaudeCodeAdapter } from "./adapters/claude-code";
import { KimiCodeAdapter } from "./adapters/kimi-code";
import { GPTo1CodeAdapter } from "./adapters/gpt-o1-code";

/**
 * Get executor instance for a model
 */
function getExecutor(model: CodeModel, tenantId: string) {
  switch (model) {
    case "claude-code":
      return new ClaudeCodeAdapter(tenantId);
    case "kimi-code":
      return new KimiCodeAdapter(tenantId);
    case "gpt-o1-code":
      return new GPTo1CodeAdapter(tenantId);
  }
}

/**
 * Execute code generation with automatic model selection and fallback
 */
export async function executeCodeGeneration(
  task: CodeGenerationTask,
): Promise<CodeGenerationResult> {
  const startTime = Date.now();

  try {
    // STEP 1: Route to best model
    const selectedModel = await routeCodeGeneration(task);

    console.log("[CodeExecutor] Selected model:", selectedModel);

    // STEP 2: Get executor
    const executor = getExecutor(selectedModel, task.tenantId);

    // STEP 3: Execute
    const result = await executor.execute(task);

    // STEP 4: Fallback if failed
    if (!result.success) {
      console.warn(
        `[CodeExecutor] ${selectedModel} failed, attempting fallback`,
      );

      // Fallback chain: Kimi/GPT-o1 → Claude Code
      if (selectedModel !== "claude-code") {
        console.log("[CodeExecutor] Falling back to Claude Code");
        const fallbackExecutor = getExecutor("claude-code", task.tenantId);
        const fallbackResult = await fallbackExecutor.execute(task);

        if (fallbackResult.success) {
          console.log("[CodeExecutor] Fallback succeeded");
          return fallbackResult;
        } else {
          console.error("[CodeExecutor] Fallback also failed");
          return fallbackResult;
        }
      } else {
        // Claude Code is primary - no fallback
        console.error("[CodeExecutor] Claude Code failed (no fallback)");
        return result;
      }
    }

    console.log(`[CodeExecutor] Task completed in ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    console.error("[CodeExecutor] Unexpected error:", error);

    return {
      success: false,
      model: "claude-code", // Default
      files: [],
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get health status of all models
 */
export async function getModelsHealth(
  tenantId: string,
): Promise<Record<CodeModel, "healthy" | "degraded" | "down">> {
  const models: CodeModel[] = ["claude-code", "kimi-code", "gpt-o1-code"];

  const health = await Promise.all(
    models.map(async (model) => {
      const executor = getExecutor(model, tenantId);
      const status = await executor.health();
      return [model, status] as const;
    }),
  );

  return Object.fromEntries(health) as Record<
    CodeModel,
    "healthy" | "degraded" | "down"
  >;
}
