/**
 * Messenger Webhook Handler (Multi-Page)
 *
 * GET  - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 * POST - Incoming messages from Facebook Messenger
 *
 * Supports multiple Facebook Pages: looks up page token from exo_meta_pages
 * table by incoming page_id, falls back to MESSENGER_PAGE_ACCESS_TOKEN env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MessengerClient,
  getMessengerClient,
  createMessengerClientForPage,
  extractMessagingEvent,
  type MessengerWebhookPayload,
} from "@/lib/channels/messenger/client";
import { aiChat } from "@/lib/ai";
import { verifyMetaSignature } from "@/lib/security/webhook-hmac";

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
// RESOLVE CLIENT: DB page token → env var fallback
// =====================================================

async function resolveMessengerClient(
  supabase: ReturnType<typeof getSupabase>,
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
    console.log("[Messenger] Using DB token for page:", {
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
    console.error("[Messenger] DB lookup error:", {
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

export async function POST(req: NextRequest) {
  try {
    // Read raw body for HMAC verification before JSON parsing
    const rawBody = await req.text();

    // Verify X-Hub-Signature-256 if META_APP_SECRET is configured
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (!verifyMetaSignature(rawBody, signature, appSecret)) {
        console.error("[Messenger] HMAC signature verification failed");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
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

    console.log("[Messenger] Incoming message:", {
      senderPsid,
      pageId,
      messageId,
      textLength: text.length,
    });

    const supabase = getSupabase();

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

    // Resolve tenant: prefer page owner from DB, fallback to PSID lookup
    let tenantId = pageTenantId;

    if (!tenantId) {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("id, display_name, language")
        .contains("metadata", { messenger_psid: senderPsid })
        .single();

      tenantId = tenant?.id || null;
      if (tenant?.display_name) userName = tenant.display_name;
      if (tenant?.language) language = tenant.language;
    } else {
      // Load tenant details for known page owner
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
          channel: "messenger",
          page_id: pageId,
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
        pageId,
        conversationId: conversation?.id,
        responseLength: response.content.length,
      });
    } catch (error) {
      console.error("[Messenger] AI routing failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        senderPsid,
        pageId,
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
