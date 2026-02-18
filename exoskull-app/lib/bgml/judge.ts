/**
 * BGML LLM Judge — Pairwise Comparison
 *
 * Uses a small, fast model to judge which of two responses is better
 * for a given question. "A or B" format.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

export interface JudgeResult {
  winner: "A" | "B" | "tie";
  reasoning: string;
  confidence: number; // 0-1
}

const JUDGE_PROMPT = `You are an expert judge evaluating two AI responses to a user question.

## User Question
{question}

## Response A
{response_a}

## Response B
{response_b}

## Evaluation Criteria
1. **Accuracy** — Is the information correct?
2. **Completeness** — Does it address all aspects of the question?
3. **Clarity** — Is it well-organized and easy to understand?
4. **Actionability** — Does it provide concrete next steps?
5. **Relevance** — Does it stay on topic?

## Your Verdict
Reply with EXACTLY one of these formats:
- "WINNER: A" if Response A is better
- "WINNER: B" if Response B is better
- "WINNER: TIE" if they are roughly equal

Then briefly explain why (2-3 sentences max).`;

/**
 * Pairwise LLM judge: compares two responses and picks the better one.
 */
export async function llmJudgePairwise(
  question: string,
  responseA: string,
  responseB: string,
  options?: { model?: string },
): Promise<JudgeResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = options?.model || "claude-haiku-4-5-20251001";

  const prompt = JUDGE_PROMPT.replace("{question}", question)
    .replace("{response_a}", responseA.slice(0, 3000))
    .replace("{response_b}", responseB.slice(0, 3000));

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse verdict
    let winner: "A" | "B" | "tie" = "tie";
    if (/WINNER:\s*A\b/i.test(text)) winner = "A";
    else if (/WINNER:\s*B\b/i.test(text)) winner = "B";
    else if (/WINNER:\s*TIE\b/i.test(text)) winner = "tie";

    // Extract reasoning (everything after WINNER line)
    const reasoning =
      text
        .replace(/WINNER:\s*(A|B|TIE)\s*/i, "")
        .trim()
        .slice(0, 500) || "No reasoning provided.";

    return {
      winner,
      reasoning,
      confidence: winner === "tie" ? 0.5 : 0.8,
    };
  } catch (err) {
    logger.error("[BGML:Judge] Pairwise judge failed:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      winner: "tie",
      reasoning: "Judge evaluation failed.",
      confidence: 0,
    };
  }
}
