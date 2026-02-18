/**
 * Swarm Coordinator for Complex Source Modifications
 *
 * When Ralph Loop detects a complex source modification task
 * (description > 100 chars, multiple files, architectural change),
 * it routes here for 3-agent parallel coordination:
 *
 *   Explorer → finds root cause, traces imports, maps related code
 *   Builder  → generates diff + related test changes
 *   Reviewer → checks for kernel violations, protected patterns, regressions
 *
 * Uses the existing Agent Swarm infrastructure from lib/system/agent-swarm.ts.
 */

import { aiChat } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { DiffResult } from "./diff-generator";
import type { SourceModRequest, SwarmOutput } from "./source-engine";

// ============================================================================
// ROUTING HEURISTIC
// ============================================================================

/**
 * Determine if a source modification is complex enough to warrant swarm coordination.
 */
export function isComplexModification(request: SourceModRequest): boolean {
  if (request.description.length > 100) return true;
  if (request.targetFiles.length > 3) return true;
  if (request.context?.includes("architecture")) return true;
  if (request.context?.includes("refactor")) return true;
  return false;
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Coordinate a multi-agent swarm for complex source modifications.
 *
 * Runs 3 agents in parallel:
 * 1. Explorer — analyzes codebase, finds root cause and related files
 * 2. Builder — generates the actual code diff using explorer's context
 * 3. Reviewer — reviews the diff for security, regressions, kernel violations
 *
 * Returns a combined SwarmOutput that source-engine.ts can use directly.
 */
export async function coordinateSourceSwarm(
  tenantId: string,
  task: SourceModRequest,
): Promise<SwarmOutput> {
  const startTime = Date.now();

  logger.info("[SwarmCoordinator] Starting source modification swarm:", {
    tenantId,
    description: task.description.slice(0, 100),
    targetFiles: task.targetFiles,
  });

  // ── Phase 1: Explorer + Builder run in parallel ──
  // Explorer finds context while Builder starts with initial info

  const [explorerResult, builderResult] = await Promise.all([
    runExplorerAgent(task),
    runBuilderAgent(task),
  ]);

  // ── Phase 2: Reviewer checks the generated diff ──
  const reviewResult = await runReviewerAgent(
    task,
    explorerResult,
    builderResult,
  );

  // ── Combine results ──
  const confidence = calculateCombinedConfidence(
    builderResult.confidence,
    reviewResult.securityPassed,
    reviewResult.regressionRisk,
  );

  logger.info("[SwarmCoordinator] Swarm completed:", {
    tenantId,
    durationMs: Date.now() - startTime,
    confidence,
    filesGenerated: builderResult.diff.files.length,
    securityPassed: reviewResult.securityPassed,
  });

  return {
    explorerFindings: explorerResult.findings,
    generatedDiff: builderResult.diff,
    reviewNotes: reviewResult.notes,
    confidence,
  };
}

// ============================================================================
// AGENT: EXPLORER
// ============================================================================

interface ExplorerResult {
  findings: string;
  rootCause: string;
  relatedFiles: string[];
  suggestedApproach: string;
}

async function runExplorerAgent(
  task: SourceModRequest,
): Promise<ExplorerResult> {
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content: `You are a codebase explorer agent in the ExoSkull system (Next.js + Supabase + TypeScript).
Your role: Analyze the task, identify root causes, find related files, and suggest an implementation approach.

Respond with JSON:
{
  "findings": "summary of what you found",
  "rootCause": "root cause analysis",
  "relatedFiles": ["list", "of", "related", "files"],
  "suggestedApproach": "recommended implementation strategy"
}`,
        },
        {
          role: "user",
          content: `Task: ${task.description}
Target files: ${task.targetFiles.join(", ") || "none specified"}
Context: ${task.context || "none"}

Analyze this task and identify the root cause, related files, and best approach.`,
        },
      ],
      {
        taskCategory: "analysis",
        maxTokens: 2000,
        temperature: 0.2,
      },
    );

    const parsed = JSON.parse(
      response.content.replace(/```json?\n?/g, "").replace(/```/g, ""),
    );

    return {
      findings: parsed.findings || "",
      rootCause: parsed.rootCause || "",
      relatedFiles: parsed.relatedFiles || [],
      suggestedApproach: parsed.suggestedApproach || "",
    };
  } catch (error) {
    logger.warn("[SwarmCoordinator:Explorer] Failed:", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      findings: "Explorer agent failed — proceeding with available context",
      rootCause: "unknown",
      relatedFiles: [],
      suggestedApproach: task.description,
    };
  }
}

// ============================================================================
// AGENT: BUILDER
// ============================================================================

interface BuilderResult {
  diff: DiffResult;
  confidence: number;
}

