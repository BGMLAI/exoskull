/**
 * POST /api/chat/stream — v3 Streaming chat endpoint
 *
 * v3 simplification: direct v3 agent call with SSE streaming.
 * No VPS proxy, no circuit breaker, no code routing.
 */

import { NextRequest } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { runV3Agent } from "@/lib/v3/agent";
import { classifyQuery, handleSimpleQuery } from "@/lib/v3/gemini-router";
import { appendMessage } from "@/lib/unified-thread";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  // Phase 2+
  import_document: "Importuję dokument",
  list_documents: "Pobieram listę dokumentów",
  get_document_content: "Czytam dokument",
  analyze_knowledge: "Analizuję wiedzę",
  // Phase 3+
  create_op: "Tworzę zadanie",
  list_ops: "Pobieram zadania",
  update_op_status: "Aktualizuję zadanie",
  create_quest: "Tworzę quest",
  create_goal: "Tworzę cel",
  decompose_goal: "Rozkładam cel na zadania",
  check_goals: "Sprawdzam cele",
  log_mood: "Loguję nastrój",
  log_data: "Loguję dane",
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

// ============================================================================
// SSE STREAM BUILDER
// ============================================================================

function createStream(
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

        // ── Smart Routing: simple queries → Gemini Flash (<1s) ──
        const complexity = classifyQuery(message);
        logger.info("[v3:Chat] Query classified", {
          complexity,
          messageLength: message.length,
        });

        if (complexity === "simple") {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "thinking_step", step: "Szybka odpowiedź...", status: "done" })}\n\n`,
            ),
          );

          const geminiResponse = await handleSimpleQuery(message);
          if (geminiResponse) {
            // Stream Gemini response in chunks
            const chunkSize = 50;
            for (let i = 0; i < geminiResponse.length; i += chunkSize) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "delta", text: geminiResponse.slice(i, i + chunkSize) })}\n\n`,
                ),
              );
            }

            // Persist assistant response
            appendMessage(tenantId, {
              role: "assistant",
              content: geminiResponse,
              channel: "web_chat",
              direction: "outbound",
              source_type: "web_chat",
            }).catch((err) =>
              logger.warn(
                "[v3:Chat] Gemini thread append failed:",
                err instanceof Error ? err.message : String(err),
              ),
            );

            // Done
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "done",
                  fullText: geminiResponse,
                  toolsUsed: [],
                })}\n\n`,
              ),
            );

            controller.close();
            return;
          }

          // Gemini failed → fall through to Claude
          logger.info("[v3:Chat] Gemini Flash failed, falling back to Claude");
        }

        let streamedText = "";

        // Run v3 agent with streaming callbacks (complex queries or Gemini fallback)
        const result = await runV3Agent({
          tenantId,
          sessionId,
          userMessage: message,
          channel: "web_chat",
          skipThreadAppend: true,
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
                `data: ${JSON.stringify({ type: "tool_end", tool: toolName, durationMs, success: meta?.success, resultSummary: meta?.resultSummary?.slice(0, 100) })}\n\n`,
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

        // If text wasn't streamed, chunk it now
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

    const stream = createStream(message, tenantId, conversationId);

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
