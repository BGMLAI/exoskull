/**
 * POST /api/chat/stream - Streaming chat endpoint
 *
 * Architecture:
 *   1. Try VPS Agent Backend (agent.exoskull.xyz) → 46 agents, 49 MCP servers
 *   2. Fallback to local Gateway pipeline → single agent, 28 IORS tools
 *
 * VPS backend handles: routing, multi-agent, MCP tool calls.
 * Vercel acts as auth proxy + SSE relay.
 */
import { NextRequest } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { handleInboundMessage } from "@/lib/gateway/gateway";
import type { GatewayMessage } from "@/lib/gateway/types";
import type { ProcessingCallback } from "@/lib/voice/conversation-handler";
import { getToolLabel } from "@/lib/stream/tool-labels";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// VPS Proxy Configuration
// ---------------------------------------------------------------------------

const VPS_AGENT_URL = process.env.VPS_AGENT_URL; // e.g. https://agent.exoskull.xyz
const VPS_AGENT_SECRET = process.env.VPS_AGENT_SECRET;
const VPS_TIMEOUT_MS = 5000; // 5s to establish connection, then stream

// ---------------------------------------------------------------------------
// VPS Circuit Breaker (prevents 5s latency spike when VPS is down)
// ---------------------------------------------------------------------------
const VPS_CB_THRESHOLD = 3; // failures before opening
const VPS_CB_RESET_MS = 30_000; // 30s before half-open retry
let vpsFailures = 0;
let vpsCircuitOpenAt = 0;

function isVpsCircuitOpen(): boolean {
  if (vpsFailures < VPS_CB_THRESHOLD) return false;
  // Check if reset period has passed (half-open)
  if (Date.now() - vpsCircuitOpenAt >= VPS_CB_RESET_MS) {
    return false; // Allow one probe request
  }
  return true;
}

function recordVpsSuccess(): void {
  vpsFailures = 0;
  vpsCircuitOpenAt = 0;
}

function recordVpsFailure(): void {
  vpsFailures++;
  if (vpsFailures >= VPS_CB_THRESHOLD) {
    vpsCircuitOpenAt = Date.now();
    logger.warn("[ChatStream] VPS circuit breaker OPEN — skipping VPS for 30s");
  }
}

/**
 * Try to proxy the request to the VPS agent backend.
 * Returns a Response with SSE stream, or null if VPS is unavailable.
 */
async function tryVpsProxy(
  message: string,
  tenantId: string,
  conversationId?: string,
): Promise<Response | null> {
  if (!VPS_AGENT_URL || !VPS_AGENT_SECRET) return null;
  if (isVpsCircuitOpen()) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VPS_TIMEOUT_MS);

    const vpsResponse = await fetch(`${VPS_AGENT_URL}/api/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VPS_AGENT_SECRET}`,
      },
      body: JSON.stringify({
        message,
        tenantId,
        conversationId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!vpsResponse.ok) {
      logger.warn("[ChatStream] VPS returned error:", {
        status: vpsResponse.status,
      });
      recordVpsFailure();
      return null;
    }

    if (!vpsResponse.body) {
      logger.warn("[ChatStream] VPS returned no body");
      recordVpsFailure();
      return null;
    }

    recordVpsSuccess();

    // Relay SSE stream from VPS → client (pass-through)
    return new Response(vpsResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    recordVpsFailure();
    // AbortError = timeout, that's expected
    if (msg.includes("abort")) {
      logger.warn("[ChatStream] VPS connection timed out");
    } else {
      logger.warn("[ChatStream] VPS proxy failed:", { error: msg });
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local Fallback (existing gateway pipeline)
// ---------------------------------------------------------------------------

function createLocalStream(
  message: string,
  tenantId: string,
  conversationId?: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Send session ID immediately
        const sessionId =
          conversationId ||
          `chat-${tenantId}-${new Date().toISOString().slice(0, 10)}`;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "session", conversationId: sessionId })}\n\n`,
          ),
        );

        // Send "thinking" indicator
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "status", status: "processing" })}\n\n`,
          ),
        );

        // Build gateway message
        const gatewayMsg: GatewayMessage = {
          channel: "web_chat",
          tenantId,
          from: tenantId,
          senderName: "Dashboard User",
          text: message,
          metadata: {
            conversationId,
            source: "dashboard",
          },
        };

        // Track streamed text to assemble final result
        let streamedText = "";
        let thinkingText = "";

        // Build processing callback to pipe events through SSE
        const processingCallback: ProcessingCallback = {
          onThinkingStep: (step, status) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "thinking_step", step, status })}\n\n`,
              ),
            );
          },
          onToolStart: (toolName) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "tool_start", tool: toolName, label: getToolLabel(toolName) })}\n\n`,
              ),
            );
          },
          onToolEnd: (toolName, durationMs, meta) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_end",
                  tool: toolName,
                  durationMs,
                  success: meta?.success,
                  resultSummary: meta?.resultSummary,
                })}\n\n`,
              ),
            );
          },
          onThinkingToken: (token) => {
            thinkingText += token;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "thinking_token", text: token })}\n\n`,
              ),
            );
          },
          onTextDelta: (delta) => {
            streamedText += delta;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`,
              ),
            );
          },
          onCustomEvent: (event) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          },
        };

        // Process through full pipeline (70+ tools, memory, emotion detection)
        const result = await handleInboundMessage(
          gatewayMsg,
          processingCallback,
        );

        // If text wasn't streamed token-by-token, chunk it now
        const responseText = result.text;
        if (!streamedText && responseText) {
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            const chunk = responseText.slice(i, i + chunkSize);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: chunk })}\n\n`,
              ),
            );
          }
        }

        // Send thinking summary if there was thinking
        if (thinkingText) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "thinking_done", summary: thinkingText.slice(0, 2000) })}\n\n`,
            ),
          );
        }

        // Send completion event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              fullText: streamedText || responseText,
              toolsUsed: result.toolsUsed,
            })}\n\n`,
          ),
        );

        incrementUsage(tenantId, "conversations").catch((err) => {
          logger.warn(
            "[ChatStream] Usage tracking failed:",
            err instanceof Error ? err.message : String(err),
          );
        });

        controller.close();
      } catch (error) {
        console.error("[Chat Stream] Gateway processing error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          tenantId,
          stack: error instanceof Error ? error.stack : undefined,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Wystapil blad. Sprobuj ponownie." })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = await checkRateLimit(tenantId, "conversations");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: rateCheck.upgradeMessage || "Limit rozmow osiagniety",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Try VPS Agent Backend first ---
    const vpsResponse = await tryVpsProxy(message, tenantId, conversationId);

    if (vpsResponse) {
      // VPS handled it — relay SSE stream + track usage
      incrementUsage(tenantId, "conversations").catch((err) => {
        logger.warn(
          "[ChatStream] Usage tracking failed:",
          err instanceof Error ? err.message : String(err),
        );
      });
      return vpsResponse;
    }

    // --- Fallback to local gateway pipeline ---
    logger.info("[ChatStream] VPS unavailable — using local fallback");
    const stream = createLocalStream(message, tenantId, conversationId);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Chat Stream] Error:", error);
    return new Response(JSON.stringify({ error: "Failed to start stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
