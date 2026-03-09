/**
 * Agent Coordinator — Merges and synthesizes results from multiple parallel agents.
 *
 * Used by coordinate_agents IORS tool and heartbeat CRON when processing
 * multiple coordinated tasks.
 *
 * Merge strategies:
 * - majority_vote: Pick result that appears most often
 * - quality_score: Pick highest quality result
 * - synthesis: Combine unique findings from all agents
 */

import { logger } from "@/lib/logger";

export interface AgentResult {
  agentType: string;
  taskDescription: string;
  result: string;
  success: boolean;
  confidence?: number;
  durationMs?: number;
}

export interface MergedResult {
  strategy: "majority_vote" | "quality_score" | "synthesis";
  output: string;
  sources: number;
  confidence: number;
}

/**
 * Merge results from multiple parallel agent executions.
 */
export function mergeAgentResults(results: AgentResult[]): MergedResult {
  const successes = results.filter((r) => r.success);

  if (successes.length === 0) {
    return {
      strategy: "synthesis",
      output: `All ${results.length} agents failed. Errors:\n${results.map((r) => `- ${r.agentType}: ${r.result.slice(0, 200)}`).join("\n")}`,
      sources: 0,
      confidence: 0,
    };
  }

  if (successes.length === 1) {
    return {
      strategy: "quality_score",
      output: successes[0].result,
      sources: 1,
      confidence: successes[0].confidence || 0.7,
    };
  }

  // Check if results are similar (majority vote scenario)
  const similarityThreshold = 0.6;
  const similarities = calculateSimilarities(successes);

  if (similarities.avgSimilarity > similarityThreshold) {
    // Results agree — pick the most detailed one
    const best = successes.reduce((a, b) =>
      a.result.length > b.result.length ? a : b,
    );
    return {
      strategy: "majority_vote",
      output: best.result,
      sources: successes.length,
      confidence: Math.min(
        0.95,
        (best.confidence || 0.7) + successes.length * 0.05,
      ),
    };
  }

  // Results differ — synthesize unique findings
  const synthesized = synthesizeResults(successes);
  return {
    strategy: "synthesis",
    output: synthesized,
    sources: successes.length,
    confidence: 0.6,
  };
}

/**
 * Calculate pairwise similarity between results (simple word overlap).
 */
function calculateSimilarities(results: AgentResult[]): {
  avgSimilarity: number;
} {
  if (results.length < 2) return { avgSimilarity: 1 };

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const wordsA = new Set(results[i].result.toLowerCase().split(/\s+/));
      const wordsB = new Set(results[j].result.toLowerCase().split(/\s+/));
      const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      totalSim += union.size > 0 ? intersection.size / union.size : 0;
      pairs++;
    }
  }

  return { avgSimilarity: pairs > 0 ? totalSim / pairs : 0 };
}

/**
 * Synthesize unique findings from multiple results.
 */
function synthesizeResults(results: AgentResult[]): string {
  const sections = results.map(
    (r) =>
      `### ${r.agentType} (${r.confidence ? `confidence: ${(r.confidence * 100).toFixed(0)}%` : ""})\n${r.result.slice(0, 1500)}`,
  );

  return `Synteza z ${results.length} agentów:\n\n${sections.join("\n\n---\n\n")}`;
}
