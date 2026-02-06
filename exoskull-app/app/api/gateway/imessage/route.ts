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

export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING IMESSAGE MESSAGES
// =====================================================

export async function POST(req: NextRequest) {
  try {
    // Verify BlueBubbles password (Bearer header only — query params leak to logs)
    const expectedPassword = process.env.BLUEBUBBLES_PASSWORD;
    if (!expectedPassword) {
      console.error("[iMessage Route] BLUEBUBBLES_PASSWORD not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const headerPassword = req.headers
      .get("authorization")
      ?.replace("Bearer ", "");
    if (headerPassword !== expectedPassword) {
      console.error("[iMessage Route] Invalid or missing Bearer token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    // Parse into GatewayMessage
    const msg = imessageAdapter.parseInbound(payload);
    if (!msg) {
      // Not a message we handle (typing indicator, our own message, etc.)
      return NextResponse.json({ ok: true });
    }

    console.log("[iMessage Route] Inbound:", {
      from: msg.from,
      senderName: msg.senderName,
      textLength: msg.text.length,
      hasMedia: !!msg.mediaUrl,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via iMessage
    await imessageAdapter.sendResponse(msg.from, response.text);

    console.log("[iMessage Route] Reply sent:", {
      to: msg.from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[iMessage Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Return 200 to prevent BlueBubbles from retrying
    return NextResponse.json({ ok: true });
  }
}

// =====================================================
// GET - HEALTH CHECK
// =====================================================

export async function GET() {
  return NextResponse.json({
    channel: "imessage",
    status: "active",
    hasUrl: !!process.env.BLUEBUBBLES_URL,
    hasPassword: !!process.env.BLUEBUBBLES_PASSWORD,
  });
}
