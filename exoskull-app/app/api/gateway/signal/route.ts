/**
 * Signal Webhook Route
 *
 * POST - Incoming messages from signal-cli REST API
 * GET  - Health check
 *
 * Setup: Run signal-cli-rest-api Docker container → set SIGNAL_API_URL env var
 * Configure webhook: POST /v1/receive/{number} on signal-cli to this URL
 */

import { NextRequest, NextResponse } from "next/server";
import { signalAdapter } from "@/lib/gateway/adapters/signal";
import { handleInboundMessage } from "@/lib/gateway/gateway";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// POST - INCOMING SIGNAL MESSAGES
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Verify shared secret (mandatory)
    const expectedSecret = process.env.SIGNAL_WEBHOOK_SECRET;
    if (!expectedSecret) {
      logger.error("[Signal Route] SIGNAL_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const headerSecret =
      req.headers.get("x-signal-webhook-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (headerSecret !== expectedSecret) {
      logger.error("[Signal Route] Invalid webhook secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    // Parse into GatewayMessage
    const msg = signalAdapter.parseInbound(payload);
    if (!msg) {
      // Not a message we handle (sync, group, receipt, etc.)
      return NextResponse.json({ ok: true });
    }

    logger.info("[Signal Route] Inbound:", {
      from: msg.from,
      textLength: msg.text.length,
      hasMedia: !!msg.mediaUrl,
    });

    // Process through full AI pipeline
    const response = await handleInboundMessage(msg);

    // Send response back via Signal
    await signalAdapter.sendResponse(msg.from, response.text);

    logger.info("[Signal Route] Reply sent:", {
      to: msg.from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[Signal Route] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Return 200 to prevent signal-cli from retrying
    return NextResponse.json({ ok: true });
  }
});

// =====================================================
// GET - HEALTH CHECK
// =====================================================

export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    channel: "signal",
    status: "active",
    hasApiUrl: !!process.env.SIGNAL_API_URL,
    hasSenderNumber: !!process.env.SIGNAL_SENDER_NUMBER,
  });
});
