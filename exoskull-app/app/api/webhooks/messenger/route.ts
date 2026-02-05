/**
 * Messenger Webhook Handler
 *
 * GET  - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 * POST - Incoming messages from Facebook Messenger
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getMessengerClient,
  extractMessagingEvent,
  type MessengerWebhookPayload,
} from "@/lib/channels/messenger/client";
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

  const verifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[Messenger] Webhook verify token not configured");
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Messenger] Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("[Messenger] Webhook verification failed:", {
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
    const payload: MessengerWebhookPayload = await req.json();

    // Only handle page events
    if (payload.object !== "page") {
      return NextResponse.json({ received: true });
    }

    const incoming = extractMessagingEvent(payload);

    if (!incoming) {
      // Could be a delivery receipt, read event, etc. - acknowledge silently
      return NextResponse.json({ received: true });
    }

    const { senderPsid, text, messageId } = incoming;

    console.log("[Messenger] Incoming message:", {
      senderPsid,
      messageId,
      textLength: text.length,
    });

    const client = getMessengerClient();

    // Send typing indicator for better UX
    if (client) {
      try {
        await client.sendTypingOn(senderPsid);
      } catch (error) {
        console.error("[Messenger] Failed to send typing indicator:", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Try to get user profile for personalization
    let userName = "there";
    let language = "en";

    if (client) {
      try {
        const profile = await client.getProfile(senderPsid);
        userName = profile.first_name || "there";
      } catch (error) {
        console.error("[Messenger] Failed to get profile:", {
          error: error instanceof Error ? error.message : "Unknown error",
          senderPsid,
        });
      }
    }

    // Resolve tenant by messenger PSID stored in metadata
    const supabase = getSupabase();
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("id, display_name, language")
      .contains("metadata", { messenger_psid: senderPsid })
      .single();

    const tenantId = tenant?.id || null;
    if (tenant?.display_name) userName = tenant.display_name;
    if (tenant?.language) language = tenant.language;

    // Create conversation record
    const { data: conversation } = await supabase
      .from("exo_conversations")
      .insert({
        tenant_id: tenantId,
        context: {
          channel: "messenger",
          sender_psid: senderPsid,
          sender_name: userName,
          messenger_message_id: messageId,
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
          ? `Jestes ExoSkull - drugi mozg uzytkownika ${userName}. Odpowiadasz przez Messenger. Badz krotki, konkretny, pomocny. Uzywaj jezyka polskiego.`
          : `You are ExoSkull - ${userName}'s second brain. You're replying via Messenger. Be brief, specific, helpful.`;

      const response = await aiChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        { taskCategory: "simple_response" },
      );

      // Send reply via Messenger
      if (client) {
        await client.sendTextMessage(senderPsid, response.content);

        // Update conversation with agent response
        if (conversation?.id) {
          await supabase
            .from("exo_conversations")
            .update({
              message_count: 2,
              agent_messages: 1,
              summary: `Messenger: ${text.substring(0, 100)}`,
            })
            .eq("id", conversation.id);
        }
      }

      console.log("[Messenger] Reply sent:", {
        to: senderPsid,
        conversationId: conversation?.id,
        responseLength: response.content.length,
      });
    } catch (error) {
      console.error("[Messenger] AI routing failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        senderPsid,
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
          await client.sendTextMessage(senderPsid, fallback);
        } catch (sendError) {
          console.error("[Messenger] Fallback message failed:", {
            error:
              sendError instanceof Error ? sendError.message : "Unknown error",
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Messenger] Webhook processing error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Always return 200 to Meta - they retry on errors which causes duplicates
    return NextResponse.json({ received: true });
  }
}
