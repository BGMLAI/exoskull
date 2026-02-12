/**
 * Multi-Model Code Generation Router
 * Phase 2: Intelligent routing based on task complexity
 *
 * Routing Logic:
 * - Claude Code (Sonnet 4.5): Default - full-stack, multi-file, git, deployment
 * - Kimi Code: Long context (>100K tokens, large repos)
 * - GPT-o1: Deep reasoning (algorithms, optimization, proofs)
 */

import type {
  CodeModel,
  CodeGenerationTask,
  TaskClassification,
} from "./types";

/**
 * Classify task complexity and requirements
 */
export async function classifyTask(
  task: CodeGenerationTask,
): Promise<TaskClassification> {
  const { context, description, requirements } = task;

  // Estimate context tokens
  const estimatedTokens =
    (context.repoSize || 0) / 4 + // ~4 chars per token
    description.length / 4 +
    requirements.join(" ").length / 4;

  // Detect deep reasoning needs
  const reasoningKeywords =
    /algorithm|optimize|proof|complexity|O\(|performance|refactor/i;
  const requiresDeepReasoning = reasoningKeywords.test(description);

  // Detect architecture tasks
  const architectureKeywords =
    /architecture|design pattern|structure|organize|modular/i;
  const isArchitecture = architectureKeywords.test(description);

  // Classify complexity
  let complexity: TaskClassification["complexity"] = "simple";
  if (context.fileCount && context.fileCount > 10) complexity = "complex";
  else if (requirements.length > 5) complexity = "moderate";

  if (requiresDeepReasoning) complexity = "deep_reasoning";

  // Classify type
  let type: TaskClassification["type"] = "code_generation";
  if (description.includes("refactor")) type = "refactor";
  else if (description.includes("debug") || description.includes("fix"))
    type = "debug";
  else if (isArchitecture) type = "architecture";
  else if (requiresDeepReasoning) type = "optimization";

  return {
    complexity,
    requiresReasoning: requiresDeepReasoning
      ? "deep"
      : complexity === "complex"
        ? "moderate"
        : "basic",
    estimatedTokens,
    type,
  };
}

/**
 * Check health status of all models
 */
export async function checkModelsHealth(): Promise<
  Record<CodeModel, "healthy" | "degraded" | "down">
> {
  // TODO: Implement actual health checks via API
  // For now, return mock data
  return {
    "claude-code": "healthy",
    "kimi-code": "healthy",
    "gpt-o1-code": "healthy",
  };
}

/**
 * Select best model for task
 */
export async function selectCodeModel(opts: {
  task: CodeGenerationTask;
  classification: TaskClassification;
}): Promise<CodeModel> {
  const { task, classification } = opts;

  // Check model availability
  const availability = await checkModelsHealth();

  // Rule 1: Long context (>100K tokens) → Kimi Code
  if (
    classification.estimatedTokens > 100_000 ||
    (task.context.repoSize && task.context.repoSize > 100_000) ||
    task.description.match(/entire codebase|large repo|50k line/i)
  ) {
    if (availability["kimi-code"] === "healthy") {
      console.log("[ModelSelector] Long context detected → Kimi Code");
      return "kimi-code";
    } else {
      console.warn(
        "[ModelSelector] Kimi Code unavailable, falling back to Claude Code",
      );
      return "claude-code";
    }
  }

  // Rule 2: Deep reasoning (algorithms, math, optimization) → GPT-o1
  if (
    classification.requiresReasoning === "deep" ||
    classification.type === "optimization" ||
    task.description.match(/algorithm|optimize|proof|complexity|O\(/i)
  ) {
    if (availability["gpt-o1-code"] === "healthy") {
      console.log("[ModelSelector] Deep reasoning detected → GPT-o1");
      return "gpt-o1-code";
    } else {
      console.warn(
        "[ModelSelector] GPT-o1 unavailable, falling back to Claude Code",
      );
      return "claude-code";
    }
  }

  // Rule 3: Default → Claude Code (best general-purpose)
  console.log("[ModelSelector] General task → Claude Code (default)");
  return "claude-code";
}

/**
 * Route user request to appropriate code generation model
 */
export async function routeCodeGeneration(
  task: CodeGenerationTask,
): Promise<CodeModel> {
  const classification = await classifyTask(task);

  console.log("[CodeRouter] Task classification:", {
    complexity: classification.complexity,
    type: classification.type,
    estimatedTokens: classification.estimatedTokens,
    requiresReasoning: classification.requiresReasoning,
  });

  const selectedModel = await selectCodeModel({ task, classification });

  console.log("[CodeRouter] Selected model:", selectedModel);

  return selectedModel;
}
