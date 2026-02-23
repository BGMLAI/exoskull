/**
 * BGML MoA — Mixture of Agents (2-Layer Synthesis)
 *
 * Layer 1: DIPPER (3 perspective variants with diverse models)
 * Layer 2: Synthesis — merges the 3 variants into a single coherent response
 *
 * For critical/strategic queries (complexity 5), uses Claude Opus for synthesis.
 * Otherwise uses Claude Sonnet.
 */

import Anthropic from "@anthropic-ai/sdk";
import { runDipper, type DipperResult, type DipperModelConfig } from "./dipper";
import { logger } from "@/lib/logger";

export interface MoAResult {
  dipperResult: DipperResult;
  synthesis: string;
  synthesisModel: string;
  totalTokens: number;
}

const SYNTHESIS_PROMPT = `You are a synthesis expert. You have received three responses to the same question, each from a different perspective and AI model:

1. **Analytical** — focused on data, logic, and evidence
2. **Creative** — focused on novel ideas and unconventional approaches
3. **Practical** — focused on actionable steps and implementation

Your task: Synthesize these into ONE coherent, comprehensive response that:
- Integrates the strongest insights from each perspective
- Resolves any contradictions between perspectives
- Presents a balanced, well-rounded answer
- Maintains a natural, unified voice (not a list of "perspective X says...")
- Adds your own connections between the perspectives where valuable
- Prioritizes actionable conclusions

Here are the three responses:

## Analytical Perspective
{analytical}

## Creative Perspective
{creative}

## Practical Perspective
{practical}

Now synthesize these into a single, excellent response:`;

/**
 * Run MoA: Layer 1 (DIPPER) → Layer 2 (Synthesis).
 *
 * Uses multi-model DIPPER and configurable synthesis model.
 */
export async function runMoA(
  userMessage: string,
  systemPrompt: string,
  options?: {
    dipperModels?: DipperModelConfig;
    dipperModel?: string; // Single model fallback
    synthesisModel?: string;
    maxTokens?: number;
    useCriticalSynthesis?: boolean; // Use Opus for synthesis
  },
): Promise<MoAResult> {
  // Layer 1: DIPPER with multi-model diversity
  const dipperResult = await runDipper(userMessage, systemPrompt, {
    models: options?.dipperModels,
    model: options?.dipperModel,
    maxTokens: options?.maxTokens || 1024,
  });

  // Extract variant texts
  const variantMap: Record<string, string> = {};
  for (const v of dipperResult.variants) {
    variantMap[v.perspective] = v.text || "(no response)";
  }

  // Layer 2: Synthesis
  const synthesisPrompt = SYNTHESIS_PROMPT.replace(
    "{analytical}",
    variantMap.analytical || "(no response)",
  )
    .replace("{creative}", variantMap.creative || "(no response)")
    .replace("{practical}", variantMap.practical || "(no response)");

  // Choose synthesis model based on criticality
  const synthesisModel =
    options?.synthesisModel ||
    (options?.useCriticalSynthesis
      ? "claude-opus-4-20250514"
      : "claude-sonnet-4-5-20250929");

  let synthesis = "";
  let synthesisTokens = 0;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: synthesisModel,
      max_tokens: options?.maxTokens || 2048,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
        {
          role: "assistant",
          content:
            "I have analyzed this from three perspectives. Let me synthesize the insights.",
        },
        { role: "user", content: synthesisPrompt },
      ],
    });

    synthesis = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    synthesisTokens =
      response.usage.input_tokens + response.usage.output_tokens;

    logger.info("[BGML:MoA] Synthesis complete:", {
      synthesisModel,
      synthesisTokens,
      synthesisLength: synthesis.length,
    });
  } catch (err) {
    logger.error("[BGML:MoA] Synthesis failed:", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fallback: use the best DIPPER variant
    synthesis = dipperResult.selected.text;
  }

  return {
    dipperResult,
    synthesis,
    synthesisModel,
    totalTokens: dipperResult.totalTokens + synthesisTokens,
  };
}
