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

export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING TELEGRAM MESSAGES
// =====================================================

export async function POST(req: NextRequest) {
  try {
    // Verify secret token (optional but recommended)
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
      if (headerToken !== secretToken) {
        console.error("[Telegram Route] Invalid secret token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const payload = await req.json();

    // Parse into GatewayMessage
    const msg = telegramAdapter.parseInbound(payload);
    if (!msg) {
      // Not a message we handle (e.g., edited message, channel post)
      return NextResponse.json({ ok: true });
    }

    console.log("[Telegram Route] Inbound:", {
      from: msg.from,
      senderName: msg.senderName,
      textLength: msg.text.length,
      hasMedia: !!msg.mediaUrl,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via Telegram
    await telegramAdapter.sendResponse(msg.from, response.text, msg.metadata);

    console.log("[Telegram Route] Reply sent:", {
      to: msg.from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

// =====================================================
// GET - SETUP / HEALTH CHECK
// =====================================================

export async function GET(req: NextRequest) {
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
}
