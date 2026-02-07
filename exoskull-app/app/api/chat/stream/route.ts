/**
 * POST /api/chat/stream - Streaming chat endpoint (Gateway-integrated)
 *
 * Uses Server-Sent Events to deliver Claude responses.
 * Routes through Unified Message Gateway for FULL AI pipeline (28 tools)
 * instead of raw Anthropic API calls.
 *
 * This gives dashboard users the same capabilities as
 * WhatsApp/Telegram/Slack/Discord users.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleInboundMessage } from "@/lib/gateway/gateway";
import type { GatewayMessage } from "@/lib/gateway/types";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const rateCheck = await checkRateLimit(user.id, "conversations");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: rateCheck.upgradeMessage || "Limit rozmow osiagniety",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // Route through Unified Message Gateway (FULL AI pipeline with 28 tools)
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID immediately
          const sessionId =
            conversationId ||
            `chat-${user.id}-${new Date().toISOString().slice(0, 10)}`;
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

          // Get user email for sender name
          const senderName = user.email || "Dashboard User";

          // Build gateway message
          const gatewayMsg: GatewayMessage = {
            channel: "web_chat",
            tenantId: user.id,
            from: user.id,
            senderName,
            text: message,
            metadata: {
              conversationId,
              source: "dashboard",
              user_email: user.email,
            },
          };

          // Process through full pipeline (28 tools, memory, emotion detection)
          const result = await handleInboundMessage(gatewayMsg);

          // Send response in chunks for smoother UX
          const responseText = result.text;
          const chunkSize = 50; // characters per chunk

          for (let i = 0; i < responseText.length; i += chunkSize) {
            const chunk = responseText.slice(i, i + chunkSize);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: chunk })}\n\n`,
              ),
            );
          }

          // Send completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                fullText: responseText,
                toolsUsed: result.toolsUsed,
              })}\n\n`,
            ),
          );

          incrementUsage(user.id, "conversations").catch((err) => {
            logger.warn(
              "[ChatStream] Usage tracking failed:",
              err instanceof Error ? err.message : String(err),
            );
          });

          controller.close();
        } catch (error) {
          console.error("[Chat Stream] Gateway processing error:", {
            error: error instanceof Error ? error.message : "Unknown error",
            userId: user.id,
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
