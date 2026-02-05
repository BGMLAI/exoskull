/**
 * WhatsApp Webhook Handler
 *
 * GET  - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 * POST - Incoming messages from WhatsApp Cloud API
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getWhatsAppClient,
  extractIncomingMessage,
  type WhatsAppWebhookPayload,
} from "@/lib/channels/whatsapp/client";
import { aiChat } from "@/lib/ai";

export const dynamic = "force-dynamic";

// =====================================================
// SUPABASE SERVICE CLIENT
// =====================================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// =====================================================
// GET - WEBHOOK VERIFICATION
// =====================================================

export async function GET(req: NextRequest) {
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
    console.log("[WhatsApp] Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("[WhatsApp] Webhook verification failed:", {
    mode,
    tokenMatch: token === verifyToken,
  });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// =====================================================
// POST - INCOMING MESSAGES
// =====================================================

export async function POST(req: NextRequest) {
  try {
    const payload: WhatsAppWebhookPayload = await req.json();

    // Meta sends various webhook types - we only care about messages
    if (payload.object !== "whatsapp_business_account") {
      return NextResponse.json({ received: true });
    }

    const incoming = extractIncomingMessage(payload);

    if (!incoming) {
      // Could be a status update, delivery receipt, etc. - acknowledge silently
      return NextResponse.json({ received: true });
    }

    const { from, text, messageId, senderName } = incoming;

    console.log("[WhatsApp] Incoming message:", {
      from,
      senderName,
      messageId,
      textLength: text.length,
    });

    // Mark message as read immediately
    const client = getWhatsAppClient();
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

    // Resolve tenant by phone number
    const supabase = getSupabase();
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("id, display_name, language")
      .eq("phone", from)
      .single();

    const tenantId = tenant?.id || null;
    const language = tenant?.language || "en";
    const userName = tenant?.display_name || senderName;

    // Create conversation record
    const { data: conversation } = await supabase
      .from("exo_conversations")
      .insert({
        tenant_id: tenantId,
        context: {
          channel: "whatsapp",
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

    // Route to AI for response
    try {
      const systemPrompt =
        language === "pl"
          ? `Jestes ExoSkull - drugi mozg uzytkownika ${userName}. Odpowiadasz przez WhatsApp. Badz krotki, konkretny, pomocny. Uzywaj jezyka polskiego.`
          : `You are ExoSkull - ${userName}'s second brain. You're replying via WhatsApp. Be brief, specific, helpful.`;

      const response = await aiChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        { taskCategory: "simple_response" },
      );

      // Send reply via WhatsApp
      if (client) {
        await client.sendTextMessage(from, response.content);

        // Update conversation with agent response
        if (conversation?.id) {
          await supabase
            .from("exo_conversations")
            .update({
              message_count: 2,
              agent_messages: 1,
              summary: `WhatsApp: ${text.substring(0, 100)}`,
            })
            .eq("id", conversation.id);
        }
      }

      console.log("[WhatsApp] Reply sent:", {
        to: from,
        conversationId: conversation?.id,
        responseLength: response.content.length,
      });
    } catch (error) {
      console.error("[WhatsApp] AI routing failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        from,
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
}
