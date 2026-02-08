/**
 * POST /api/voice/tts — Text-to-Speech endpoint
 *
 * Receives text, returns Cartesia Sonic 3 audio as base64.
 * Used by HomeChat and other components that need TTS on-demand.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { textToSpeech } from "@/lib/voice/elevenlabs-tts";

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
    console.error("[TTS API] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "TTS generation failed" },
      { status: 500 },
    );
  }
}
