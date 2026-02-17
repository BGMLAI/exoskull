/**
 * Code API Routes — file operations, bash, git, search for ExoSkull.
 *
 * All operations are sandboxed to /root/projects/ and related dirs.
 * Auth via VPS_EXECUTOR_SECRET bearer token (same as /execute).
 *
 * Endpoints:
 *   POST /api/code/read   — Read file
 *   POST /api/code/write  — Write/create file
 *   POST /api/code/edit   — Edit file (old_string → new_string)
 *   POST /api/code/bash   — Execute bash command
 *   POST /api/code/glob   — Search files by pattern
 *   POST /api/code/grep   — Search content in files
 *   POST /api/code/git    — Git operations
 *   POST /api/code/tree   — Directory structure
 */

import { Router } from "express";
import {
  readFile,
  writeFile,
  editFile,
  executeBash,
  globFiles,
  grepFiles,
  gitOperation,
  getTree,
} from "../services/code-executor";

const router = Router();

// Rate limiting (simple in-memory)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // per minute
const RATE_WINDOW = 60_000;

function checkRateLimit(_req: unknown): boolean {
  const key = "global"; // Single-user system
  const now = Date.now();
  const entry = requestCounts.get(key);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ============================================================================
// READ FILE
// ============================================================================

router.post("/read", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded (100 req/min)" });
    return;
  }

  const { file_path, offset, limit } = req.body;
  if (!file_path) {
    res.status(400).json({ error: "file_path is required" });
    return;
  }

  try {
    const result = await readFile(file_path, offset, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] read failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// WRITE FILE
// ============================================================================

router.post("/write", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { file_path, content } = req.body;
  if (!file_path || content === undefined) {
    res.status(400).json({ error: "file_path and content are required" });
    return;
  }

  try {
    const result = await writeFile(file_path, content);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] write failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// EDIT FILE
// ============================================================================

router.post("/edit", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { file_path, old_string, new_string, replace_all } = req.body;
  if (!file_path || old_string === undefined || new_string === undefined) {
    res
      .status(400)
      .json({ error: "file_path, old_string, and new_string are required" });
    return;
  }

  try {
    const result = await editFile(file_path, old_string, new_string, replace_all);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] edit failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// BASH COMMAND
// ============================================================================

router.post("/bash", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { command, cwd, timeout_ms } = req.body;
  if (!command) {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const timeout = Math.min(timeout_ms || 30_000, 60_000); // Max 60s

  try {
    const result = await executeBash(command, cwd, timeout);
    res.json({ success: result.exit_code === 0, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] bash failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// GLOB (file search)
// ============================================================================

router.post("/glob", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { pattern, cwd } = req.body;
  if (!pattern) {
    res.status(400).json({ error: "pattern is required" });
    return;
  }

  try {
    const files = await globFiles(pattern, cwd);
    res.json({ success: true, files, count: files.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] glob failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// GREP (content search)
// ============================================================================

router.post("/grep", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { pattern, path: searchPath, ignore_case, max_results } = req.body;
  if (!pattern) {
    res.status(400).json({ error: "pattern is required" });
    return;
  }

  try {
    const result = await grepFiles(pattern, searchPath, {
      ignore_case,
      max_results,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] grep failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// GIT
// ============================================================================

router.post("/git", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { operation, cwd } = req.body;
  if (!operation) {
    res.status(400).json({ error: "operation is required (e.g., 'status', 'diff', 'log --oneline -10')" });
    return;
  }
  if (!cwd) {
    res.status(400).json({ error: "cwd is required (git repo path)" });
    return;
  }

  try {
    const result = await gitOperation(operation, cwd);
    res.json({ success: result.exit_code === 0, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] git failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// TREE (directory structure)
// ============================================================================

router.post("/tree", async (req, res) => {
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  const { path: dirPath, depth } = req.body;

  try {
    const tree = await getTree(dirPath || "/root/projects", depth || 3);
    res.json({ success: true, tree });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[CodeAPI] tree failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

export { router as codeRouter };
