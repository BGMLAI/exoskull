/**
 * POST /api/v3/chat/stream — v3 Streaming chat endpoint
 *
 * Simplified from v1 (648 LOC → ~150 LOC):
 * - Removed: VPS proxy, circuit breaker, code routing, hallucination filtering
 * - Kept: SSE streaming, auth, rate limiting, unified thread persistence
 * - Uses: v3 agent directly
 */

import { NextRequest } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { runV3Agent } from "@/lib/v3/agent";
import { appendMessage } from "@/lib/unified-thread";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ============================================================================
// TOOL LABELS (human-readable tool names for UI)
// ============================================================================

const TOOL_LABELS: Record<string, string> = {
  search_brain: "Przeszukuję pamięć",
  remember: "Zapamiętuję",
  log_note: "Notuję",
  search_web: "Szukam w internecie",
  fetch_url: "Pobieram stronę",
  analyze_image: "Analizuję obraz",
  extract_text_from_image: "Odczytuję tekst z obrazu",
  self_modify: "Modyfikuję kod źródłowy",
  build_app: "Buduję aplikację",
  generate_content: "Generuję treść",
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

// ============================================================================
// SSE STREAM BUILDER
// ============================================================================

function createV3Stream(
  message: string,
  tenantId: string,
  conversationId?: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const sessionId =
          conversationId ||
          `chat-${tenantId}-${new Date().toISOString().slice(0, 10)}`;

        // Session ID
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "session", conversationId: sessionId })}\n\n`,
          ),
        );

        // Processing status
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "status", status: "processing" })}\n\n`,
          ),
        );

        // Persist user message to unified thread
        await appendMessage(tenantId, {
          role: "user",
          content: message,
          channel: "web_chat",
          direction: "inbound",
          source_type: "web_chat",
        }).catch((err) =>
          logger.warn(
            "[v3:Chat] Thread append failed:",
            err instanceof Error ? err.message : String(err),
          ),
        );

        let streamedText = "";

        // Run v3 agent with streaming callbacks
        const result = await runV3Agent({
          tenantId,
          sessionId,
          userMessage: message,
          channel: "web_chat",
          skipThreadAppend: true, // we already appended above
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
                `data: ${JSON.stringify({ type: "tool_end", tool: toolName, durationMs, success: meta?.success })}\n\n`,
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
        });

        // If text wasn't streamed token-by-token, chunk it now
        const responseText = result.text;
        if (!streamedText && responseText) {
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: responseText.slice(i, i + chunkSize) })}\n\n`,
              ),
            );
          }
        }

        // Persist assistant response
        const finalText = streamedText || responseText;
        if (finalText) {
          appendMessage(tenantId, {
            role: "assistant",
            content: finalText,
            channel: "web_chat",
            direction: "outbound",
            source_type: "web_chat",
          }).catch((err) =>
            logger.warn(
              "[v3:Chat] Assistant thread append failed:",
              err instanceof Error ? err.message : String(err),
            ),
          );
        }

        // Done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              fullText: finalText,
              toolsUsed: result.toolsUsed,
            })}\n\n`,
          ),
        );

        controller.close();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error("[v3:Chat] Stream error:", { error: errMsg });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "Wystąpił błąd. Spróbuj ponownie." })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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

    const stream = createV3Stream(message, tenantId, conversationId);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("[v3:Chat] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Failed to start stream" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
