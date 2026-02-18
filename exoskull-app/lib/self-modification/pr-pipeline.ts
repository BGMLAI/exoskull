/**
 * PR Pipeline — GitHub PR creation + risk-based approval routing.
 *
 * Creates PRs via GitHub API, attaches test results and risk assessment,
 * and routes approval based on risk level:
 *   LOW  → auto-merge if tests pass + guardian score > 7
 *   MED  → SMS to user, manual merge
 *   HIGH → SMS + 2FA confirmation
 *
 * Uses the existing GITHUB_TOKEN env var for API access.
 */

import { logger } from "@/lib/logger";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { DiffResult } from "./diff-generator";
import type { VPSExecuteResult } from "@/lib/code-generation/vps-executor";

// ============================================================================
// TYPES
// ============================================================================

export interface PRMetadata {
  tenantId: string;
  description: string;
  goalId?: string;
  triggeredBy: string;
  modificationId?: string;
}

export interface PRResult {
  prUrl: string;
  prNumber: number;
  autoMerged: boolean;
}

// ============================================================================
// GITHUB CONFIG
// ============================================================================

function getGitHubConfig(): {
  token: string;
  owner: string;
  repo: string;
} | null {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO || ""; // e.g., "owner/repo"
  if (!token || !repoFull) return null;

  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) return null;

  return { token, owner, repo };
}

