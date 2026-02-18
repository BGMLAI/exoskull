/**
 * BGML MoA — Mixture of Agents (2-Layer Synthesis)
 *
 * Layer 1: DIPPER (3 perspective variants)
 * Layer 2: Synthesis — merges the 3 variants into a single coherent response
 *
 * Port from BGML.ai Python → TypeScript.
 */

import Anthropic from "@anthropic-ai/sdk";
import { runDipper, type DipperResult } from "./dipper";
import { logger } from "@/lib/logger";

export interface MoAResult {
  dipperResult: DipperResult;
  synthesis: string;
  totalTokens: number;
}

const SYNTHESIS_PROMPT = `You are a synthesis expert. You have received three responses to the same question, each from a different perspective:

1. **Analytical** — focused on data, logic, and evidence
2. **Creative** — focused on novel ideas and unconventional approaches
3. **Practical** — focused on actionable steps and implementation

Your task: Synthesize these into ONE coherent, comprehensive response that:
- Integrates the strongest insights from each perspective
- Resolves any contradictions between perspectives
- Presents a balanced, well-rounded answer
- Maintains a natural, unified voice (not a list of "perspective X says...")
- Adds your own connections between the perspectives where valuable

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
 */
export async function runMoA(
  userMessage: string,
  systemPrompt: string,
  options?: {
    dipperModel?: string;
    synthesisModel?: string;
    maxTokens?: number;
  },
): Promise<MoAResult> {
  // Layer 1: DIPPER
  const dipperResult = await runDipper(userMessage, systemPrompt, {
    model: options?.dipperModel || "claude-haiku-4-5-20251001",
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

  let synthesis = "";
  let synthesisTokens = 0;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: options?.synthesisModel || "claude-sonnet-4-5-20250929",
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
    totalTokens: dipperResult.totalTokens + synthesisTokens,
  };
}
