/**
 * POST /api/chat/stream - Streaming chat endpoint
 *
 * Uses Server-Sent Events to stream Claude responses token-by-token.
 * Falls back to /api/chat/send for non-streaming clients.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getOrCreateSession,
  updateSession,
} from "@/lib/voice/conversation-handler";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";
import { STATIC_SYSTEM_PROMPT } from "@/lib/voice/system-prompt";
import { getThreadContext } from "@/lib/unified-thread";

export const dynamic = "force-dynamic";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

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

    // Get or create session
    const sessionKey =
      conversationId ||
      `chat-${user.id}-${new Date().toISOString().slice(0, 10)}`;
    const session = await getOrCreateSession(sessionKey, user.id);

    // Build messages
    let messages: Anthropic.MessageParam[];
    try {
      const threadMessages = await getThreadContext(user.id, 20);
      if (threadMessages.length > 0) {
        messages = [...threadMessages, { role: "user", content: message }];
      } else {
        messages = [
          ...session.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: message },
        ];
      }
    } catch {
      messages = [
        ...session.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ];
    }

    // Create streaming response
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "session", conversationId: session.id })}\n\n`,
            ),
          );

          const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            system: STATIC_SYSTEM_PROMPT,
            messages,
            stream: true,
          });

          for await (const event of response) {
            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if ("text" in delta) {
                fullText += delta.text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "delta", text: delta.text })}\n\n`,
                  ),
                );
              }
            } else if (event.type === "message_stop") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "done", fullText })}\n\n`,
                ),
              );
            }
          }

          // Save to session + unified thread (fire and forget)
          updateSession(session.id, message, fullText, {
            tenantId: user.id,
            channel: "web_chat",
          }).catch((err) =>
            console.error("[Chat Stream] Failed to update session:", err),
          );

          incrementUsage(user.id, "conversations").catch(() => {});

          controller.close();
        } catch (error) {
          console.error("[Chat Stream] Streaming error:", error);
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
