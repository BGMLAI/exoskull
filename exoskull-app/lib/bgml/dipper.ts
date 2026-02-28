/**
 * BGML DIPPER — 3-Perspective Ensemble with Multi-Model Diversity
 *
 * Generates 3 response variants (analytical, creative, practical)
 * using parallel aiChat() calls with DIFFERENT models per perspective
 * for true cognitive diversity.
 *
 * Default model mapping:
 *   analytical → Gemini 3.1 Pro (best at data/reasoning)
 *   creative   → Gemini 3.1 Pro (strong creative, cost-effective)
 *   practical  → Gemini Flash (fast, practical focus)
 *
 * Port from BGML.ai Python → TypeScript, enhanced with multi-model.
 */

import { aiChat } from "@/lib/ai";
import type { ModelId } from "@/lib/ai/types";
import { scoreResponse } from "./voting";
import { logger } from "@/lib/logger";

export type Perspective = "analytical" | "creative" | "practical";

export interface DipperVariant {
  perspective: Perspective;
  text: string;
  tokens: number;
  model: string;
  qualityScore?: number;
}

export interface DipperResult {
  variants: DipperVariant[];
  selected: DipperVariant;
  totalTokens: number;
}

export interface DipperModelConfig {
  analytical?: string;
  creative?: string;
  practical?: string;
}

const PERSPECTIVE_INSTRUCTIONS: Record<Perspective, string> = {
  analytical: `Respond from an ANALYTICAL perspective. Focus on:
- Data, evidence, and logical reasoning
- Systematic breakdown of the problem
- Quantitative analysis where possible
- Identifying assumptions and validating them
- Structured conclusions with supporting evidence`,

  creative: `Respond from a CREATIVE perspective. Focus on:
- Novel and unconventional approaches
- Lateral thinking and unexpected connections
- "What if" scenarios and thought experiments
- Reframing the problem from a different angle
- Innovative solutions that challenge assumptions`,

  practical: `Respond from a PRACTICAL perspective. Focus on:
- Actionable steps and implementation details
- Resource constraints and feasibility
- Quick wins and incremental progress
- Real-world examples and case studies
- Risk mitigation and contingency plans`,
};

/** Default model per perspective for cognitive diversity */
const DEFAULT_MODELS: Record<Perspective, ModelId> = {
  analytical: "gemini-3.1-pro",
  creative: "gemini-3.1-pro",
  practical: "gemini-3-flash",
};

/**
 * Call a single perspective via aiChat().
 */
async function callPerspective(
  perspective: Perspective,
  userMessage: string,
  systemPrompt: string,
  model: string,
  maxTokens: number,
): Promise<DipperVariant> {
  const enhancedSystem = `${systemPrompt}\n\n${PERSPECTIVE_INSTRUCTIONS[perspective]}`;

  try {
    const result = await aiChat(
      [
        { role: "system", content: enhancedSystem },
        { role: "user", content: userMessage },
      ],
      { forceModel: model as ModelId, maxTokens },
    );

    return {
      perspective,
      text: result.content || "",
      tokens: result.usage.totalTokens,
      model,
    };
  } catch (err) {
    logger.error(`[BGML:DIPPER] ${perspective} variant failed (${model}):`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { perspective, text: "", tokens: 0, model };
  }
}

/**
 * Run DIPPER: 3 parallel LLM calls with different perspective prompts.
 * Now with multi-model diversity — each perspective can use a different model.
 */
export async function runDipper(
  userMessage: string,
  systemPrompt: string,
  options?: {
    model?: string; // Single model for all (backward compat)
    models?: DipperModelConfig; // Per-perspective models (new)
    maxTokens?: number;
  },
): Promise<DipperResult> {
  const maxTokens = options?.maxTokens || 1024;
  const perspectives: Perspective[] = ["analytical", "creative", "practical"];

  // Determine model per perspective
  const modelMap: Record<Perspective, string> = {
    analytical:
      options?.models?.analytical ||
      options?.model ||
      DEFAULT_MODELS.analytical,
    creative:
      options?.models?.creative || options?.model || DEFAULT_MODELS.creative,
    practical:
      options?.models?.practical || options?.model || DEFAULT_MODELS.practical,
  };

  logger.info("[BGML:DIPPER] Running with models:", modelMap);

  // Run all 3 variants in parallel
  const variantPromises = perspectives.map((perspective) =>
    callPerspective(
      perspective,
      userMessage,
      systemPrompt,
      modelMap[perspective],
      maxTokens,
    ),
  );

  const variants = await Promise.all(variantPromises);
  const validVariants = variants.filter((v) => v.text.length > 0);

  // Use voting.ts for quality-based selection instead of simple length heuristic
  for (const v of validVariants) {
    v.qualityScore = scoreResponse(v.text).score;
  }
  const selected =
    validVariants.sort(
      (a, b) => (b.qualityScore || 0) - (a.qualityScore || 0),
    )[0] || variants[0];

  const totalTokens = variants.reduce((sum, v) => sum + v.tokens, 0);

  logger.info("[BGML:DIPPER] Results:", {
    variants: variants.map((v) => ({
      perspective: v.perspective,
      model: v.model,
      quality: v.qualityScore,
      length: v.text.length,
    })),
    selected: selected.perspective,
  });

  return { variants, selected, totalTokens };
}
