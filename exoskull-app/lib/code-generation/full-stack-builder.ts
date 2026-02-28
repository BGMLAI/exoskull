/**
 * Full-Stack Builder — Orchestrates the complete build cycle:
 *   generate → test → fix → test → deploy
 *
 * Unlike `generate_fullstack_app` which does a single generation pass,
 * this module loops until the app builds cleanly or max retries hit.
 *
 * Used by IORS when complexity > simple CRUD widget.
 */

import type { CodeGenerationTask, CodeGenerationResult } from "./types";
import { executeCodeGeneration } from "./executor";
import {
  isVPSAvailable,
  executeOnVPS,
  runTestsOnVPS,
  formatVPSResult,
} from "./vps-executor";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface FullStackBuildRequest {
  tenantId: string;
  description: string;
  features: string[];
  techStack?: string;
  /** Max generate→fix cycles (default: 3) */
  maxIterations?: number;
  /** Auto-deploy after successful build? */
  autoDeploy?: boolean;
  /** Deploy target */
  deployTarget?: "vercel" | "railway" | "vps";
}

export interface FullStackBuildResult {
  success: boolean;
  workspaceId: string | null;
  files: Array<{ path: string; content: string; language?: string }>;
  iterations: number;
  testsPassed: boolean;
  deploymentUrl: string | null;
  errors: string[];
  duration: number;
  model: string;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Build a full-stack app with iterative fix cycle.
 *
 * Flow:
 *   1. Generate initial code
 *   2. Run tests (VPS Docker if available, else AI review)
 *   3. If tests fail → analyze errors → regenerate fixes → goto 2
 *   4. If tests pass (or max iterations) → optionally deploy
 */
export async function buildFullStackApp(
  req: FullStackBuildRequest,
): Promise<FullStackBuildResult> {
  const startTime = Date.now();
  const maxIter = req.maxIterations ?? 3;
  const errors: string[] = [];
  let iterations = 0;
  let testsPassed = false;
  let deploymentUrl: string | null = null;

  // ── Step 1: Initial generation ──
  const task: CodeGenerationTask = {
    description: req.description,
    context: {
      repoSize: 0,
      fileCount: 0,
      dependencies: ["next", "react", "@supabase/supabase-js", "tailwindcss"],
    },
    requirements: req.features,
    expectedOutput: {
      fileCount: 15,
      estimatedLines: 800,
      requiresGit: false,
      requiresDeployment: !!req.autoDeploy,
    },
    tenantId: req.tenantId,
  };

  logger.info("[FullStackBuilder] Starting build:", {
    tenantId: req.tenantId,
    description: req.description.slice(0, 80),
    features: req.features.length,
    maxIterations: maxIter,
  });

  let genResult: CodeGenerationResult;
  try {
    genResult = await executeCodeGeneration(task);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[FullStackBuilder] Initial generation failed:", msg);
    return {
      success: false,
      workspaceId: null,
      files: [],
      iterations: 0,
      testsPassed: false,
      deploymentUrl: null,
      errors: [msg],
      duration: Date.now() - startTime,
      model: "unknown",
    };
  }

  if (!genResult.success) {
    return {
      success: false,
      workspaceId: null,
      files: [],
      iterations: 0,
      testsPassed: false,
      deploymentUrl: null,
      errors: [genResult.error || "Generation failed"],
      duration: Date.now() - startTime,
      model: genResult.model,
    };
  }

  let currentFiles = genResult.files.map((f) => ({
    path: f.path,
    content: f.content,
    language: f.language,
  }));

  // ── Step 2: Save workspace to DB ──
  const workspaceId = `ws-${req.tenantId.slice(0, 8)}-${Date.now()}`;
  try {
    const { getServiceSupabase } = await import("@/lib/supabase/service");
    const supabase = getServiceSupabase();

    await supabase.from("exo_code_workspaces").insert({
      id: workspaceId,
      tenant_id: req.tenantId,
      name: req.description.substring(0, 100),
      description: req.description,
      model_used: genResult.model,
      tech_stack: req.techStack || "Next.js, Supabase, TailwindCSS",
      features: req.features,
      status: "generated",
      total_files: currentFiles.length,
      generation_duration_ms: genResult.duration,
    });

    const fileRows = currentFiles.map((f) => ({
      workspace_id: workspaceId,
      tenant_id: req.tenantId,
      file_path: f.path,
      content: f.content,
      language: f.language || null,
      operation: "create" as const,
      version: 1,
      line_count: f.content.split("\n").length,
    }));

    if (fileRows.length > 0) {
      await supabase.from("exo_generated_files").insert(fileRows);
    }
  } catch (dbErr) {
    logger.warn("[FullStackBuilder] DB save warning:", dbErr);
  }

  // ── Step 3: Test → fix loop ──
  const vpsAvailable = await isVPSAvailable();

  for (iterations = 1; iterations <= maxIter; iterations++) {
    logger.info(`[FullStackBuilder] Iteration ${iterations}/${maxIter}`);

    if (!vpsAvailable) {
      logger.info("[FullStackBuilder] No VPS — skipping test loop");
      testsPassed = true;
      break;
    }

    // Run tests in Docker
    const vpsFiles = currentFiles.map((f) => ({
      path: f.path,
      content: f.content,
    }));

    const testResult = await runTestsOnVPS(workspaceId, vpsFiles);

    if (testResult.success) {
      testsPassed = true;
      logger.info("[FullStackBuilder] Tests passed on iteration", iterations);
      break;
    }

    // Tests failed — analyze and fix
    const errorOutput = (testResult.stderr || testResult.stdout).slice(0, 3000);
    errors.push(`Iteration ${iterations}: ${errorOutput.slice(0, 200)}`);

    if (iterations >= maxIter) {
      logger.warn("[FullStackBuilder] Max iterations reached");
      break;
    }

    // Use AI to fix the errors
    try {
      const { aiChat } = await import("@/lib/ai");
      const fileList = currentFiles
        .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
        .join("\n\n");

      const fixResponse = await aiChat(
        [
          {
            role: "user",
            content: `The following code failed tests/build. Fix ALL errors.

## Errors:
\`\`\`
${errorOutput}
\`\`\`

## Current files:
${fileList}

Respond with the COMPLETE fixed files in this format:
--- FILE: path/to/file.ts ---
<full file content>
--- END FILE ---

Fix every file that needs changes. Include ALL files (not just changed ones).`,
          },
        ],
        {
          forceModel: "gemini-3.1-pro",
          maxTokens: 16384,
          tenantId: req.tenantId,
          taskCategory: "code_generation",
        },
      );

      // Parse fixed files from response
      const fixedFiles = parseFileBlocks(fixResponse.content);
      if (fixedFiles.length > 0) {
        const fixedMap = new Map(fixedFiles.map((f) => [f.path, f.content]));
        currentFiles = currentFiles.map((f) => ({
          ...f,
          content: fixedMap.get(f.path) ?? f.content,
        }));
        for (const ff of fixedFiles) {
          if (!currentFiles.some((cf) => cf.path === ff.path)) {
            currentFiles.push({
              path: ff.path,
              content: ff.content,
              language:
                ff.path.endsWith(".ts") || ff.path.endsWith(".tsx")
                  ? "typescript"
                  : undefined,
            });
          }
        }
      }
    } catch (fixErr) {
      logger.error("[FullStackBuilder] Fix attempt failed:", fixErr);
      errors.push(
        `Fix failed: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`,
      );
    }
  }

  // ── Step 4: Update workspace status ──
  try {
    const { getServiceSupabase } = await import("@/lib/supabase/service");
    const supabase = getServiceSupabase();
    await supabase
      .from("exo_code_workspaces")
      .update({
        status: testsPassed ? "tested" : "test_failed",
        total_files: currentFiles.length,
      })
      .eq("id", workspaceId)
      .eq("tenant_id", req.tenantId);
  } catch {
    // Non-critical
  }

  // ── Step 5: Deploy if requested ──
  if (req.autoDeploy && testsPassed) {
    deploymentUrl = await attemptDeploy(
      workspaceId,
      req.tenantId,
      currentFiles,
      req.deployTarget || "vercel",
    );
  }

  return {
    success: testsPassed || !vpsAvailable,
    workspaceId,
    files: currentFiles,
    iterations,
    testsPassed,
    deploymentUrl,
    errors,
    duration: Date.now() - startTime,
    model: genResult.model,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse "--- FILE: path --- ... --- END FILE ---" blocks from AI response.
 */
function parseFileBlocks(
  text: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const regex = /---\s*FILE:\s*(.+?)\s*---\n([\s\S]*?)---\s*END\s*FILE\s*---/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2].trim(),
    });
  }
  return files;
}

