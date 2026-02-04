/**
 * POST /api/chat/send - Send a message in the unified chat
 *
 * Uses the same Claude + IORS_TOOLS pipeline as voice,
 * but returns text (no TTS audio by default).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
  endSession,
} from "@/lib/voice/conversation-handler";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, conversationId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Rate limit check
    const rateCheck = await checkRateLimit(user.id, "conversations");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.upgradeMessage || "Limit rozmow osiagniety" },
        { status: 429 },
      );
    }

    // Get or create session
    const sessionKey =
      conversationId ||
      `chat-${user.id}-${new Date().toISOString().slice(0, 10)}`;
    const session = await getOrCreateSession(sessionKey, user.id);

    // Process through Claude with IORS tools
    const result = await processUserMessage(session, message);

    // Track usage
    await incrementUsage(user.id, "conversations").catch(() => {});

    // Save to session + unified thread
    await updateSession(session.id, message, result.text, {
      tenantId: user.id,
      channel: "web_chat",
    });

    if (result.shouldEndCall) {
      await endSession(session.id);
    }

    return NextResponse.json({
      text: result.text,
      toolsUsed: result.toolsUsed,
      conversationId: session.id,
    });
  } catch (error) {
    console.error("[Chat Send] Error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
