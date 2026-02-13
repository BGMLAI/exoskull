/**
 * VPS Executor Client — calls the remote VPS executor service.
 *
 * Used by IORS tools to run code in sandboxed Docker containers:
 * - test, lint, typecheck, build, deploy, run
 *
 * The VPS executor runs on a DigitalOcean droplet and accepts
 * files via JSON API, runs them in Docker, returns results.
 *
 * Env:
 *   VPS_EXECUTOR_URL    — e.g., http://123.45.67.89:3500
 *   VPS_EXECUTOR_SECRET — bearer token for auth
 */

import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type VPSAction =
  | "test"
  | "lint"
  | "typecheck"
  | "build"
  | "deploy"
  | "run";
export type VPSRuntime = "node" | "python";

export interface VPSExecuteRequest {
  workspace_id?: string;
  action: VPSAction;
  runtime: VPSRuntime;
  files: Array<{ path: string; content: string }>;
  entrypoint?: string;
  command?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
  network?: boolean;
}

export interface VPSExecuteResult {
  success: boolean;
  job_id: string;
  action: string;
  duration_ms: number;
  exit_code: number;
  stdout: string;
  stderr: string;
  files_output?: Array<{ path: string; content: string }>;
  error?: string;
}

export interface VPSHealthStatus {
  status: "ok" | "error";
  version?: string;
  uptime?: number;
  docker?: string;
}

// ============================================================================
// CLIENT
// ============================================================================

function getConfig(): { url: string; secret: string } | null {
  const url = process.env.VPS_EXECUTOR_URL;
  const secret = process.env.VPS_EXECUTOR_SECRET;

  if (!url || !secret) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), secret };
}

/**
 * Check if VPS executor is configured and available.
 */
export async function isVPSAvailable(): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return false;

    const data = (await response.json()) as VPSHealthStatus;
    return data.status === "ok" && data.docker === "connected";
  } catch {
    return false;
  }
}

/**
 * Execute code on the VPS executor.
 *
 * @param request — files + action to run
 * @returns Execution result with stdout/stderr/exit code
 * @throws Error if VPS is not configured or request fails
 */
export async function executeOnVPS(
  request: VPSExecuteRequest,
): Promise<VPSExecuteResult> {
  const config = getConfig();
  if (!config) {
    throw new Error(
      "VPS executor not configured. Set VPS_EXECUTOR_URL and VPS_EXECUTOR_SECRET in .env",
    );
  }

  const timeoutMs = request.timeout_ms || 120_000; // 2min default

  logger.info("[VPSExecutor] Sending job:", {
    action: request.action,
    runtime: request.runtime,
    fileCount: request.files.length,
    workspaceId: request.workspace_id,
  });

  try {
    const response = await fetch(`${config.url}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs + 10_000), // Extra 10s for network
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `VPS executor returned ${response.status}: ${errorBody.slice(0, 500)}`,
      );
    }

    const result = (await response.json()) as VPSExecuteResult;

    logger.info("[VPSExecutor] Job complete:", {
      jobId: result.job_id,
      success: result.success,
      exitCode: result.exit_code,
      durationMs: result.duration_ms,
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[VPSExecutor] Job failed:", { error: errMsg });

    // Return structured error (don't throw — let caller handle)
    return {
      success: false,
      job_id: request.workspace_id || "unknown",
      action: request.action,
      duration_ms: 0,
      exit_code: -1,
      stdout: "",
      stderr: errMsg,
      error: errMsg,
    };
  }
}

/**
 * Convenience: run tests on workspace files.
 */
export async function runTestsOnVPS(
  workspaceId: string,
  files: Array<{ path: string; content: string }>,
  runtime: VPSRuntime = "node",
): Promise<VPSExecuteResult> {
  return executeOnVPS({
    workspace_id: workspaceId,
    action: "test",
    runtime,
    files,
    timeout_ms: 120_000,
    network: true, // Tests might need to fetch dependencies
  });
}

/**
 * Convenience: typecheck workspace files.
 */
export async function typecheckOnVPS(
  workspaceId: string,
  files: Array<{ path: string; content: string }>,
): Promise<VPSExecuteResult> {
  return executeOnVPS({
    workspace_id: workspaceId,
    action: "typecheck",
    runtime: "node",
    files,
    timeout_ms: 60_000,
    network: true,
  });
}

/**
 * Convenience: build and deploy workspace.
 */
export async function buildAndDeployOnVPS(
  workspaceId: string,
  files: Array<{ path: string; content: string }>,
  runtime: VPSRuntime = "node",
): Promise<VPSExecuteResult> {
  return executeOnVPS({
    workspace_id: workspaceId,
    action: "deploy",
    runtime,
    files,
    timeout_ms: 300_000, // 5min for full build+deploy
    network: true,
  });
}

/**
 * Format VPS result as human-readable string for IORS response.
 */
export function formatVPSResult(result: VPSExecuteResult): string {
  const parts: string[] = [];

  const statusEmoji = result.success ? "✅" : "❌";
  parts.push(`${statusEmoji} **${result.action}** (${result.duration_ms}ms)`);

  if (result.stdout.trim()) {
    const stdout = result.stdout.trim().slice(0, 3000);
    parts.push(`\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``);
  }

  if (!result.success && result.stderr.trim()) {
    const stderr = result.stderr.trim().slice(0, 2000);
    parts.push(`\n**Errors:**\n\`\`\`\n${stderr}\n\`\`\``);
  }

  if (result.files_output && result.files_output.length > 0) {
    parts.push(
      `\n**Output files:** ${result.files_output.map((f) => f.path).join(", ")}`,
    );
  }

  return parts.join("\n");
}
