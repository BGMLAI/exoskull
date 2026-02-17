/**
 * Agent Code Routes — SSE streaming agent endpoint for Claude Code.
 *
 * Endpoints:
 *   POST /chat         — Run agent, stream SSE events
 *   POST /workspace/init — Ensure workspace exists
 *   GET  /workspace/tree — File tree for workspace
 */

import { Router, Request, Response } from "express";
import {
  runAgentCode,
  resolveWorkspaceDir,
  ensureWorkspaceDir,
} from "../services/agent-executor";
import { getTree } from "../services/code-executor";
import { readFile } from "../services/code-executor";

const router = Router();

// ============================================================================
// POST /chat — SSE streaming agent
// ============================================================================

router.post("/chat", async (req: Request, res: Response) => {
  const { tenantId, sessionId, message, isAdmin } = req.body;

  if (!tenantId || !message) {
    res.status(400).json({ error: "tenantId and message are required" });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // SSE emit function
  const emit = (event: Record<string, unknown>) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client disconnected
    }
  };

  // Handle client disconnect
  let disconnected = false;
  req.on("close", () => {
    disconnected = true;
  });

  try {
    await runAgentCode(
      {
        tenantId,
        sessionId,
        message,
        isAdmin: isAdmin === true,
      },
      (event) => {
        if (!disconnected) emit(event);
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AgentCode] Chat failed:", msg);
    if (!disconnected) {
      emit({ type: "error", message: msg });
    }
  }

  if (!disconnected) {
    res.end();
  }
});

// ============================================================================
// POST /workspace/init — Ensure workspace directory exists
// ============================================================================

router.post("/workspace/init", async (req: Request, res: Response) => {
  const { tenantId, isAdmin } = req.body;

  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  try {
    const workspaceDir = resolveWorkspaceDir(tenantId, isAdmin === true);
    ensureWorkspaceDir(workspaceDir);
    res.json({ success: true, workspaceDir });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AgentCode] Workspace init failed:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// ============================================================================
// GET /workspace/tree — File tree
// ============================================================================

router.get("/workspace/tree", async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const isAdmin = req.query.isAdmin === "true";
  const subPath = (req.query.path as string) || "";
  const depth = parseInt((req.query.depth as string) || "3", 10);

  if (!tenantId) {
    res.status(400).json({ error: "tenantId query param is required" });
    return;
  }

  try {
    const workspaceDir = resolveWorkspaceDir(tenantId, isAdmin);
    const targetPath = subPath
      ? require("path").join(workspaceDir, subPath)
      : workspaceDir;

    const tree = await getTree(targetPath, depth);
    res.json({ success: true, tree, workspaceDir });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AgentCode] Tree failed:", msg);
    res.status(400).json({ success: false, error: msg });
  }
});

// ============================================================================
// GET /workspace/file — Read file content (for code panel)
// ============================================================================

router.get("/workspace/file", async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const isAdmin = req.query.isAdmin === "true";
  const filePath = req.query.path as string;

  if (!tenantId || !filePath) {
    res.status(400).json({ error: "tenantId and path query params required" });
    return;
  }

  try {
    const workspaceDir = resolveWorkspaceDir(tenantId, isAdmin);
    const fullPath = require("path").join(workspaceDir, filePath);
    const result = await readFile(fullPath);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: msg });
  }
});

export { router as agentCodeRouter };
