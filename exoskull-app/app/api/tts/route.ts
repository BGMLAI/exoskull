/**
 * POST /api/tts
 *
 * Text-to-speech with 3-tier fallback:
 * 1. Gemini TTS (cheapest, native audio preview)
 * 2. ElevenLabs (highest quality, Polish voices)
 * 3. OpenAI TTS (reliable fallback)
 *
 * Body: { text: string, provider?: "gemini" | "elevenlabs" | "openai" }
 * Response: audio/mpeg binary stream
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { withRateLimit } from "@/lib/api/rate-limit-guard";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const MAX_CHARS = 4000;

/**
 * Strip markdown formatting for cleaner speech output.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[-*] /g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Generate TTS using Gemini's text-to-speech model.
 * Returns WAV audio (PCM16 24kHz) or null on failure.
 */
async function geminiTTS(text: string): Promise<Buffer | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const { GoogleGenAI, Modality } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Orus" },
          },
        },
      } as any,
    });

    // Extract audio data from response
    const audioPart = (response as any).candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith("audio/"),
    );

    if (audioPart?.inlineData?.data) {
      return Buffer.from(audioPart.inlineData.data, "base64");
    }

    return null;
  } catch (err) {
    logger.error("[TTS] Gemini TTS error:", {
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

/**
 * Generate TTS using ElevenLabs API.
 * Returns MP3 audio or null on failure.
 */
async function elevenLabsTTS(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "3kPofxWv5xLwBvMVraip";

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
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

    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }

    logger.error(
      "[TTS] ElevenLabs failed:",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  } catch (err) {
    logger.error("[TTS] ElevenLabs error:", {
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

/**
 * Generate TTS using OpenAI API.
 * Returns MP3 audio or null on failure.
 */
async function openaiTTS(text: string): Promise<Buffer | null> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "mp3",
      speed: 1.2,
    });

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    logger.error("[TTS] OpenAI error:", {
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

export const POST = withApiLog(
  withRateLimit("voice_minutes", async function POST(req: NextRequest) {
    try {
      const auth = await verifyTenantAuth(req);
      if (!auth.ok) return auth.response;

      const body = await req.json();
      const { text, provider } = body;

      if (!text || typeof text !== "string") {
        return NextResponse.json(
          { error: "text is required" },
          { status: 400 },
        );
      }

      const clean = stripMarkdown(text);
      if (!clean) {
        return NextResponse.json(
          { error: "No speakable text" },
          { status: 400 },
        );
      }

      const truncated = clean.slice(0, MAX_CHARS);

      // If specific provider requested, try only that one
      if (provider === "gemini") {
        const audio = await geminiTTS(truncated);
        if (audio) {
          return new NextResponse(new Uint8Array(audio), {
            status: 200,
            headers: {
              "Content-Type": "audio/wav",
              "Content-Length": String(audio.length),
              "Cache-Control": "no-cache",
            },
          });
        }
        return NextResponse.json(
          { error: "Gemini TTS failed" },
          { status: 500 },
        );
      }

      // Default: 3-tier fallback chain
      // Tier 1: ElevenLabs (best quality for Polish)
      const elAudio = await elevenLabsTTS(truncated);
      if (elAudio) {
        return new NextResponse(new Uint8Array(elAudio), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(elAudio.length),
            "Cache-Control": "no-cache",
          },
        });
      }

      // Tier 2: OpenAI TTS
      const oaiAudio = await openaiTTS(truncated);
      if (oaiAudio) {
        return new NextResponse(new Uint8Array(oaiAudio), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(oaiAudio.length),
            "Cache-Control": "no-cache",
          },
        });
      }

      // Tier 3: Gemini TTS (last resort)
      const geminiAudio = await geminiTTS(truncated);
      if (geminiAudio) {
        return new NextResponse(new Uint8Array(geminiAudio), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Content-Length": String(geminiAudio.length),
            "Cache-Control": "no-cache",
          },
        });
      }

      return NextResponse.json(
        { error: "All TTS providers failed" },
        { status: 500 },
      );
    } catch (error) {
      logger.error("[TTS] Error:", {
        error: error instanceof Error ? error.message : error,
      });
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: 500 },
      );
    }
  }),
);
