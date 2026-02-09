/**
 * POST /api/chat/send - Send a message in the unified chat
 *
 * Routes through the Unified Message Gateway (same pipeline as WhatsApp/Telegram/etc.)
 * for consistent tool access, unified thread, and Petla event emission.
 */
import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Rate limit check
    const rateCheck = await checkRateLimit(user.id, "conversations");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.upgradeMessage || "Limit rozmow osiagniety" },
        { status: 429 },
      );
    }

    // Route through Unified Message Gateway (full AI pipeline with 31 tools)
    const gatewayMsg: GatewayMessage = {
      channel: "web_chat",
      from: user.id,
      text: message.trim(),
      tenantId: user.id,
      senderName: user.user_metadata?.first_name || "User",
      metadata: { conversationId },
    };

    const result = await handleInboundMessage(gatewayMsg);

    // Track usage
    await incrementUsage(user.id, "conversations").catch((err) => {
      logger.warn(
        "[ChatSend] Usage tracking failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

    return NextResponse.json({
      text: result.text,
      toolsUsed: result.toolsUsed,
      conversationId:
        conversationId ||
        `chat-${user.id}-${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (error) {
    console.error("[Chat Send] Error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
