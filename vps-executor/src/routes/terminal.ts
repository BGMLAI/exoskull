/**
 * Terminal WebSocket Server — Interactive PTY sessions on the VPS.
 *
 * Architecture:
 *   POST /api/terminal/session → creates session, returns { sessionId, token, wsUrl }
 *   WebSocket :3501             → client connects with ?token=..., gets PTY I/O
 *
 * Security:
 *   - Bearer auth on session creation (same as code API)
 *   - Single-use tokens with 60s TTL for WebSocket upgrade
 *   - Per-tenant workspace isolation (same as agent-executor)
 *   - Sanitized env (no secrets leaked to PTY)
 *   - Session limits: 30min idle, 2h max, 2 concurrent per tenant
 */

import { Router } from "express";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { v4 as uuid } from "uuid";

// node-pty is a native module — optional require for environments where it's not built
let ptyModule: typeof import("node-pty") | null = null;
try {
  ptyModule = require("node-pty");
} catch {
  console.warn("[Terminal] node-pty not available — terminal sessions disabled");
}

// ============================================================================
// TYPES
// ============================================================================

interface TerminalSession {
  id: string;
  tenantId: string;
  pty: import("node-pty").IPty | null;
  ws: WebSocket | null;
  createdAt: number;
  lastActivity: number;
  isAdmin: boolean;
}

interface PendingToken {
  sessionId: string;
  tenantId: string;
  isAdmin: boolean;
  createdAt: number;
}

// ============================================================================
// STATE
// ============================================================================

const sessions = new Map<string, TerminalSession>();
const pendingTokens = new Map<string, PendingToken>();

// Per-tenant session count
function countTenantSessions(tenantId: string): number {
  let count = 0;
  for (const s of sessions.values()) {
    if (s.tenantId === tenantId) count++;
  }
  return count;
}

// Limits
const MAX_IDLE_MS = 30 * 60 * 1000;    // 30 min
const MAX_SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_PER_TENANT = 2;
const TOKEN_TTL_MS = 60 * 1000;        // 60s

// ============================================================================
// WORKSPACE PATH RESOLUTION (mirrors agent-executor.ts)
// ============================================================================

