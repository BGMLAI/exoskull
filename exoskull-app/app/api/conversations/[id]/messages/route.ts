import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// GET /api/conversations/[id]/messages - Get messages for a conversation
export const GET = withApiLog(async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const conversationId = params.id;

    // Get messages
    const { data: messages, error } = await supabase
      .from("exo_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("tenant_id", tenantId)
      .order("timestamp", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ messages });
  } catch (error) {
    logger.error("[Messages] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
});

// POST /api/conversations/[id]/messages - Add message to conversation
export const POST = withApiLog(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const conversationId = params.id;
    const { role, content, context } = await req.json();

    // Add message
    const { data: message, error } = await supabase
      .from("exo_messages")
      .insert({
        conversation_id: conversationId,
        tenant_id: tenantId,
        role,
        content,
        context: context || {},
      })
      .select()
      .single();

    if (error) throw error;

    // Update conversation message count (best-effort, don't fail if this errors)
    try {
      // Get current counts
      const { data: conv } = await supabase
        .from("exo_conversations")
        .select("message_count, user_messages, agent_messages")
        .eq("id", conversationId)
        .single();

      if (conv) {
        await supabase
          .from("exo_conversations")
          .update({
            message_count: (conv.message_count || 0) + 1,
            user_messages:
              role === "user"
                ? (conv.user_messages || 0) + 1
                : conv.user_messages,
            agent_messages:
              role !== "user"
                ? (conv.agent_messages || 0) + 1
                : conv.agent_messages,
          })
          .eq("id", conversationId);
      }
    } catch (countError) {
      logger.warn("Failed to update message count:", countError);
    }

    return NextResponse.json({ message });
  } catch (error) {
    logger.error("[Messages] POST error:", error);
    return NextResponse.json(
      { error: "Failed to add message" },
      { status: 500 },
    );
  }
});
