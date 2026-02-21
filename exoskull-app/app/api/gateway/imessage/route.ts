/**
 * iMessage Webhook Route (BlueBubbles)
 *
 * POST - Incoming messages from BlueBubbles Server
 * GET  - Health check
 *
 * Setup: Install BlueBubbles on macOS → set BLUEBUBBLES_URL + BLUEBUBBLES_PASSWORD
 * Configure webhook in BlueBubbles: POST to this URL
 */

import { NextRequest, NextResponse } from "next/server";
import { imessageAdapter } from "@/lib/gateway/adapters/imessage";
import { handleInboundMessage } from "@/lib/gateway/gateway";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING IMESSAGE MESSAGES
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Verify BlueBubbles password (Bearer header only — query params leak to logs)
    const expectedPassword = process.env.BLUEBUBBLES_PASSWORD;
    if (!expectedPassword) {
      logger.error("[iMessage Route] BLUEBUBBLES_PASSWORD not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const headerPassword = req.headers
      .get("authorization")
      ?.replace("Bearer ", "");
    if (headerPassword !== expectedPassword) {
      logger.error("[iMessage Route] Invalid or missing Bearer token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    // Parse into GatewayMessage
    const msg = imessageAdapter.parseInbound(payload);
    if (!msg) {
      // Not a message we handle (typing indicator, our own message, etc.)
      return NextResponse.json({ ok: true });
    }

    logger.info("[iMessage Route] Inbound:", {
      from: msg.from,
      senderName: msg.senderName,
      textLength: msg.text.length,
      hasMedia: !!msg.mediaUrl,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via iMessage
    await imessageAdapter.sendResponse(msg.from, response.text);

    logger.info("[iMessage Route] Reply sent:", {
      to: msg.from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[iMessage Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Return 200 to prevent BlueBubbles from retrying
    return NextResponse.json({ ok: true });
  }
});

// =====================================================
// GET - HEALTH CHECK
// =====================================================

export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    channel: "imessage",
    status: "active",
    hasUrl: !!process.env.BLUEBUBBLES_URL,
    hasPassword: !!process.env.BLUEBUBBLES_PASSWORD,
  });
});
