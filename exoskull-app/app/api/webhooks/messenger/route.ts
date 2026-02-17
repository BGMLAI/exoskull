/**
 * Messenger Webhook Handler (Multi-Page)
 *
 * GET  - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 * POST - Incoming messages from Facebook Messenger
 *
 * Supports multiple Facebook Pages: looks up page token from exo_meta_pages
 * table by incoming page_id, falls back to MESSENGER_PAGE_ACCESS_TOKEN env var.
 *
 * Uses the full AI gateway pipeline (handleInboundMessage) with all IORS tools,
 * birth flow, async task classification, session tracking, and unified thread.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  MessengerClient,
  getMessengerClient,
  createMessengerClientForPage,
  extractMessagingEvent,
  type MessengerWebhookPayload,
} from "@/lib/channels/messenger/client";
import { handleInboundMessage } from "@/lib/gateway/gateway";
import type { GatewayMessage } from "@/lib/gateway/types";
import { verifyMetaSignature } from "@/lib/security/webhook-hmac";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// GET - WEBHOOK VERIFICATION
// =====================================================

export const GET = withApiLog(async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.error("[Messenger] Webhook verify token not configured");
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[Messenger] Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  logger.error("[Messenger] Webhook verification failed:", {
    mode,
    tokenMatch: token === verifyToken,
  });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
});

// =====================================================
// RESOLVE CLIENT: DB page token → env var fallback
// =====================================================

async function resolveMessengerClient(
  supabase: ReturnType<typeof getServiceSupabase>,
  pageId: string,
): Promise<{ client: MessengerClient | null; tenantId: string | null }> {
  // Try DB lookup first (multi-page)
  const { data: page, error } = await supabase
    .from("exo_meta_pages")
    .select("tenant_id, page_access_token, page_name")
    .eq("page_type", "messenger")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .single();

  if (page?.page_access_token) {
    logger.info("[Messenger] Using DB token for page:", {
      pageId,
      pageName: page.page_name,
      tenantId: page.tenant_id,
    });
    return {
      client: createMessengerClientForPage(page.page_access_token),
      tenantId: page.tenant_id,
    };
  }

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for pages not in DB)
    logger.error("[Messenger] DB lookup error:", {
      pageId,
      error: error.message,
    });
  }

  // Fallback to env var singleton
  return { client: getMessengerClient(), tenantId: null };
}

// =====================================================
// POST - INCOMING MESSAGES
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Read raw body for HMAC verification before JSON parsing
    const rawBody = await req.text();

    // Verify X-Hub-Signature-256 (mandatory)
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      logger.error(
        "[Messenger] META_APP_SECRET not configured — rejecting request",
      );
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      logger.error("[Messenger] HMAC signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload: MessengerWebhookPayload = JSON.parse(rawBody);

    // Only handle page events
    if (payload.object !== "page") {
      return NextResponse.json({ received: true });
    }

    const incoming = extractMessagingEvent(payload);

    if (!incoming) {
      // Could be a delivery receipt, read event, etc. - acknowledge silently
      return NextResponse.json({ received: true });
    }

    const { senderPsid, text, messageId, pageId } = incoming;

    logger.info("[Messenger] Incoming message:", {
      senderPsid,
      pageId,
      messageId,
      textLength: text.length,
    });

    const supabase = getServiceSupabase();

    // Resolve client from DB or env var
    const { client, tenantId: pageTenantId } = await resolveMessengerClient(
      supabase,
      pageId,
    );

    // Send typing indicator for better UX
    if (client) {
      try {
        await client.sendTypingOn(senderPsid);
      } catch (error) {
        logger.error("[Messenger] Failed to send typing indicator:", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Try to get user profile for personalization
    let userName = "there";

    if (client) {
      try {
        const profile = await client.getProfile(senderPsid);
        userName = profile.first_name || "there";
      } catch (error) {
        logger.error("[Messenger] Failed to get profile:", {
          error: error instanceof Error ? error.message : "Unknown error",
          senderPsid,
        });
      }
    }

    // Resolve tenant: prefer page owner from DB, fallback to PSID lookup
    let tenantId = pageTenantId;

    if (!tenantId) {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("id, display_name")
        .contains("metadata", { messenger_psid: senderPsid })
        .single();

      tenantId = tenant?.id || null;
      if (tenant?.display_name) userName = tenant.display_name;
    } else {
      // Load tenant details for known page owner
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("display_name")
        .eq("id", tenantId)
        .single();

      if (tenant?.display_name) userName = tenant.display_name;
    }

    // Build GatewayMessage for full AI pipeline
    const gatewayMsg: GatewayMessage = {
      channel: "messenger",
      tenantId: tenantId || "unknown",
      from: senderPsid,
      senderName: userName,
      text,
      metadata: {
        page_id: pageId,
        message_id: messageId,
        sender_psid: senderPsid,
      },
    };

    // Process through full AI pipeline (28 tools, birth flow, async classification)
    const response = await handleInboundMessage(gatewayMsg);

    // Send reply via Messenger
    if (client) {
      try {
        await client.sendTextMessage(senderPsid, response.text);
      } catch (sendError) {
        logger.error("[Messenger] Failed to send reply:", {
          error:
            sendError instanceof Error ? sendError.message : "Unknown error",
          senderPsid,
          pageId,
        });
      }
    }

    logger.info("[Messenger] Reply sent:", {
      to: senderPsid,
      pageId,
      tenantId,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("[Messenger] Webhook processing error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Always return 200 to Meta - they retry on errors which causes duplicates
    return NextResponse.json({ received: true });
  }
});
