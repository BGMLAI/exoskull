/**
 * Source Engine — Orchestrator for self-modification pipeline.
 *
 * Main entry point for source code modifications. Coordinates:
 * 1. Kernel Guard check (hard block on protected files)
 * 2. AI diff generation (or swarm result for complex tasks)
 * 3. Static analysis + protected pattern validation
 * 4. Sandboxed testing on VPS
 * 5. GitHub PR creation
 * 6. Risk-based approval routing
 *
 * Called by: Ralph Loop, Strategy Engine, MAPE-K, user request.
 *
 * Rate limit: max 5 source modifications per day per tenant.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  checkFiles,
  validateGeneratedCode,
  getOverallRisk,
} from "./kernel-guard";
import { generateDiff, type DiffResult } from "./diff-generator";
import { createSourcePR } from "./pr-pipeline";
import {
  executeOnVPS,
  isVPSAvailable,
  type VPSExecuteResult,
} from "@/lib/code-generation/vps-executor";

// ============================================================================
// TYPES
// ============================================================================

export interface SourceModRequest {
  description: string;
  targetFiles: string[];
  context?: string;
  triggeredBy:
    | "ralph_loop"
    | "strategy_engine"
    | "mape_k"
    | "self_optimization"
    | "user_request";
  goalId?: string;
  swarmResult?: SwarmOutput;
}

export interface SwarmOutput {
  explorerFindings: string;
  generatedDiff: DiffResult;
  reviewNotes: string;
  confidence: number;
}

export interface SourceModResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  riskLevel: "low" | "medium" | "high";
  testsPassed: boolean;
  blockedReason?: string;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_DAILY_MODIFICATIONS = 5;

// ============================================================================
// MAIN
// ============================================================================

/**
 * Execute a source code modification through the full pipeline.
 *
 * Flow:
 * 1. Rate limit check
 * 2. Kernel Guard → hard block if any target is protected
 * 3. Generate diff (AI or swarm result)
 * 4. Validate generated code (static analysis + protected patterns)
 * 5. Test on VPS (clone → apply → typecheck → test → build)
 * 6. Create GitHub PR with risk assessment
 * 7. Risk-based approval routing
 * 8. Log to exo_source_modifications
 */
