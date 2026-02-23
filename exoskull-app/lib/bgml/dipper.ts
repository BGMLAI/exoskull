/**
 * BGML DIPPER — 3-Perspective Ensemble with Multi-Model Diversity
 *
 * Generates 3 response variants (analytical, creative, practical)
 * using parallel LLM calls with DIFFERENT models per perspective
 * for true cognitive diversity.
 *
 * Default model mapping:
 *   analytical → Gemini Pro (best at data/reasoning)
 *   creative   → Claude Sonnet (best at creative/narrative)
 *   practical  → Claude Haiku (fast, practical focus)
 *
 * Port from BGML.ai Python → TypeScript, enhanced with multi-model.
 */

import Anthropic from "@anthropic-ai/sdk";
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
const DEFAULT_MODELS: Record<Perspective, string> = {
  analytical: "gemini-2.0-flash", // Gemini — fast, strong at data/reasoning
  creative: "claude-sonnet-4-5-20250929", // Claude Sonnet — best creative/narrative
  practical: "claude-haiku-4-5-20251001", // Haiku — fast, practical
};

/**
 * Call a single perspective. Routes to the right provider based on model name.
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
    // Route to Gemini or Anthropic based on model name
    if (model.startsWith("gemini")) {
      return await callGemini(
        perspective,
        userMessage,
        enhancedSystem,
        model,
        maxTokens,
      );
    } else {
      return await callAnthropic(
        perspective,
        userMessage,
        enhancedSystem,
        model,
        maxTokens,
      );
    }
  } catch (err) {
    logger.error(`[BGML:DIPPER] ${perspective} variant failed (${model}):`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { perspective, text: "", tokens: 0, model };
  }
}

async function callAnthropic(
  perspective: Perspective,
  userMessage: string,
  system: string,
  model: string,
  maxTokens: number,
): Promise<DipperVariant> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    perspective,
    text,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
    model,
  };
}

async function callGemini(
  perspective: Perspective,
  userMessage: string,
  system: string,
  model: string,
  maxTokens: number,
): Promise<DipperVariant> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback to Anthropic Haiku if no Gemini key
    return callAnthropic(
      perspective,
      userMessage,
      system,
      "claude-haiku-4-5-20251001",
      maxTokens,
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const tokens =
    (data.usageMetadata?.promptTokenCount || 0) +
    (data.usageMetadata?.candidatesTokenCount || 0);

  return { perspective, text, tokens, model };
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
