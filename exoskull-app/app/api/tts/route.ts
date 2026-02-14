/**
 * POST /api/tts
 *
 * Text-to-speech using ElevenLabs API (fallback: OpenAI TTS).
 * Returns audio/mpeg stream for client playback.
 *
 * Body: { text: string }
 * Response: audio/mpeg binary stream
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_CHARS = 4000;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await req.json();

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

    // Try ElevenLabs first, fallback to OpenAI
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "3kPofxWv5xLwBvMVraip";

    if (elevenLabsKey) {
      try {
        const elRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": elevenLabsKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: truncated,
              model_id: "eleven_turbo_v2_5",
              voice_settings: {
                stability: 0.65,
                similarity_boost: 0.8,
                style: 0.05,
                use_speaker_boost: true,
                speed: 1.15,
              },
            }),
          },
        );

        if (elRes.ok) {
          const audioBuffer = Buffer.from(await elRes.arrayBuffer());
          return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Content-Length": String(audioBuffer.length),
              "Cache-Control": "no-cache",
            },
          });
        }

        console.error(
          "[TTS] ElevenLabs failed:",
          elRes.status,
          await elRes.text().catch(() => ""),
        );
      } catch (elErr) {
        console.error(
          "[TTS] ElevenLabs error:",
          elErr instanceof Error ? elErr.message : elErr,
        );
      }
    }

    // Fallback: OpenAI TTS
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: truncated,
      response_format: "mp3",
      speed: 1.2,
    });

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
