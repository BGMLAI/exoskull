/**
 * Telegram Webhook Route
 *
 * POST - Incoming messages from Telegram Bot API
 * GET  - Setup helper: registers webhook URL with Telegram
 *
 * Setup: Create bot via @BotFather → set TELEGRAM_BOT_TOKEN env var
 * Then call GET ?action=setup&url=https://your-domain.com/api/gateway/telegram
 */

import { NextRequest, NextResponse } from "next/server";
import {
  telegramAdapter,
  setupTelegramWebhook,
} from "@/lib/gateway/adapters/telegram";
import { handleInboundMessage } from "@/lib/gateway/gateway";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING TELEGRAM MESSAGES
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Verify secret token (mandatory)
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secretToken) {
      logger.error("[Telegram Route] TELEGRAM_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerToken !== secretToken) {
      logger.error("[Telegram Route] Invalid secret token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    // Parse into GatewayMessage
    const msg = telegramAdapter.parseInbound(payload);
    if (!msg) {
      // Not a message we handle (e.g., edited message, channel post)
      return NextResponse.json({ ok: true });
    }

    logger.info("[Telegram Route] Inbound:", {
      from: msg.from,
      senderName: msg.senderName,
      textLength: msg.text.length,
      hasMedia: !!msg.mediaUrl,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via Telegram
    await telegramAdapter.sendResponse(msg.from, response.text, msg.metadata);

    logger.info("[Telegram Route] Reply sent:", {
      to: msg.from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[Telegram Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
});

// =====================================================
// GET - SETUP / HEALTH CHECK
// =====================================================

export const GET = withApiLog(async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "setup") {
    const url = req.nextUrl.searchParams.get("url");
    if (!url) {
      return NextResponse.json(
        { error: "Missing ?url= parameter" },
        { status: 400 },
      );
    }

    const success = await setupTelegramWebhook(url);
    return NextResponse.json({ success, webhookUrl: url });
  }

  // Health check
  return NextResponse.json({
    channel: "telegram",
    status: "active",
    hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
  });
});
