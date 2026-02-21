/**
 * Voice Chat API
 *
 * Receives user message (from Web Speech STT), processes through Claude
 * with IORS tools, returns text response + optional TTS audio URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  getOrCreateSession,
  updateSession,
  endSession,
} from "@/lib/voice/conversation-handler";
import { runExoSkullAgent } from "@/lib/agent-sdk";
import { textToSpeech } from "@/lib/voice/elevenlabs-tts";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";
import { WEB_CHAT_SYSTEM_OVERRIDE } from "@/lib/voice/system-prompt";
import { appendMessage } from "@/lib/unified-thread";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/voice/chat
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const user = { id: auth.tenantId };

    const { message, sessionId, generateAudio = true } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Rate limit check (voice minutes)
    const rateCheck = await checkRateLimit(user.id, "voice_minutes");
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: rateCheck.upgradeMessage || "Limit minut glosowych osiagniety",
        },
        { status: 429 },
      );
    }

    // Get or create voice session
    // WAŻNE: Stały session ID per user (nie per request) dla ciągłości kontekstu
    const callSid = sessionId || `web-chat-${user.id}`;
    const session = await getOrCreateSession(callSid, user.id);

    // Append user message to unified thread (fire-and-forget, don't block)
    appendMessage(user.id, {
      role: "user",
      content: message,
      channel: "web_chat",
      direction: "inbound",
      source_type: "web_chat",
      metadata: { source: "voice_widget" },
    }).catch((err) => {
      logger.warn(
        "[VoiceChat] appendMessage failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

    // Process through Agent SDK (40s timeout like gateway)
    const result = await runExoSkullAgent({
      tenantId: user.id,
      sessionId: session.id,
      userMessage: message,
      channel: "web_chat",
      skipThreadAppend: true,
      systemPromptPrefix: WEB_CHAT_SYSTEM_OVERRIDE,
      maxTokens: 1500,
      timeoutMs: 38_000,
    });

    // Track usage (fire-and-forget)
    incrementUsage(user.id, "voice_minutes").catch((err) => {
      logger.warn(
        "[VoiceChat] Usage tracking failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

    // Update session (fire-and-forget to speed up response)
    updateSession(session.id, message, result.text, {
      tenantId: user.id,
      channel: "web_chat",
      skipUserAppend: true,
    }).catch((err) => {
      logger.warn(
        "[VoiceChat] updateSession failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

    // End session if user said goodbye
    if (result.shouldEndCall) {
      await endSession(session.id);
    }

    // Generate TTS audio if requested
    let audioBase64: string | null = null;
    if (generateAudio && result.text) {
      try {
        const audioBuffer = await textToSpeech(result.text);
        audioBase64 = Buffer.from(audioBuffer).toString("base64");
      } catch (ttsError) {
        logger.error("[Voice Chat] TTS error:", ttsError);
        // Continue without audio - text response is still valid
      }
    }

    return NextResponse.json({
      text: result.text,
      audio: audioBase64,
      toolsUsed: result.toolsUsed,
      shouldEndCall: result.shouldEndCall,
      sessionId: session.id,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[Voice Chat] Error:", {
      error: errMsg,
    });
    return NextResponse.json(
      { error: "Failed to process voice message" },
      { status: 500 },
    );
  }
});
