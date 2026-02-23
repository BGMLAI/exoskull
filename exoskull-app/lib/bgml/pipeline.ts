/**
 * BGML Pipeline — Unified orchestrator for the full BGML quality pipeline.
 *
 * Replaces ad-hoc BGML injection in exoskull-agent.ts with a clean,
 * complexity-driven pipeline:
 *
 *   Complexity 1-2: Direct response (no BGML)
 *   Complexity 3:   Framework-guided (inject prompt_template)
 *   Complexity 4:   DIPPER (3 perspectives, 3 models) + voting
 *   Complexity 5:   Full MoA (DIPPER → Opus synthesis) + quality gate
 *
 * Also supports quality-based auto-escalation and self-correction.
 */

import { classify, type ClassificationResult } from "./classifier";
import { selectFramework, type BGMLFramework } from "./framework-selector";
import { runDipper, type DipperResult } from "./dipper";
import { runMoA, type MoAResult } from "./moa";
import { scoreResponse, type ScoredResponse } from "./voting";
import { llmJudgePairwise } from "./judge";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface BGMLPipelineResult {
  /** Classification of the user message */
  classification: ClassificationResult;
  /** Selected framework (if any) */
  framework: BGMLFramework | null;
  /** DIPPER result (complexity >= 4) */
  dipperResult?: DipperResult;
  /** MoA result (complexity >= 5) */
  moaResult?: MoAResult;
  /** Quality score of the pipeline output */
  qualityScore?: ScoredResponse;
  /** Text to prepend to agent context (framework + insights) */
  contextInjection: string;
  /** Pre-computed response (for DIPPER/MoA — agent can use instead of generating) */
  precomputedResponse?: string;
  /** Pipeline tier used */
  tier: "direct" | "framework" | "dipper" | "moa";
  /** Total tokens used by BGML pipeline */
  totalTokens: number;
  /** Pipeline duration in ms */
  durationMs: number;
}

export interface BGMLPipelineOptions {
  /** Override complexity (skip classifier) */
  forceComplexity?: number;
  /** System prompt to use for DIPPER/MoA */
  systemPrompt?: string;
  /** Max tokens per perspective */
  maxTokens?: number;
  /** Skip quality scoring */
  skipQuality?: boolean;
  /** Auto-escalate if quality < threshold */
  autoEscalateThreshold?: number;
}

// ============================================================================
// QUALITY THRESHOLDS
// ============================================================================

const QUALITY_THRESHOLD_PASS = 70;
const QUALITY_THRESHOLD_JUDGE = 50;

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Run the full BGML pipeline for a user message.
 *
 * Returns classification, framework injection, and optionally
 * a pre-computed high-quality response from DIPPER/MoA.
 */
