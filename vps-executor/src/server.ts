/**
 * ExoSkull VPS Executor Server
 *
 * Receives code from ExoSkull → runs in Docker containers → returns results.
 * Designed to run on a DigitalOcean droplet (~$12/mo).
 *
 * Endpoints:
 *   POST /execute  — Run code in sandboxed Docker container
 *   GET  /health   — Health check
 *   GET  /jobs/:id — Check job status (for async jobs)
 *
 * Auth: Bearer token (VPS_EXECUTOR_SECRET)
 */

import express from "express";
import { DockerRunner } from "./docker-runner";
import { codeRouter } from "./routes/code";
import { v4 as uuid } from "uuid";

const app = express();
const PORT = parseInt(process.env.PORT || "3500", 10);
const SECRET = process.env.VPS_EXECUTOR_SECRET || "dev-secret-change-me";
const MAX_BODY_SIZE = "50mb";

app.use(express.json({ limit: MAX_BODY_SIZE }));

// ============================================================================
// TYPES
// ============================================================================

interface ExecuteRequest {
  workspace_id?: string;
  action: "test" | "lint" | "typecheck" | "build" | "deploy" | "run";
  runtime: "node" | "python";
  files: Array<{ path: string; content: string }>;
  entrypoint?: string;
  command?: string; // Custom command override
  timeout_ms?: number; // Max execution time (default: 60000)
  env?: Record<string, string>; // Environment variables
  network?: boolean; // Allow outbound network (default: false)
}

interface ExecuteResponse {
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

// In-memory job store for async operations
const jobStore = new Map<
  string,
  { status: "running" | "completed" | "failed"; result?: ExecuteResponse }
>();

const runner = new DockerRunner();

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const auth = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  if (!auth || auth !== `Bearer ${SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ============================================================================
// ROUTES
// ============================================================================

// Code API routes (file operations, bash, git, search)
app.use("/api/code", authenticate, codeRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: process.uptime(),
    docker: runner.isAvailable() ? "connected" : "disconnected",
  });
});

/**
 * POST /execute — Run code in Docker container
 */
app.post("/execute", authenticate, async (req, res) => {
  const body = req.body as ExecuteRequest;

  // Validate
  if (!body.action || !body.files || !Array.isArray(body.files)) {
    res.status(400).json({
      error: "Missing required fields: action, files",
    });
    return;
  }

  if (body.files.length === 0) {
    res.status(400).json({ error: "No files provided" });
    return;
  }

  if (body.files.length > 100) {
    res.status(400).json({ error: "Too many files (max 100)" });
    return;
  }

  const runtime = body.runtime || "node";
  if (!["node", "python"].includes(runtime)) {
    res.status(400).json({ error: "Unsupported runtime. Use: node, python" });
    return;
  }

  const jobId = body.workspace_id || uuid();
  const timeoutMs = Math.min(body.timeout_ms || 60_000, 300_000); // Max 5 min

  console.log(`[Executor] Job ${jobId}: ${body.action} (${runtime}, ${body.files.length} files, timeout ${timeoutMs}ms)`);

  jobStore.set(jobId, { status: "running" });

  const start = Date.now();

  try {
    const result = await runner.execute({
      jobId,
      action: body.action,
      runtime,
      files: body.files,
      entrypoint: body.entrypoint,
      command: body.command,
      timeoutMs,
      env: body.env,
      network: body.network ?? false,
    });

    const response: ExecuteResponse = {
      success: result.exitCode === 0,
      job_id: jobId,
      action: body.action,
      duration_ms: Date.now() - start,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      files_output: result.outputFiles,
      error: result.exitCode !== 0 ? result.stderr.slice(0, 2000) : undefined,
    };

    jobStore.set(jobId, { status: "completed", result: response });
    res.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Executor] Job ${jobId} FAILED:`, errMsg);

    const response: ExecuteResponse = {
      success: false,
      job_id: jobId,
      action: body.action,
      duration_ms: Date.now() - start,
      exit_code: -1,
      stdout: "",
      stderr: errMsg,
      error: errMsg,
    };

    jobStore.set(jobId, { status: "failed", result: response });
    res.status(500).json(response);
  }
});

/**
 * GET /jobs/:id — Check job status
 */
app.get("/jobs/:id", authenticate, (req, res) => {
  const job = jobStore.get(req.params.id as string);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// ============================================================================
// CLEANUP — Evict old jobs every 10 min
// ============================================================================

setInterval(() => {
  if (jobStore.size > 1000) {
    const toDelete = jobStore.size - 500;
    const keys = Array.from(jobStore.keys()).slice(0, toDelete);
    for (const key of keys) {
      jobStore.delete(key);
    }
    console.log(`[Executor] Cleaned up ${toDelete} old jobs`);
  }
}, 10 * 60 * 1000);

// ============================================================================
// START
// ============================================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ExoSkull VPS Executor] Running on port ${PORT}`);
  console.log(`[ExoSkull VPS Executor] Docker: ${runner.isAvailable() ? "connected" : "NOT connected"}`);
});
