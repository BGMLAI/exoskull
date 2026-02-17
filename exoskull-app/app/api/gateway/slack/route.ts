/**
 * Slack Webhook Route
 *
 * POST - Incoming events from Slack Events API
 *        Handles: url_verification, message, app_mention
 *
 * Setup: Create Slack App → Event Subscriptions → Request URL → Subscribe to events
 * Env vars: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
 *
 * Important: Slack requires response within 3 seconds.
 * We return 200 immediately and process async.
 */

import { NextRequest, NextResponse } from "next/server";
import { slackAdapter } from "@/lib/gateway/adapters/slack";
import { handleInboundMessage } from "@/lib/gateway/gateway";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// Track processed events to prevent duplicates (Slack retries aggressively)
// Uses a Map with timestamps for automatic cleanup to prevent memory leaks
const processedEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000; // 1 minute
const MAX_DEDUP_ENTRIES = 1000; // Safety cap to prevent memory exhaustion

function cleanupDedupCache(): void {
  const now = Date.now();
  for (const [key, timestamp] of processedEvents) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedEvents.delete(key);
    }
  }
}

// =====================================================
// POST - INCOMING SLACK EVENTS
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Verify Slack signature
    if (slackAdapter.verifyWebhook) {
      const isValid = await slackAdapter.verifyWebhook(req);
      if (!isValid) {
        logger.error("[Slack Route] Signature verification failed");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    const payload = await req.json();

    // Handle url_verification challenge (Slack setup requirement)
    if (payload.type === "url_verification") {
      logger.info("[Slack Route] URL verification challenge received");
      return NextResponse.json({ challenge: payload.challenge });
    }

    // Dedup: skip if already processed
    const eventId = payload.event_id || payload.event?.ts;
    if (eventId) {
      if (processedEvents.has(eventId)) {
        return NextResponse.json({ ok: true });
      }
      // Cleanup stale entries before adding new ones
      if (processedEvents.size >= MAX_DEDUP_ENTRIES) {
        cleanupDedupCache();
      }
      processedEvents.set(eventId, Date.now());
    }

    // Parse into GatewayMessage
    const msg = slackAdapter.parseInbound(payload);
    if (!msg) {
      return NextResponse.json({ ok: true });
    }

    logger.info("[Slack Route] Inbound:", {
      from: msg.from,
      channel: msg.metadata.slack_channel_id,
      textLength: msg.text.length,
    });

    // Process async — return 200 to Slack immediately to avoid 3s timeout
    // In Vercel, the response closes the connection but the function continues
    const processAsync = async () => {
      try {
        const response = await handleInboundMessage(msg);
        await slackAdapter.sendResponse(msg.from, response.text, msg.metadata);

        logger.info("[Slack Route] Reply sent:", {
          to: msg.from,
          channel: msg.metadata.slack_channel_id,
          toolsUsed: response.toolsUsed,
        });
      } catch (error) {
        logger.error("[Slack Route] Async processing error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          from: msg.from,
        });
      }
    };

    // Use waitUntil-like pattern: don't await, let it run in background
    // In Vercel serverless, the function stays alive until all promises resolve
    processAsync().catch((err) =>
      logger.error("[Slack Route] Background task failed:", err),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[Slack Route] Error:", {
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
    channel: "slack",
    status: "active",
    hasToken: !!process.env.SLACK_BOT_TOKEN,
    hasSigningSecret: !!process.env.SLACK_SIGNING_SECRET,
  });
});