export async function runBGMLPipeline(
  userMessage: string,
  options?: BGMLPipelineOptions,
): Promise<BGMLPipelineResult> {
  const startMs = Date.now();
  let totalTokens = 0;

  // Step 1: Classify (deterministic, ~0ms)
  const classification = classify(userMessage);
  const complexity = options?.forceComplexity ?? classification.complexity;

  logger.info("[BGML:Pipeline] Classification:", {
    domain: classification.domain,
    complexity,
    confidence: classification.confidence,
  });

  // Step 2: Select framework (cached DB query, ~1ms)
  const framework =
    complexity >= 3 ? await selectFramework(classification.domain) : null;

  // ── Complexity 1-2: Direct (no BGML enhancement) ──
  if (complexity <= 2) {
    return {
      classification,
      framework: null,
      contextInjection: "",
      tier: "direct",
      totalTokens: 0,
      durationMs: Date.now() - startMs,
    };
  }

  // ── Complexity 3: Framework-guided ──
  if (complexity === 3) {
    const contextInjection = framework
      ? `\n## Reasoning Framework: ${framework.name}\n` +
        `Domain: ${classification.domain} | Complexity: ${complexity}/5\n\n` +
        framework.prompt_template
      : "";

    return {
      classification,
      framework,
      contextInjection,
      tier: "framework",
      totalTokens: 0,
      durationMs: Date.now() - startMs,
    };
  }

  const systemPrompt = options?.systemPrompt || "";

  // ── Complexity 4: DIPPER (3 perspectives, 3 models) ──
  if (complexity === 4) {
    const dipperResult = await runDipper(userMessage, systemPrompt, {
      maxTokens: options?.maxTokens || 1024,
      // Multi-model diversity — use defaults from dipper.ts
    });
    totalTokens += dipperResult.totalTokens;

    // Quality check on selected variant
    const qualityScore = !options?.skipQuality
      ? scoreResponse(dipperResult.selected.text)
      : undefined;

    // Auto-escalate to MoA if quality is poor
    if (
      qualityScore &&
      qualityScore.score <
        (options?.autoEscalateThreshold || QUALITY_THRESHOLD_JUDGE) &&
      !options?.skipQuality
    ) {
      logger.info(
        "[BGML:Pipeline] Auto-escalating from DIPPER to MoA (quality too low):",
        {
          score: qualityScore.score,
        },
      );
      // Fall through to MoA
    } else {
      const frameworkCtx = framework
        ? `\n## Reasoning Framework: ${framework.name}\n${framework.prompt_template}\n`
        : "";

      const dipperContext = dipperResult.variants
        .map(
          (v) =>
            `### ${v.perspective} (${v.model}, quality: ${v.qualityScore || "n/a"})\n${v.text.slice(0, 500)}`,
        )
        .join("\n\n");

      return {
        classification,
        framework,
        dipperResult,
        qualityScore,
        contextInjection: `${frameworkCtx}\n## BGML DIPPER Analysis (3 perspectives)\n${dipperContext}`,
        precomputedResponse: dipperResult.selected.text,
        tier: "dipper",
        totalTokens,
        durationMs: Date.now() - startMs,
      };
    }
  }

  // ── Complexity 5 (or escalated from 4): Full MoA ──
  const moaResult = await runMoA(userMessage, systemPrompt, {
    maxTokens: options?.maxTokens || 1536,
    useCriticalSynthesis: complexity >= 5, // Opus for truly strategic queries
  });
  totalTokens += moaResult.totalTokens;

  // Quality gate on synthesis
  const synthesisScore = !options?.skipQuality
    ? scoreResponse(moaResult.synthesis)
    : undefined;

  let finalResponse = moaResult.synthesis;

  // If synthesis quality < threshold, judge against best DIPPER variant
  if (
    synthesisScore &&
    synthesisScore.score < QUALITY_THRESHOLD_PASS &&
    moaResult.dipperResult.selected.text
  ) {
    logger.info(
      "[BGML:Pipeline] Synthesis quality below threshold, running judge:",
      {
        synthesisScore: synthesisScore.score,
      },
    );
    const judgeResult = await llmJudgePairwise(
      userMessage,
      moaResult.synthesis,
      moaResult.dipperResult.selected.text,
    );

    if (judgeResult.winner === "B") {
      logger.info(
        "[BGML:Pipeline] Judge prefers DIPPER variant over synthesis",
      );
      finalResponse = moaResult.dipperResult.selected.text;
    }
  }

  const frameworkCtx = framework
    ? `\n## Reasoning Framework: ${framework.name}\n${framework.prompt_template}\n`
    : "";

  return {
    classification,
    framework,
    dipperResult: moaResult.dipperResult,
    moaResult,
    qualityScore: synthesisScore,
    contextInjection: `${frameworkCtx}\n## BGML MoA Synthesis\nDomain: ${classification.domain} | Complexity: ${complexity}/5\n`,
    precomputedResponse: finalResponse,
    tier: "moa",
    totalTokens,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Score a response and determine if it needs escalation.
 */
export function shouldEscalate(responseText: string): {
  score: number;
  shouldEscalate: boolean;
  reason?: string;
} {
  const scored = scoreResponse(responseText);

  if (scored.score >= QUALITY_THRESHOLD_PASS) {
    return { score: scored.score, shouldEscalate: false };
  }

  if (scored.score >= QUALITY_THRESHOLD_JUDGE) {
    return {
      score: scored.score,
      shouldEscalate: false,
      reason: `Quality ${scored.score}/100 — acceptable but could be better`,
    };
  }

  return {
    score: scored.score,
    shouldEscalate: true,
    reason: `Quality ${scored.score}/100 — below threshold ${QUALITY_THRESHOLD_JUDGE}`,
  };
}
