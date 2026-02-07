/**
 * Voice Chat API
 *
 * Receives user message (from Web Speech STT), processes through Claude
 * with IORS tools, returns text response + optional TTS audio URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
  endSession,
} from "@/lib/voice/conversation-handler";
import { textToSpeech } from "@/lib/voice/elevenlabs-tts";
import { checkRateLimit, incrementUsage } from "@/lib/business/rate-limiter";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/voice/chat
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    // Jeśli frontend przekazuje sessionId - użyj go, inaczej użyj stałego ID usera
    const callSid = sessionId || `web-chat-${user.id}`;
    const session = await getOrCreateSession(callSid, user.id);

    // Process through Claude with tools
    const result = await processUserMessage(session, message);

    // Track usage
    await incrementUsage(user.id, "voice_minutes").catch((err) => {
      logger.warn(
        "[VoiceChat] Usage tracking failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

    // Update session with conversation
    await updateSession(session.id, message, result.text);

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
        console.error("[Voice Chat] TTS error:", ttsError);
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
    console.error("[Voice Chat] Error:", error);
    return NextResponse.json(
      { error: "Failed to process voice message" },
      { status: 500 },
    );
  }
}
