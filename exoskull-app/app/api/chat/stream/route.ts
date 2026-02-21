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
import { appendMessage } from "@/lib/unified-thread";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// VPS Proxy Configuration
// ---------------------------------------------------------------------------

const VPS_AGENT_URL = process.env.VPS_AGENT_URL; // e.g. https://agent.exoskull.xyz
const VPS_AGENT_SECRET = process.env.VPS_AGENT_SECRET;
const VPS_TIMEOUT_MS = 3000; // 3s to establish connection (was 5s — too slow)

// ---------------------------------------------------------------------------
// VPS Circuit Breaker (prevents 5s latency spike when VPS is down)
//
// States: CLOSED (normal) → OPEN (skip VPS) → HALF_OPEN (probe 1 request)
// Opens after 3 consecutive failures, probes after 30s, closes on 1 success.
// ---------------------------------------------------------------------------
type CircuitState = "closed" | "open" | "half_open";

const VPS_CB_THRESHOLD = 2; // failures before opening (was 3 — faster fallback)
const VPS_CB_RESET_MS = 60_000; // 60s before half-open probe (was 30s — less re-probing)

const vpsCircuit = {
  state: "closed" as CircuitState,
  failures: 0,
  openedAt: 0,
};

function isVpsCircuitOpen(): boolean {
  if (vpsCircuit.state === "closed") return false;

  if (vpsCircuit.state === "open") {
    // Check if cooldown elapsed → transition to half-open (allow 1 probe)
    if (Date.now() - vpsCircuit.openedAt >= VPS_CB_RESET_MS) {
      vpsCircuit.state = "half_open";
      logger.info("[ChatStream] VPS circuit breaker HALF_OPEN — probing");
      return false; // Allow the probe request through
    }
    return true; // Still in cooldown — skip VPS
  }

  // half_open — allow the probe request
  return false;
}

function recordVpsSuccess(): void {
  if (vpsCircuit.state === "half_open") {
    logger.info("[ChatStream] VPS circuit breaker CLOSED — VPS recovered");
  }
  vpsCircuit.state = "closed";
  vpsCircuit.failures = 0;
  vpsCircuit.openedAt = 0;
}

function recordVpsFailure(): void {
  vpsCircuit.failures++;

  if (vpsCircuit.state === "half_open") {
    // Probe failed — reopen immediately
    vpsCircuit.state = "open";
    vpsCircuit.openedAt = Date.now();
    logger.warn(
      "[ChatStream] VPS circuit breaker OPEN — probe failed, resetting 30s cooldown",
    );
    return;
  }

  if (vpsCircuit.failures >= VPS_CB_THRESHOLD) {
    vpsCircuit.state = "open";
    vpsCircuit.openedAt = Date.now();
    logger.warn(
      `[ChatStream] VPS circuit breaker OPEN after ${vpsCircuit.failures} failures — skipping VPS for 30s`,
    );
  }
}

// ---------------------------------------------------------------------------
// Message Classification — only coding tasks go to VPS
// ---------------------------------------------------------------------------

const CODE_KEYWORDS =
  /\b(kod|code|plik|file|bug|fix|deploy|build|test|commit|push|merge|branch|refactor|implement|endpoint|api|component|function|class|import|export|npm|git|docker|server|database|schema|migration|route|webpack|typescript|javascript|python|css|html|react|next|supabase|vercel|error|stack\s*trace|exception|compile|lint|debug|PR|pull\s*request)\b/i;

const CONVERSATIONAL_PATTERNS =
  /^(hej|hey|hi|hello|cześć|czesc|siema|yo|co tam|jak sytuacja|jak idzie|co słychać|co slychac|dzień dobry|dzien dobry|dobry|dobranoc|dzięki|dzieki|thanks|ok|okej|okay|tak|nie|super|fajnie|git|spoko|no i co|status|jak jest|co nowego|elo|witam|witaj|pozdrawiam|bye|papa|nara|na razie|do zobaczenia).{0,20}$/i;

/**
 * Determine if a message is code-related and should be routed to VPS agent.
 * Conversational messages skip VPS entirely → handled by local gateway (faster).
 */
