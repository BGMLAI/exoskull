/**
 * WhatsApp Webhook Handler (Multi-Account) — Gateway-Integrated
 *
 * GET  - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 * POST - Incoming messages from WhatsApp Cloud API
 *
 * Supports multiple WhatsApp Business accounts: looks up account token from
 * exo_meta_pages table by phone_number_id, falls back to env vars.
 *
 * Now routes through Unified Message Gateway for FULL AI pipeline (28 tools)
 * instead of simplified aiChat(). This gives WhatsApp users the same
 * capabilities as Voice and Dashboard users.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  WhatsAppClient,
  getWhatsAppClient,
  createWhatsAppClientForAccount,
  extractIncomingMessage,
  type WhatsAppWebhookPayload,
} from "@/lib/channels/whatsapp/client";
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

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[WhatsApp] Webhook verify token not configured");
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[WhatsApp] Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("[WhatsApp] Webhook verification failed:", {
    mode,
    tokenMatch: token === verifyToken,
  });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
});

// =====================================================
// RESOLVE CLIENT: DB account token → env var fallback
// =====================================================

async function resolveWhatsAppClient(
  supabase: ReturnType<typeof getServiceSupabase>,
  phoneNumberId: string,
): Promise<{ client: WhatsAppClient | null; tenantId: string | null }> {
  // Try DB lookup first (multi-account)
  const { data: account, error } = await supabase
    .from("exo_meta_pages")
    .select("tenant_id, page_access_token, page_name, phone_number_id")
    .eq("page_type", "whatsapp")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .single();

  if (account?.page_access_token && account?.phone_number_id) {
    logger.info("[WhatsApp] Using DB token for account:", {
      phoneNumberId,
      pageName: account.page_name,
      tenantId: account.tenant_id,
    });
    return {
      client: createWhatsAppClientForAccount(
        account.page_access_token,
        account.phone_number_id,
      ),
      tenantId: account.tenant_id,
    };
  }

  if (error && error.code !== "PGRST116") {
    console.error("[WhatsApp] DB lookup error:", {
      phoneNumberId,
      error: error.message,
    });
  }

  // Fallback to env var singleton
  return { client: getWhatsAppClient(), tenantId: null };
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
      console.error(
        "[WhatsApp] META_APP_SECRET not configured — rejecting request",
      );
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      console.error("[WhatsApp] HMAC signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

    // Meta sends various webhook types - we only care about messages
    if (payload.object !== "whatsapp_business_account") {
      return NextResponse.json({ received: true });
    }

    const incoming = extractIncomingMessage(payload);

    if (!incoming) {
      // Could be a status update, delivery receipt, etc. - acknowledge silently
      return NextResponse.json({ received: true });
    }

    const { from, text, messageId, senderName, phoneNumberId } = incoming;

    logger.info("[WhatsApp] Incoming message:", {
      from,
      senderName,
      phoneNumberId,
      messageId,
      textLength: text.length,
    });

    const supabase = getServiceSupabase();

    // Resolve client from DB or env var
    const { client, tenantId: accountTenantId } = await resolveWhatsAppClient(
      supabase,
      phoneNumberId,
    );

    // Mark message as read immediately
    if (client) {
      try {
        await client.markAsRead(messageId);
      } catch (error) {
        console.error("[WhatsApp] Failed to mark as read:", {
          error: error instanceof Error ? error.message : "Unknown error",
          messageId,
        });
      }
    }

    // Resolve tenant: prefer account owner from DB, fallback to phone lookup
    let tenantId = accountTenantId;
    let language = "en";
    let userName = senderName;

    if (!tenantId) {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("id, display_name, language")
        .eq("phone", from)
        .single();

      tenantId = tenant?.id || null;
      language = tenant?.language || "en";
      userName = tenant?.display_name || senderName;
    } else {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("display_name, language")
        .eq("id", tenantId)
        .single();

      if (tenant?.display_name) userName = tenant.display_name;
      if (tenant?.language) language = tenant.language;
    }

    // Create conversation record
    const { data: conversation } = await supabase
      .from("exo_conversations")
      .insert({
        tenant_id: tenantId,
        context: {
          channel: "whatsapp",
          phone_number_id: phoneNumberId,
          sender_phone: from,
          sender_name: senderName,
          whatsapp_message_id: messageId,
        },
        message_count: 1,
        user_messages: 1,
        agent_messages: 0,
      })
      .select("id")
      .single();

    // Route through Unified Message Gateway (FULL AI pipeline with 28 tools)
    try {
      const gatewayMsg: GatewayMessage = {
        channel: "whatsapp",
        tenantId: tenantId || "unknown",
        from,
        senderName: userName || senderName,
        text,
        metadata: {
          whatsapp_message_id: messageId,
          phone_number_id: phoneNumberId,
          language,
        },
      };

      const response = await handleInboundMessage(gatewayMsg);

      // Send reply via WhatsApp (using resolved client for multi-account)
      if (client) {
        await client.sendTextMessage(from, response.text);

        // Update conversation with agent response
        if (conversation?.id) {
          await supabase
            .from("exo_conversations")
            .update({
              message_count: 2,
              agent_messages: 1,
              summary: `WhatsApp: ${text.substring(0, 100)}`,
              context: {
                channel: "whatsapp",
                phone_number_id: phoneNumberId,
                sender_phone: from,
                sender_name: senderName,
                whatsapp_message_id: messageId,
                tools_used: response.toolsUsed,
              },
            })
            .eq("id", conversation.id);
        }
      }

      logger.info("[WhatsApp] Reply sent via gateway:", {
        to: from,
        phoneNumberId,
        conversationId: conversation?.id,
        toolsUsed: response.toolsUsed,
        responseLength: response.text.length,
      });
    } catch (error) {
      console.error("[WhatsApp] Gateway processing failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        from,
        phoneNumberId,
        tenantId,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Send fallback message
      if (client) {
        const fallback =
          language === "pl"
            ? "Przepraszam, mam teraz problem z przetwarzaniem. Sprobuj ponownie za chwile."
            : "Sorry, I am having trouble processing right now. Please try again in a moment.";

        try {
          await client.sendTextMessage(from, fallback);
        } catch (sendError) {
          console.error("[WhatsApp] Fallback message failed:", {
            error:
              sendError instanceof Error ? sendError.message : "Unknown error",
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[WhatsApp] Webhook processing error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Always return 200 to Meta - they retry on errors which can cause duplicates
    return NextResponse.json({ received: true });
  }
});
