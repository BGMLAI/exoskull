/**
 * BGML DIPPER — 3-Perspective Ensemble
 *
 * Generates 3 response variants (analytical, creative, practical)
 * using parallel LLM calls, then selects the best one.
 *
 * Port from BGML.ai Python → TypeScript.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

export interface DipperVariant {
  perspective: "analytical" | "creative" | "practical";
  text: string;
  tokens: number;
}

export interface DipperResult {
  variants: DipperVariant[];
  selected: DipperVariant;
  totalTokens: number;
}

const PERSPECTIVE_INSTRUCTIONS: Record<string, string> = {
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

/**
 * Run DIPPER: 3 parallel LLM calls with different perspective prompts.
 * Returns all 3 variants and the selected best one.
 */
export async function runDipper(
  userMessage: string,
  systemPrompt: string,
  options?: {
    model?: string;
    maxTokens?: number;
  },
): Promise<DipperResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = options?.model || "claude-haiku-4-5-20251001";
  const maxTokens = options?.maxTokens || 1024;

  const perspectives = ["analytical", "creative", "practical"] as const;

  // Run all 3 variants in parallel
  const variantPromises = perspectives.map(async (perspective) => {
    const enhancedSystem = `${systemPrompt}\n\n${PERSPECTIVE_INSTRUCTIONS[perspective]}`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: enhancedSystem,
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
      } as DipperVariant;
    } catch (err) {
      logger.error(`[BGML:DIPPER] ${perspective} variant failed:`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        perspective,
        text: "",
        tokens: 0,
      } as DipperVariant;
    }
  });

  const variants = await Promise.all(variantPromises);
  const validVariants = variants.filter((v) => v.text.length > 0);

  // Simple quality heuristic: longest non-empty response
  // (In production, use voting.ts or judge.ts for better selection)
  const selected =
    validVariants.sort((a, b) => b.text.length - a.text.length)[0] ||
    variants[0];

  const totalTokens = variants.reduce((sum, v) => sum + v.tokens, 0);

  return { variants, selected, totalTokens };
}
