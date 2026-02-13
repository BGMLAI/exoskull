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
 * Check health status of all models via lightweight API calls.
 * Uses a fast timeout (5s) - if model doesn't respond, mark as degraded/down.
 */
export async function checkModelsHealth(): Promise<
  Record<CodeModel, "healthy" | "degraded" | "down">
> {
  const results: Record<CodeModel, "healthy" | "degraded" | "down"> = {
    "claude-code": "down",
    "kimi-code": "down",
    "gpt-o1-code": "down",
  };

  const TIMEOUT_MS = 5000;

  // Check Claude (Anthropic)
  const claudeCheck = async (): Promise<"healthy" | "degraded" | "down"> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return "down";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return "healthy";
      if (res.status === 429) return "degraded"; // Rate limited but alive
      return "down";
    } catch {
      return "down";
    }
  };

  // Check Kimi (Moonshot)
  const kimiCheck = async (): Promise<"healthy" | "degraded" | "down"> => {
    const key = process.env.KIMI_API_KEY;
    if (!key) return "down";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "kimi-latest",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return "healthy";
      if (res.status === 429) return "degraded";
      return "down";
    } catch {
      return "down";
    }
  };

  // Check OpenAI (GPT-o1)
  const openaiCheck = async (): Promise<"healthy" | "degraded" | "down"> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return "down";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return "healthy";
      if (res.status === 429) return "degraded";
      return "down";
    } catch {
      return "down";
    }
  };

  // Run all health checks in parallel
  const [claude, kimi, openai] = await Promise.allSettled([
    claudeCheck(),
    kimiCheck(),
    openaiCheck(),
  ]);

  results["claude-code"] =
    claude.status === "fulfilled" ? claude.value : "down";
  results["kimi-code"] = kimi.status === "fulfilled" ? kimi.value : "down";
  results["gpt-o1-code"] =
    openai.status === "fulfilled" ? openai.value : "down";

  return results;
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
