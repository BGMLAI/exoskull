/**
 * POST /api/tts
 *
 * Text-to-speech using OpenAI TTS API.
 * Returns audio/mpeg stream for client playback.
 *
 * Body: { text: string, voice?: string }
 * Response: audio/mpeg binary stream
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const MAX_CHARS = 4000; // OpenAI TTS limit is 4096

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text, voice = "nova" } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    // Strip markdown for cleaner speech
    const clean = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[-*] /g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!clean) {
      return NextResponse.json({ error: "No speakable text" }, { status: 400 });
    }

    const truncated = clean.slice(0, MAX_CHARS);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice as "nova" | "alloy" | "echo" | "fable" | "onyx" | "shimmer",
      input: truncated,
      response_format: "mp3",
      speed: 1.05,
    });

    // Stream the audio back
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[TTS] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "TTS generation failed" },
      { status: 500 },
    );
  }
}
