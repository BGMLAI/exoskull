/**
 * POST /api/chat/send - Send a message in the unified chat
 *
 * Routes through the Unified Message Gateway (same pipeline as WhatsApp/Telegram/etc.)
 * for consistent tool access, unified thread, and Petla event emission.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { handleInboundMessage } from "@/lib/gateway/gateway";
import type { GatewayMessage } from "@/lib/gateway/types";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Rate limit check
    const rateCheck = await checkRateLimit(tenantId, "conversations");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.upgradeMessage || "Limit rozmow osiagniety" },
        { status: 429 },
      );
    }

    // Route through Unified Message Gateway (full AI pipeline with 31 tools)
    const gatewayMsg: GatewayMessage = {
      channel: "web_chat",
      from: tenantId,
      text: message.trim(),
      tenantId,
      senderName: "User",
      metadata: { conversationId },
    };

    const result = await handleInboundMessage(gatewayMsg);

    // Track usage
    await incrementUsage(tenantId, "conversations").catch((err) => {
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
        `chat-${tenantId}-${new Date().toISOString().slice(0, 10)}`,
      ...(result.errorCode && { errorCode: result.errorCode }),
    });
  } catch (error) {
    logger.error("[Chat Send] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
});