async function runBuilderAgent(task: SourceModRequest): Promise<BuilderResult> {
  try {
    const response = await aiChat(
      [
        {
          role: "system",
          content: `You are a code builder agent in the ExoSkull system (Next.js + Supabase + TypeScript).
Your role: Generate production-quality code modifications.

RULES:
1. Return FULL file contents (not diffs)
2. Follow existing patterns (imports from @/lib/*, Supabase service client, logger)
3. Never use eval, require, process.env, child_process, fs.write
4. Add proper error handling
5. Include TypeScript types

Respond with JSON:
{
  "files": [
    { "path": "relative/path.ts", "action": "create|modify", "content": "full content", "diff": "change summary" }
  ],
  "reasoning": "why these changes",
  "confidence": 0.0-1.0
}`,
        },
        {
          role: "user",
          content: `Task: ${task.description}
Target files: ${task.targetFiles.join(", ") || "auto-detect"}
Context: ${task.context || "none"}

Generate the code modifications.`,
        },
      ],
      {
        taskCategory: "code_generation",
        maxTokens: 8000,
        temperature: 0.1,
      },
    );

    const parsed = JSON.parse(
      response.content.replace(/```json?\n?/g, "").replace(/```/g, ""),
    );

    return {
      diff: {
        files: (parsed.files || []).map((f: Record<string, unknown>) => ({
          path: f.path as string,
          action: (f.action as "create" | "modify" | "delete") || "modify",
          content: (f.content as string) || "",
          diff: f.diff as string | undefined,
        })),
        reasoning: parsed.reasoning || "",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      },
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    };
  } catch (error) {
    logger.error("[SwarmCoordinator:Builder] Failed:", {
      error: error instanceof Error ? error.message : error,
    });
    throw new Error(
      `Builder agent failed: ${error instanceof Error ? error.message : error}`,
    );
  }
}

// ============================================================================
// AGENT: REVIEWER
// ============================================================================

interface ReviewerResult {
  notes: string;
  securityPassed: boolean;
  regressionRisk: "low" | "medium" | "high";
  suggestedFixes: string[];
}

async function runReviewerAgent(
  task: SourceModRequest,
  explorerResult: ExplorerResult,
  builderResult: BuilderResult,
): Promise<ReviewerResult> {
  try {
    const filesSummary = builderResult.diff.files
      .map((f) => `### ${f.path} (${f.action})\n${f.content.slice(0, 3000)}`)
      .join("\n\n");

    const response = await aiChat(
      [
        {
          role: "system",
          content: `You are a security reviewer agent for the ExoSkull system.
Your role: Review generated code for security issues, regressions, and kernel violations.

CHECK FOR:
1. Kernel file modifications (middleware.ts, lib/supabase/*, lib/autonomy/guardian.ts, lib/self-modification/*)
2. Protected patterns (eval, require, process.env, child_process, fs.write, supabase.auth)
3. Breaking changes to existing APIs
4. Missing error handling
5. TypeScript type safety

Respond with JSON:
{
  "notes": "detailed review notes",
  "securityPassed": true/false,
  "regressionRisk": "low|medium|high",
  "suggestedFixes": ["list of suggested fixes if any"]
}`,
        },
        {
          role: "user",
          content: `Task: ${task.description}
Explorer findings: ${explorerResult.findings}

Generated code:
${filesSummary}

Review this code for security, regressions, and correctness.`,
        },
      ],
      {
        taskCategory: "analysis",
        maxTokens: 2000,
        temperature: 0.1,
      },
    );

    const parsed = JSON.parse(
      response.content.replace(/```json?\n?/g, "").replace(/```/g, ""),
    );

    return {
      notes: parsed.notes || "",
      securityPassed: parsed.securityPassed !== false,
      regressionRisk: parsed.regressionRisk || "medium",
      suggestedFixes: parsed.suggestedFixes || [],
    };
  } catch (error) {
    logger.warn("[SwarmCoordinator:Reviewer] Failed:", {
      error: error instanceof Error ? error.message : error,
    });
    // Fail-safe: if reviewer fails, mark as not passing security
    return {
      notes: "Reviewer agent failed — manual review required",
      securityPassed: false,
      regressionRisk: "high",
      suggestedFixes: ["Manual code review required"],
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateCombinedConfidence(
  builderConfidence: number,
  securityPassed: boolean,
  regressionRisk: string,
): number {
  let score = builderConfidence;

  // Security penalty
  if (!securityPassed) score *= 0.3;

  // Regression risk penalty
  if (regressionRisk === "high") score *= 0.5;
  else if (regressionRisk === "medium") score *= 0.7;

  return Math.max(0, Math.min(1, score));
}
