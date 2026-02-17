/**
 * Discord Webhook Route
 *
 * POST - Incoming messages forwarded from Discord bot
 *
 * Architecture: Discord doesn't support simple HTTPS webhooks like Telegram.
 * Two options:
 *   A) Interactions Endpoint (slash commands) — limited to /commands
 *   B) Bot + event forwarding — bot runs as gateway, forwards messages to this route
 *
 * This route supports BOTH:
 *   - Interactions (PING verification + slash commands)
 *   - Forwarded messages (from a lightweight Discord bot/proxy)
 *
 * Setup: Create Discord Application → Bot → set DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import {
  discordAdapter,
  verifyDiscordSignature,
} from "@/lib/gateway/adapters/discord";
import { handleInboundMessage } from "@/lib/gateway/gateway";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING DISCORD EVENTS
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");

    // If Discord interaction headers present, verify signature
    if (signature && timestamp) {
      const isValid = verifyDiscordSignature(rawBody, signature, timestamp);
      if (!isValid) {
        logger.error("[Discord Route] Signature verification failed");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    const payload = JSON.parse(rawBody);

    // Handle PING (Discord Interactions endpoint verification)
    if (payload.type === 1) {
      logger.info("[Discord Route] PING verification");
      return NextResponse.json({ type: 1 });
    }

    // Parse into GatewayMessage
    const msg = discordAdapter.parseInbound(payload);
    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    logger.info("[Discord Route] Inbound:", {
      from: msg.from,
      senderName: msg.senderName,
      channelId: msg.metadata.discord_channel_id,
      textLength: msg.text.length,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via Discord
    await discordAdapter.sendResponse(msg.from, response.text, msg.metadata);

    logger.info("[Discord Route] Reply sent:", {
      to: msg.from,
      channelId: msg.metadata.discord_channel_id,
      toolsUsed: response.toolsUsed,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[Discord Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ ok: true });
  }
});

// =====================================================
// GET - HEALTH CHECK
// =====================================================

export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    channel: "discord",
    status: "active",
    hasToken: !!process.env.DISCORD_BOT_TOKEN,
    hasPublicKey: !!process.env.DISCORD_PUBLIC_KEY,
  });
});