export async function modifySource(
  tenantId: string,
  request: SourceModRequest,
): Promise<SourceModResult> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // Create initial log entry
  const { data: modEntry } = await supabase
    .from("exo_source_modifications")
    .insert({
      tenant_id: tenantId,
      description: request.description,
      target_files: request.targetFiles,
      risk_level: "low", // Will be updated
      triggered_by: request.triggeredBy,
      goal_id: request.goalId || null,
      status: "pending",
    })
    .select("id")
    .single();

  const modId = modEntry?.id;

  try {
    // ── Step 1: Rate limit ──
    const todayCount = await getDailyModCount(tenantId);
    if (todayCount >= MAX_DAILY_MODIFICATIONS) {
      const reason = `Rate limit: ${todayCount}/${MAX_DAILY_MODIFICATIONS} modifications today`;
      await updateModStatus(modId, "blocked", { error_message: reason });
      return {
        success: false,
        riskLevel: "low",
        testsPassed: false,
        blockedReason: reason,
      };
    }

    // ── Step 2: Kernel Guard ──
    if (request.targetFiles.length > 0) {
      const guard = checkFiles(request.targetFiles);
      if (!guard.allowed) {
        const reason = `Kernel guard blocked: ${guard.blockedFiles.join(", ")}`;
        logger.warn("[SourceEngine] Kernel guard blocked modification:", {
          tenantId,
          blockedFiles: guard.blockedFiles,
        });
        await updateModStatus(modId, "blocked", { error_message: reason });
        return {
          success: false,
          riskLevel: "low",
          testsPassed: false,
          blockedReason: reason,
        };
      }
    }

    // ── Step 3: Generate diff ──
    await updateModStatus(modId, "testing");

    let diff: DiffResult;

    if (request.swarmResult) {
      // Use pre-computed swarm result
      diff = request.swarmResult.generatedDiff;
    } else {
      // Read target file contents for context
      const targetFileContents = await readTargetFiles(request.targetFiles);
      const relatedFiles = await findRelatedFiles(
        request.targetFiles,
        request.context,
      );

      diff = await generateDiff({
        description: request.description,
        targetFiles: targetFileContents,
        relatedFiles,
        previousAttempts: [],
      });
    }

    // ── Step 4: Validate generated code ──
    for (const file of diff.files) {
      if (file.action === "delete") continue;

      // Check if generated file targets a kernel path
      if (checkFiles([file.path]).blockedFiles.length > 0) {
        const reason = `Generated diff targets kernel file: ${file.path}`;
        await updateModStatus(modId, "blocked", { error_message: reason });
        return {
          success: false,
          riskLevel: "low",
          testsPassed: false,
          blockedReason: reason,
        };
      }

      // Check for protected patterns
      const validation = validateGeneratedCode(file.content);
      if (!validation.safe) {
        const reason = `Protected pattern violations in ${file.path}: ${validation.violations.join(", ")}`;
        logger.warn("[SourceEngine] Code validation failed:", {
          file: file.path,
          violations: validation.violations,
        });
        await updateModStatus(modId, "failed", { error_message: reason });
        return {
          success: false,
          riskLevel: "low",
          testsPassed: false,
          error: reason,
        };
      }
    }

    // ── Step 5: Calculate risk level ──
    const allPaths = diff.files.map((f) => f.path);
    const riskLevel = getOverallRisk(allPaths);

    if (riskLevel === "kernel") {
      const reason = "Generated files include kernel-protected paths";
      await updateModStatus(modId, "blocked", { error_message: reason });
      return {
        success: false,
        riskLevel: "low",
        testsPassed: false,
        blockedReason: reason,
      };
    }

    await updateModStatus(modId, "testing", { risk_level: riskLevel });

    // ── Step 6: Test on VPS ──
    let testResult: VPSExecuteResult | null = null;
    let testsPassed = false;

    const vpsAvailable = await isVPSAvailable();
    if (vpsAvailable) {
      testResult = await executeOnVPS({
        workspace_id: `selfmod_${modId || Date.now()}`,
        action: "typecheck",
        runtime: "node",
        files: diff.files
          .filter((f) => f.action !== "delete")
          .map((f) => ({ path: f.path, content: f.content })),
        timeout_ms: 120_000,
        network: true,
      });
      testsPassed = testResult.success;
    } else {
      logger.warn("[SourceEngine] VPS unavailable, skipping sandboxed tests");
      // If VPS is down, only allow low-risk auto-merge
      testsPassed = false;
    }

    // ── Step 7: Create GitHub PR ──
    const prResult = await createSourcePR(diff, testResult, riskLevel, {
      tenantId,
      description: request.description,
      goalId: request.goalId,
      triggeredBy: request.triggeredBy,
      modificationId: modId,
    });

    // ── Step 8: Log result ──
    await updateModStatus(
      modId,
      prResult.autoMerged ? "merged" : "pr_created",
      {
        pr_url: prResult.prUrl,
        pr_number: prResult.prNumber,
        test_passed: testsPassed,
        auto_merged: prResult.autoMerged,
        ai_confidence: diff.confidence,
        risk_level: riskLevel,
        diff_summary: diff.reasoning.slice(0, 500),
        ...(prResult.autoMerged ? { merged_at: new Date().toISOString() } : {}),
      },
    );

    logger.info("[SourceEngine] Modification completed:", {
      tenantId,
      modId,
      prNumber: prResult.prNumber,
      riskLevel,
      testsPassed,
      autoMerged: prResult.autoMerged,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      prUrl: prResult.prUrl,
      prNumber: prResult.prNumber,
      riskLevel,
      testsPassed,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    logger.error("[SourceEngine] Modification failed:", {
      tenantId,
      modId,
      error: errMsg,
      durationMs: Date.now() - startTime,
    });

    await updateModStatus(modId, "failed", { error_message: errMsg });

    return {
      success: false,
      riskLevel: "low",
      testsPassed: false,
      error: errMsg,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getDailyModCount(tenantId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";

  const { count } = await supabase
    .from("exo_source_modifications")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", todayStart);

  return count || 0;
}

async function updateModStatus(
  modId: string | undefined,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!modId) return;

  const supabase = getServiceSupabase();
  await supabase
    .from("exo_source_modifications")
    .update({ status, ...extra })
    .eq("id", modId);
}

async function readTargetFiles(
  filePaths: string[],
): Promise<Array<{ path: string; currentContent: string }>> {
  // Read files from the repo via GitHub API (or local filesystem in dev)
  const results: Array<{ path: string; currentContent: string }> = [];

  for (const filePath of filePaths.slice(0, 5)) {
    try {
      const config = getGitHubConfig();
      if (config) {
        const res = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`,
          {
            headers: {
              Authorization: `Bearer ${config.token}`,
              Accept: "application/vnd.github.v3.raw",
            },
          },
        );

        if (res.ok) {
          const content = await res.text();
          results.push({ path: filePath, currentContent: content });
        }
      }
    } catch {
      // Skip files we can't read
    }
  }

  return results;
}

async function findRelatedFiles(
  targetPaths: string[],
  context?: string,
): Promise<Array<{ path: string; content: string }>> {
  // For now, return empty — the AI will work with target files + description.
  // Future: parse imports from target files, fetch them from GitHub.
  return [];
}

function getGitHubConfig(): {
  token: string;
  owner: string;
  repo: string;
} | null {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO || "";
  if (!token || !repoFull) return null;

  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) return null;

  return { token, owner, repo };
}