function isCodeRelatedMessage(message: string): boolean {
  const trimmed = message.trim();

  // Short casual messages → never code
  if (trimmed.length < 40 && CONVERSATIONAL_PATTERNS.test(trimmed)) {
    return false;
  }

  // Contains code keywords → route to VPS
  if (CODE_KEYWORDS.test(trimmed)) {
    return true;
  }

  // Contains code blocks or file paths → route to VPS
  if (
    /```/.test(trimmed) ||
    /\.\w{1,4}$/.test(trimmed) ||
    /\/[\w-]+\//.test(trimmed)
  ) {
    return true;
  }

  // Default: conversational → local gateway
  return false;
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
  if (isVpsCircuitOpen()) {
    logger.debug(
      "[ChatStream] VPS circuit OPEN — skipping proxy, using local fallback",
    );
    return null;
  }

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
// VPS Stream Relay — tee stream to client + capture assistant text for thread
// ---------------------------------------------------------------------------

function relayAndPersistVpsStream(
  vpsResponse: Response,
  tenantId: string,
): Response {
  const reader = vpsResponse.body!.getReader();
  const decoder = new TextDecoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // Stream finished — persist assistant response to unified thread
          if (assistantText) {
            appendMessage(tenantId, {
              role: "assistant",
              content: assistantText,
              channel: "web_chat",
              direction: "outbound",
              source_type: "web_chat",
            }).catch((err) =>
              logger.warn(
                "[ChatStream] VPS assistant thread append failed:",
                err instanceof Error ? err.message : String(err),
              ),
            );
          }
          controller.close();
          return;
        }

        // Pass through to client
        controller.enqueue(value);

        // Parse SSE events to capture fullText from "done" event
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "done" && parsed.fullText) {
                assistantText = parsed.fullText;
              }
            } catch {
              /* not JSON, skip */
            }
          }
        }
      } catch (err) {
        logger.error("[ChatStream] VPS stream relay error:", {
          error: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
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
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("[Chat Stream] Gateway processing error:", {
          error: errMsg,
          tenantId,
        });

        // Classify error for client-side retry logic
        const errorCode = classifyStreamError(errMsg);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Wystapil blad. Sprobuj ponownie.", errorCode })}\n\n`,
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

function classifyStreamError(msg: string): string {
  const lower = msg.toLowerCase();
  if (
    lower.includes("api key") ||
    lower.includes("api_key") ||
    lower.includes("unauthorized") ||
    lower.includes("401")
  )
    return "api_key_missing";
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many")
  )
    return "rate_limited";
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted")
  )
    return "timeout";
  if (
    lower.includes("overloaded") ||
    lower.includes("529") ||
    lower.includes("503")
  )
    return "overloaded";
  return "internal_error";
}

export const POST = withApiLog(async function POST(request: NextRequest) {
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

    // --- Route: coding → VPS, conversational → local gateway ---
    const shouldTryVps = isCodeRelatedMessage(message);
    const vpsResponse = shouldTryVps
      ? await tryVpsProxy(message, tenantId, conversationId)
      : null;

    if (!shouldTryVps) {
      logger.info(
        "[ChatStream] Conversational message — skipping VPS, using local gateway",
      );
    }

    if (vpsResponse) {
      // VPS handled it — persist user message to unified thread for continuity
      // (gateway local path does its own append, but VPS bypasses gateway entirely)
      await appendMessage(tenantId, {
        role: "user",
        content: message,
        channel: "web_chat",
        direction: "inbound",
        source_type: "web_chat",
      }).catch((err) =>
        logger.warn(
          "[ChatStream] VPS user thread append failed:",
          err instanceof Error ? err.message : String(err),
        ),
      );

      incrementUsage(tenantId, "conversations").catch((err) => {
        logger.warn(
          "[ChatStream] Usage tracking failed:",
          err instanceof Error ? err.message : String(err),
        );
      });
      // Relay SSE stream to client + capture assistant text for thread persistence
      return relayAndPersistVpsStream(vpsResponse, tenantId);
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
    logger.error("[Chat Stream] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Failed to start stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
