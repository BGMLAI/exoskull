/**
 * POST /api/voice/tts — Text-to-Speech endpoint
 *
 * Receives text, returns Cartesia Sonic 3 audio as base64.
 * Used by HomeChat and other components that need TTS on-demand.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { textToSpeech } from "@/lib/voice/elevenlabs-tts";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;

    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Limit text length to prevent abuse (max ~2000 chars ≈ 30s of speech)
    const trimmed = text.slice(0, 2000);

    const audioBuffer = await textToSpeech(trimmed);
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({ audio: audioBase64 });
  } catch (error) {
    logger.error("[TTS API] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        error: "TTS generation failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
