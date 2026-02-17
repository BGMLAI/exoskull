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
// CIRCUIT BREAKER
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: "closed",
};

const CB_FAILURE_THRESHOLD = 3; // Open after 3 consecutive failures
const CB_RESET_TIMEOUT_MS = 60_000; // Try again after 60 seconds

function checkCircuitBreaker(): { allowed: boolean; reason?: string } {
  if (circuitBreaker.state === "closed") return { allowed: true };

  if (circuitBreaker.state === "open") {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    if (elapsed >= CB_RESET_TIMEOUT_MS) {
      circuitBreaker.state = "half-open";
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Circuit open. ${Math.ceil((CB_RESET_TIMEOUT_MS - elapsed) / 1000)}s until retry.`,
    };
  }

  // half-open: allow one request through
  return { allowed: true };
}

function recordSuccess() {
  circuitBreaker.failures = 0;
  circuitBreaker.state = "closed";
}

function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= CB_FAILURE_THRESHOLD) {
    circuitBreaker.state = "open";
  }
}

/**
 * Get current circuit breaker status for health monitoring.
 */
export function getCircuitBreakerStatus(): {
  state: CircuitBreakerState["state"];
  failures: number;
  lastFailure: number;
  nextRetryIn?: number;
} {
  const result: {
    state: CircuitBreakerState["state"];
    failures: number;
    lastFailure: number;
    nextRetryIn?: number;
  } = {
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    lastFailure: circuitBreaker.lastFailure,
  };

  if (circuitBreaker.state === "open") {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    result.nextRetryIn = Math.max(0, CB_RESET_TIMEOUT_MS - elapsed);
  }

  return result;
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
 * Updates circuit breaker state based on health check result.
 */
export async function isVPSAvailable(): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      recordFailure();
      logger.warn("[VPSExecutor] Health check failed:", {
        status: response.status,
        cbState: circuitBreaker.state,
        cbFailures: circuitBreaker.failures,
      });
      return false;
    }

    const data = (await response.json()) as VPSHealthStatus;
    const healthy = data.status === "ok" && data.docker === "connected";

    if (healthy) {
      recordSuccess();
    } else {
      recordFailure();
      logger.warn("[VPSExecutor] Health check unhealthy:", {
        data,
        cbState: circuitBreaker.state,
        cbFailures: circuitBreaker.failures,
      });
    }

    return healthy;
  } catch (error) {
    recordFailure();
    logger.error("[VPSExecutor] Health check error:", {
      error: error instanceof Error ? error.message : String(error),
      cbState: circuitBreaker.state,
      cbFailures: circuitBreaker.failures,
    });
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
  // ── Circuit breaker check ──
  const cbCheck = checkCircuitBreaker();
  if (!cbCheck.allowed) {
    logger.warn("[VPSExecutor] Circuit breaker OPEN, rejecting request:", {
      reason: cbCheck.reason,
      action: request.action,
      workspaceId: request.workspace_id,
    });
    return {
      success: false,
      job_id: request.workspace_id || "unknown",
      action: request.action,
      duration_ms: 0,
      exit_code: -1,
      stdout: "",
      stderr: `VPS unavailable: ${cbCheck.reason}`,
      error: `VPS unavailable: ${cbCheck.reason}`,
    };
  }

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
      const err = new Error(
        `VPS executor returned ${response.status}: ${errorBody.slice(0, 500)}`,
      );
      recordFailure();
      logger.error("[VPSExecutor] HTTP error, circuit breaker updated:", {
        error: err.message,
        cbState: circuitBreaker.state,
        cbFailures: circuitBreaker.failures,
      });
      throw err;
    }

    const result = (await response.json()) as VPSExecuteResult;

    // Record success — resets circuit breaker
    recordSuccess();

    logger.info("[VPSExecutor] Job complete:", {
      jobId: result.job_id,
      success: result.success,
      exitCode: result.exit_code,
      durationMs: result.duration_ms,
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Record failure for circuit breaker (network/timeout errors)
    // Note: HTTP errors already called recordFailure() above before re-throwing
    const isNetworkOrTimeout =
      errMsg.includes("timeout") ||
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("ENOTFOUND") ||
      errMsg.includes("fetch failed") ||
      errMsg.includes("network");
    if (isNetworkOrTimeout) {
      recordFailure();
    }

    logger.error("[VPSExecutor] Job failed:", {
      error: errMsg,
      cbState: circuitBreaker.state,
      cbFailures: circuitBreaker.failures,
    });

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
