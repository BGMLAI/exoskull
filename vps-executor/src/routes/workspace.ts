/**
 * Workspace Routes — Chrome headless browser control via CDP
 *
 * Endpoints:
 *   POST /workspace/create   — Spin up Chrome container
 *   POST /workspace/destroy  — Tear down container
 *   POST /workspace/browser-action — Navigate, click, type, screenshot, etc.
 *   POST /workspace/terminal  — Run shell command in container
 */

import { Router, Request, Response } from "express";
import { execSync, exec } from "child_process";
import { v4 as uuid } from "uuid";

const router = Router();

// Active containers: session_id -> container info
const containers = new Map<
  string,
  { containerId: string; cdpPort: number; createdAt: Date }
>();

const BASE_CDP_PORT = 9222;
let nextPort = BASE_CDP_PORT;

// ============================================================================
// POST /workspace/create — Start Chrome headless container
// ============================================================================

router.post("/create", async (req: Request, res: Response) => {
  const { session_id, tenant_id } = req.body;

  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  // Check if container already exists
  if (containers.has(session_id)) {
    const existing = containers.get(session_id)!;
    return res.json({
      container_id: existing.containerId,
      cdp_endpoint: `ws://localhost:${existing.cdpPort}`,
      status: "existing",
    });
  }

  try {
    const port = nextPort++;
    const containerName = `exo-chrome-${session_id.slice(0, 8)}`;

    // Launch Chrome headless via Docker
    const containerId = execSync(
      `docker run -d --name ${containerName} \
        --memory=512m --cpus=1 \
        -p ${port}:9222 \
        --shm-size=256m \
        chromedp/headless-shell:latest \
        --no-sandbox \
        --disable-gpu \
        --window-size=1280,720 \
        --remote-debugging-address=0.0.0.0 \
        --remote-debugging-port=9222`,
      { encoding: "utf-8" },
    ).trim();

    containers.set(session_id, {
      containerId: containerId.slice(0, 12),
      cdpPort: port,
      createdAt: new Date(),
    });

    // Wait for Chrome to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(
      `[Workspace] Chrome started: ${containerName} on port ${port} for ${tenant_id}`,
    );

    return res.json({
      container_id: containerId.slice(0, 12),
      cdp_endpoint: `ws://localhost:${port}`,
      status: "created",
    });
  } catch (error) {
    console.error("[Workspace] Failed to create Chrome container:", error);
    return res.status(500).json({
      error: `Failed to start Chrome: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

// ============================================================================
// POST /workspace/destroy — Stop and remove container
// ============================================================================

router.post("/destroy", async (req: Request, res: Response) => {
  const { container_id } = req.body;

  if (!container_id) {
    return res.status(400).json({ error: "Missing container_id" });
  }

  try {
    execSync(`docker stop ${container_id} && docker rm ${container_id}`, {
      encoding: "utf-8",
    });

    // Remove from tracking
    for (const [sid, info] of containers.entries()) {
      if (info.containerId === container_id) {
        containers.delete(sid);
        break;
      }
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: `Failed to destroy: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

// ============================================================================
// POST /workspace/browser-action — Execute CDP action
// ============================================================================

router.post("/browser-action", async (req: Request, res: Response) => {
  const { container_id, action } = req.body;

  if (!container_id || !action) {
    return res.status(400).json({ error: "Missing container_id or action" });
  }

  // Find container port
  let cdpPort: number | null = null;
  for (const info of containers.values()) {
    if (info.containerId === container_id) {
      cdpPort = info.cdpPort;
      break;
    }
  }

  if (!cdpPort) {
    return res.status(404).json({ error: "Container not found" });
  }

  try {
    const cdpUrl = `http://localhost:${cdpPort}`;

    // Get active page via CDP JSON API
    const pagesRes = await fetch(`${cdpUrl}/json`);
    const pages = (await pagesRes.json()) as Array<{
      id: string;
      url: string;
      title: string;
      webSocketDebuggerUrl: string;
    }>;
    const page = pages[0];

    if (!page) {
      return res.status(500).json({ error: "No browser page found" });
    }

    // Execute action via CDP WebSocket
    const result = await executeCDPAction(
      page.webSocketDebuggerUrl,
      action,
    );

    return res.json({
      success: true,
      url: result.url || page.url,
      title: result.title || page.title,
      content: result.content,
      screenshot_url: result.screenshotBase64
        ? `data:image/png;base64,${result.screenshotBase64}`
        : undefined,
    });
  } catch (error) {
    console.error("[Workspace] Browser action failed:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// POST /workspace/terminal — Run command in container
// ============================================================================

router.post("/terminal", async (req: Request, res: Response) => {
  const { container_id, command, timeout_ms = 30000 } = req.body;

  if (!container_id || !command) {
    return res.status(400).json({ error: "Missing container_id or command" });
  }

  try {
    const stdout = execSync(
      `docker exec ${container_id} sh -c "${command.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: timeout_ms },
    );

    return res.json({ stdout, stderr: "", exit_code: 0 });
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return res.json({
      stdout: execError.stdout || "",
      stderr: execError.stderr || (error instanceof Error ? error.message : ""),
      exit_code: execError.status || 1,
    });
  }
});

// ============================================================================
// CDP WebSocket Action Executor
// ============================================================================

interface CDPResult {
  url?: string;
  title?: string;
  content?: string;
  screenshotBase64?: string;
}

async function executeCDPAction(
  wsUrl: string,
  action: { type: string; target?: string; value?: string },
): Promise<CDPResult> {
  // Use simple HTTP-based CDP protocol for reliability
  // (WebSocket-based CDP is more complex but supports streaming)
  const WebSocket = (await import("ws")).default;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map<number, (result: unknown) => void>();

    function send(method: string, params?: Record<string, unknown>): Promise<unknown> {
      return new Promise((res) => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg.result);
        pending.delete(msg.id);
      }
    });

    ws.on("open", async () => {
      try {
        let result: CDPResult = {};

        switch (action.type) {
          case "navigate":
            await send("Page.navigate", { url: action.target });
            // Wait for load
            await new Promise((r) => setTimeout(r, 2000));
            break;

          case "click":
            if (action.target) {
              await send("Runtime.evaluate", {
                expression: `document.querySelector('${action.target}')?.click()`,
              });
              await new Promise((r) => setTimeout(r, 500));
            }
            break;

          case "type":
            if (action.target && action.value) {
              await send("Runtime.evaluate", {
                expression: `(() => { const el = document.querySelector('${action.target}'); if(el) { el.focus(); el.value = '${action.value.replace(/'/g, "\\'")}'; el.dispatchEvent(new Event('input', {bubbles:true})); } })()`,
              });
            }
            break;

          case "scroll":
            await send("Runtime.evaluate", {
              expression: `window.scrollBy(0, ${action.value || 500})`,
            });
            break;

          case "evaluate":
            if (action.value) {
              const evalResult = (await send("Runtime.evaluate", {
                expression: action.value,
                returnByValue: true,
              })) as { result?: { value?: unknown } };
              result.content = JSON.stringify(evalResult?.result?.value);
            }
            break;

          case "back":
            await send("Runtime.evaluate", {
              expression: "history.back()",
            });
            await new Promise((r) => setTimeout(r, 1000));
            break;

          case "forward":
            await send("Runtime.evaluate", {
              expression: "history.forward()",
            });
            await new Promise((r) => setTimeout(r, 1000));
            break;

          case "refresh":
            await send("Page.reload");
            await new Promise((r) => setTimeout(r, 2000));
            break;
        }

        // Always get current URL and title after action
        const urlResult = (await send("Runtime.evaluate", {
          expression: "document.location.href",
          returnByValue: true,
        })) as { result?: { value?: string } };
        result.url = urlResult?.result?.value;

        const titleResult = (await send("Runtime.evaluate", {
          expression: "document.title",
          returnByValue: true,
        })) as { result?: { value?: string } };
        result.title = titleResult?.result?.value;

        // Take screenshot
        if (action.type === "screenshot" || action.type === "navigate") {
          const ssResult = (await send("Page.captureScreenshot", {
            format: "png",
            quality: 80,
          })) as { data?: string };
          result.screenshotBase64 = ssResult?.data;
        }

        ws.close();
        resolve(result);
      } catch (err) {
        ws.close();
        reject(err);
      }
    });

    ws.on("error", reject);
    setTimeout(() => {
      ws.close();
      reject(new Error("CDP timeout"));
    }, 15000);
  });
}

// ============================================================================
// Cleanup stale containers (>1hr)
// ============================================================================

setInterval(
  () => {
    const now = new Date();
    for (const [sid, info] of containers.entries()) {
      const age = now.getTime() - info.createdAt.getTime();
      if (age > 60 * 60 * 1000) {
        try {
          execSync(
            `docker stop ${info.containerId} && docker rm ${info.containerId}`,
          );
          containers.delete(sid);
          console.log(
            `[Workspace] Cleaned up stale container: ${info.containerId}`,
          );
        } catch {
          // Container may already be gone
          containers.delete(sid);
        }
      }
    }
  },
  5 * 60 * 1000,
); // Every 5 min

export { router as workspaceRouter };