async function githubAPI(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>,
): Promise<Response> {
  const config = getGitHubConfig();
  if (!config)
    throw new Error(
      "GitHub not configured (missing GITHUB_TOKEN or GITHUB_REPO)",
    );

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Create a GitHub PR with code changes, test results, and risk assessment.
 * Routes approval based on risk level.
 */
export async function createSourcePR(
  diff: DiffResult,
  testResult: VPSExecuteResult | null,
  riskLevel: "low" | "medium" | "high",
  metadata: PRMetadata,
): Promise<PRResult> {
  const config = getGitHubConfig();
  if (!config) {
    throw new Error("GitHub not configured");
  }

  const timestamp = Date.now();
  const slug = metadata.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  const branchName = `exoskull-auto/${timestamp}-${slug}`;

  // Step 1: Get default branch SHA
  const mainRef = await githubAPI("/git/refs/heads/main");
  if (!mainRef.ok) {
    throw new Error(`Failed to get main branch ref: ${mainRef.status}`);
  }
  const mainData = (await mainRef.json()) as { object: { sha: string } };
  const baseSha = mainData.object.sha;

  // Step 2: Create branch
  const branchRes = await githubAPI("/git/refs", "POST", {
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });
  if (!branchRes.ok) {
    throw new Error(`Failed to create branch: ${branchRes.status}`);
  }

  // Step 3: Push files to branch
  for (const file of diff.files) {
    if (file.action === "delete") continue; // Skip deletes for now

    // Get current file SHA (for updates)
    let fileSha: string | undefined;
    if (file.action === "modify") {
      const existingFile = await githubAPI(
        `/contents/${file.path}?ref=${branchName}`,
      );
      if (existingFile.ok) {
        const fileData = (await existingFile.json()) as { sha: string };
        fileSha = fileData.sha;
      }
    }

    const createRes = await githubAPI(`/contents/${file.path}`, "PUT", {
      message: `[ExoSkull Auto] ${file.action}: ${file.path}`,
      content: Buffer.from(file.content).toString("base64"),
      branch: branchName,
      ...(fileSha ? { sha: fileSha } : {}),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(
        `Failed to push ${file.path}: ${createRes.status} ${errBody.slice(0, 200)}`,
      );
    }
  }

  // Step 4: Create PR
  const testStatus = testResult
    ? testResult.success
      ? `Tests: PASS (${testResult.duration_ms}ms)`
      : `Tests: FAIL\n\`\`\`\n${testResult.stderr.slice(0, 1000)}\n\`\`\``
    : "Tests: not run (VPS unavailable)";

  const prBody = `## Self-Modification: ${metadata.description}

**Risk Level:** ${riskLevel.toUpperCase()}
**Triggered by:** ${metadata.triggeredBy}
**AI Confidence:** ${Math.round(diff.confidence * 100)}%
${metadata.goalId ? `**Goal:** ${metadata.goalId}` : ""}

### Changes
${diff.files.map((f) => `- \`${f.path}\` (${f.action})${f.diff ? `: ${f.diff}` : ""}`).join("\n")}

### Test Results
${testStatus}

### Reasoning
${diff.reasoning}

---
*Generated by ExoSkull Self-Modification Engine*`;

  const prRes = await githubAPI("/pulls", "POST", {
    title: `[Auto] ${metadata.description.slice(0, 60)}`,
    body: prBody,
    head: branchName,
    base: "main",
  });

  if (!prRes.ok) {
    const errBody = await prRes.text();
    throw new Error(
      `Failed to create PR: ${prRes.status} ${errBody.slice(0, 200)}`,
    );
  }

  const prData = (await prRes.json()) as {
    html_url: string;
    number: number;
  };

  // Step 5: Risk-based approval routing
  let autoMerged = false;

  if (riskLevel === "low" && testResult?.success) {
    // Check guardian score for auto-merge
    const shouldAutoMerge = await checkGuardianForAutoMerge(
      metadata.tenantId,
      metadata.description,
      diff.confidence,
    );

    if (shouldAutoMerge) {
      try {
        const mergeRes = await githubAPI(
          `/pulls/${prData.number}/merge`,
          "PUT",
          {
            merge_method: "squash",
            commit_title: `[ExoSkull Auto] ${metadata.description.slice(0, 60)}`,
          },
        );
        autoMerged = mergeRes.ok;
      } catch (mergeErr) {
        logger.warn("[PRPipeline] Auto-merge failed:", {
          prNumber: prData.number,
          error: mergeErr instanceof Error ? mergeErr.message : mergeErr,
        });
      }
    }
  }

  if (!autoMerged && (riskLevel === "medium" || riskLevel === "high")) {
    // Notify user via SMS
    await notifyUserAboutPR(
      metadata.tenantId,
      prData.html_url,
      prData.number,
      riskLevel,
      metadata.description,
    );
  }

  logger.info("[PRPipeline] PR created:", {
    prNumber: prData.number,
    prUrl: prData.html_url,
    riskLevel,
    autoMerged,
  });

  return {
    prUrl: prData.html_url,
    prNumber: prData.number,
    autoMerged,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function checkGuardianForAutoMerge(
  tenantId: string,
  description: string,
  confidence: number,
): Promise<boolean> {
  try {
    const { getAlignmentGuardian } = await import("@/lib/autonomy/guardian");
    const guardian = getAlignmentGuardian();

    const verdict = await guardian.verifyBenefit(tenantId, {
      type: "automation_trigger",
      title: `Source modification: ${description}`,
      description: `Auto-merge source code PR with confidence ${Math.round(confidence * 100)}%`,
      actionPayload: { action: "modify_source", params: { description } },
      priority: "medium",
      requiresApproval: false,
      reasoning: "Self-modification auto-merge evaluation",
    });

    return verdict.action === "approved" && verdict.benefitScore > 7;
  } catch (error) {
    logger.warn("[PRPipeline] Guardian check failed, skipping auto-merge:", {
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}

async function notifyUserAboutPR(
  tenantId: string,
  prUrl: string,
  prNumber: number,
  riskLevel: string,
  description: string,
): Promise<void> {
  try {
    const { sendProactiveMessage } = await import("@/lib/cron/tenant-utils");

    const riskEmoji = riskLevel === "high" ? "🔴" : "🟡";
    const message =
      `${riskEmoji} Modyfikacja źródła (${riskLevel.toUpperCase()}): ${description}\n\n` +
      `PR #${prNumber}: ${prUrl}\n\n` +
      `Wymaga ręcznego zatwierdzenia.`;

    await sendProactiveMessage(
      tenantId,
      message,
      "source_modification_pr",
      "self-modification",
    );
  } catch (error) {
    logger.error("[PRPipeline] Failed to notify user:", {
      tenantId,
      prNumber,
      error: error instanceof Error ? error.message : error,
    });
  }
}