function getWorkspaceDir(tenantId: string, isAdmin: boolean): string {
  if (isAdmin) return "/root/projects/exoskull";
  return `/root/projects/users/${tenantId}`;
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================

export const terminalRouter = Router();

/**
 * POST /api/terminal/session
 * Body: { tenantId, isAdmin }
 * Returns: { sessionId, token, wsUrl }
 */
terminalRouter.post("/session", (req, res) => {
  if (!ptyModule) {
    res.status(503).json({ error: "Terminal not available (node-pty missing)" });
    return;
  }

  const { tenantId, isAdmin } = req.body as {
    tenantId: string;
    isAdmin: boolean;
  };

  if (!tenantId) {
    res.status(400).json({ error: "Missing tenantId" });
    return;
  }

  // Check concurrent session limit
  if (countTenantSessions(tenantId) >= MAX_PER_TENANT) {
    res.status(429).json({
      error: `Max ${MAX_PER_TENANT} concurrent terminal sessions`,
    });
    return;
  }

  const sessionId = uuid();
  const token = uuid();

  // Store pending token (single-use, 60s TTL)
  pendingTokens.set(token, {
    sessionId,
    tenantId,
    isAdmin: !!isAdmin,
    createdAt: Date.now(),
  });

  const WS_PORT = parseInt(process.env.TERMINAL_WS_PORT || "3501", 10);
  const WS_HOST = process.env.VPS_PUBLIC_HOST || req.hostname;

  res.json({
    sessionId,
    token,
    wsUrl: `ws://${WS_HOST}:${WS_PORT}`,
  });
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

let wss: WebSocketServer | null = null;

/**
 * Initialize the terminal WebSocket server.
 * Call this from server.ts after Express is listening.
 */
export function initTerminalWebSocket(_httpServer?: Server): void {
  if (!ptyModule) {
    console.log("[Terminal] Skipping WebSocket server — node-pty not available");
    return;
  }

  const WS_PORT = parseInt(process.env.TERMINAL_WS_PORT || "3501", 10);

  wss = new WebSocketServer({ port: WS_PORT });
  console.log(`[Terminal] WebSocket server listening on :${WS_PORT}`);

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", `http://localhost:${WS_PORT}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Missing token");
      return;
    }

    // Validate token
    const pending = pendingTokens.get(token);
    if (!pending) {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    // Check TTL
    if (Date.now() - pending.createdAt > TOKEN_TTL_MS) {
      pendingTokens.delete(token);
      ws.close(4001, "Token expired");
      return;
    }

    // Consume token (single-use)
    pendingTokens.delete(token);

    const { sessionId, tenantId, isAdmin } = pending;
    const workspaceDir = getWorkspaceDir(tenantId, isAdmin);

    // Spawn PTY
    const pty = ptyModule!.spawn("bash", [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workspaceDir,
      env: sanitizeEnv(process.env),
    });

    const session: TerminalSession = {
      id: sessionId,
      tenantId,
      pty,
      ws,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isAdmin,
    };

    sessions.set(sessionId, session);
    console.log(
      `[Terminal] Session ${sessionId} started for tenant ${tenantId} in ${workspaceDir}`,
    );

    // PTY → WebSocket (binary data)
    pty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        session.lastActivity = Date.now();
      }
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      console.log(
        `[Terminal] PTY exited (code ${exitCode}) for session ${sessionId}`,
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "exit", code: exitCode }),
        );
        ws.close(1000, "PTY exited");
      }
      sessions.delete(sessionId);
    });

    // WebSocket → PTY
    ws.on("message", (rawData: RawData) => {
      session.lastActivity = Date.now();

      // Try to parse as JSON (for resize commands)
      const data = rawData.toString();
      try {
        const msg = JSON.parse(data);
        if (msg.type === "resize" && msg.cols && msg.rows) {
          pty.resize(
            Math.min(Math.max(msg.cols, 10), 500),
            Math.min(Math.max(msg.rows, 5), 200),
          );
          return;
        }
      } catch {
        // Not JSON — treat as terminal input
      }

      // Forward raw input to PTY
      pty.write(data);
    });

    ws.on("close", () => {
      console.log(`[Terminal] WebSocket closed for session ${sessionId}`);
      pty.kill();
      sessions.delete(sessionId);
    });

    ws.on("error", (err: Error) => {
      console.error(`[Terminal] WebSocket error for ${sessionId}:`, err.message);
      pty.kill();
      sessions.delete(sessionId);
    });
  });

  // ── Cleanup interval ───────────────────────────────────────────────────
  setInterval(() => {
    const now = Date.now();

    // Clean expired tokens
    for (const [token, pending] of pendingTokens) {
      if (now - pending.createdAt > TOKEN_TTL_MS) {
        pendingTokens.delete(token);
      }
    }

    // Clean idle/expired sessions
    for (const [id, session] of sessions) {
      const idle = now - session.lastActivity > MAX_IDLE_MS;
      const expired = now - session.createdAt > MAX_SESSION_MS;

      if (idle || expired) {
        console.log(
          `[Terminal] Cleaning session ${id} (${idle ? "idle" : "expired"})`,
        );
        session.ws?.close(1000, idle ? "Idle timeout" : "Session expired");
        session.pty?.kill();
        sessions.delete(id);
      }
    }
  }, 60_000); // Check every minute
}

// ============================================================================
// ENV SANITIZATION
// ============================================================================

const SECRET_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
];

function sanitizeEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (SECRET_PATTERNS.some((p) => p.test(key))) continue;

    clean[key] = value;
  }

  // Add safe defaults
  clean.TERM = "xterm-256color";
  clean.LANG = "en_US.UTF-8";

  return clean;
}