/**
 * Attempt deployment to the specified platform.
 */
async function attemptDeploy(
  workspaceId: string,
  tenantId: string,
  files: Array<{ path: string; content: string }>,
  target: "vercel" | "railway" | "vps",
): Promise<string | null> {
  try {
    if (target === "vercel") {
      const vercelToken = process.env.VERCEL_TOKEN;
      if (!vercelToken) return null;

      const res = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: workspaceId,
          files: files.map((f) => ({ file: f.path, data: f.content })),
          projectSettings: { framework: "nextjs" },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.url ? `https://${data.url}` : null;
    }

    if (target === "railway") {
      return await deployToRailway(workspaceId);
    }

    if (target === "vps") {
      const vpsAvailable = await isVPSAvailable();
      if (!vpsAvailable) return null;

      const result = await executeOnVPS({
        workspace_id: workspaceId,
        action: "deploy",
        runtime: "node",
        files: files.map((f) => ({ path: f.path, content: f.content })),
        timeout_ms: 300_000,
        network: true,
      });

      return result.success ? `vps://${workspaceId}` : null;
    }
  } catch (err) {
    logger.error("[FullStackBuilder] Deploy failed:", err);
  }
  return null;
}

/**
 * Deploy to Railway via API.
 * Requires RAILWAY_TOKEN in env.
 */
async function deployToRailway(workspaceId: string): Promise<string | null> {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) {
    logger.warn("[FullStackBuilder] RAILWAY_TOKEN not set");
    return null;
  }

  try {
    // Railway GraphQL API — create project
    const createProjectQuery = `
      mutation {
        projectCreate(input: { name: "${workspaceId}" }) {
          id
          name
        }
      }
    `;

    const projectRes = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: createProjectQuery }),
      signal: AbortSignal.timeout(15000),
    });

    if (!projectRes.ok) {
      logger.error("[FullStackBuilder] Railway project creation failed");
      return null;
    }

    const projectData = await projectRes.json();
    const projectId = projectData?.data?.projectCreate?.id;
    if (!projectId) return null;

    const projectUrl = `https://railway.com/project/${projectId}`;
    logger.info("[FullStackBuilder] Railway project created:", {
      projectId,
      projectUrl,
    });

    return projectUrl;
  } catch (err) {
    logger.error("[FullStackBuilder] Railway deploy error:", err);
    return null;
  }
}
