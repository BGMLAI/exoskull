/**
 * Voice Transcription API
 *
 * POST /api/voice/transcribe - Transcribe audio to text
 *
 * 2-tier: OpenAI Whisper (primary) → Groq Whisper (fallback)
 * Includes hallucination detection (Whisper repeats phrases on silence/noise).
 */

import { NextRequest, NextResponse } from "next/server";
import { isHallucination } from "@/lib/voice/transcribe-voice-note";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { withApiLog } from "@/lib/api/request-logger";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const STT_TIMEOUT_MS = 30_000; // 30s timeout for transcription API calls

// ---------------------------------------------------------------------------
// Transcribe with OpenAI Whisper
// ---------------------------------------------------------------------------
async function tryOpenAI(
  audio: File,
): Promise<{ transcript: string; provider: string } | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  try {
    const form = new FormData();
    form.append("file", audio, audio.name || "audio.webm");
    form.append("model", "whisper-1");
    form.append("language", "pl");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0.0");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText = await res.text();
      logger.error("[Transcribe] OpenAI error:", {
        status: res.status,
        error: errText,
      });
      return null;
    }

    const result = await res.json();
    const text = (result.text || "").trim();

    logger.info(
      "[Transcribe] OpenAI raw:",
      JSON.stringify({
        text,
        duration: result.duration,
        segments: result.segments?.length,
      }),
    );

    // Filter hallucinations
    if (isHallucination(text)) {
      logger.info("[Transcribe] OpenAI hallucination filtered:", text);
      return null; // Fall through to Groq
    }

    // Filter segments with high no_speech_prob
    if (result.segments?.length) {
      const real = result.segments.filter(
        (s: { no_speech_prob?: number }) => (s.no_speech_prob || 0) < 0.6,
      );
      if (real.length === 0) {
        logger.info("[Transcribe] OpenAI all segments no_speech");
        return null;
      }
    }

    return { transcript: text, provider: "openai" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.error("[Transcribe] OpenAI timeout after 30s");
      return null;
    }
    logger.error("[Transcribe] OpenAI exception:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transcribe with Groq Whisper
// ---------------------------------------------------------------------------
async function tryGroq(
  audio: File,
): Promise<{ transcript: string; provider: string } | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  try {
    const form = new FormData();
    form.append("file", audio, audio.name || "audio.webm");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "pl");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0.0");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

    const res = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      const errText = await res.text();
      logger.error("[Transcribe] Groq error:", {
        status: res.status,
        error: errText,
      });
      return null;
    }

    const result = await res.json();
    const text = (result.text || "").trim();

    logger.info(
      "[Transcribe] Groq raw:",
      JSON.stringify({
        text,
        duration: result.duration,
        segments: result.segments?.length,
      }),
    );

    if (isHallucination(text)) {
      logger.info("[Transcribe] Groq hallucination filtered:", text);
      return { transcript: "", provider: "groq" };
    }

    if (result.segments?.length) {
      const real = result.segments.filter(
        (s: { no_speech_prob?: number }) => (s.no_speech_prob || 0) < 0.6,
      );
      if (real.length === 0) {
        return { transcript: "", provider: "groq" };
      }
    }

    return { transcript: text, provider: "groq" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.error("[Transcribe] Groq timeout after 30s");
      return null;
    }
    logger.error("[Transcribe] Groq exception:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------
export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    // Reject too-small files (likely just noise/clicks)
    if (audio.size < 3000) {
      logger.info("[Transcribe] Audio too small:", audio.size, "bytes");
      return NextResponse.json({ transcript: "" });
    }

    // Determine file extension from MIME type (Safari sends audio/mp4)
    const ext =
      audio.type === "audio/mp4" || audio.type === "audio/aac"
        ? "mp4"
        : audio.type === "audio/ogg"
          ? "ogg"
          : "webm";
    const audioFile = new File([audio], `audio.${ext}`, { type: audio.type });

    // Tier 1: OpenAI Whisper (more accurate, original model)
    const openaiResult = await tryOpenAI(audioFile);
    if (openaiResult && openaiResult.transcript) {
      logger.info(
        "[Transcribe] OpenAI succeeded:",
        openaiResult.transcript.length,
        "chars",
      );
      return NextResponse.json({ transcript: openaiResult.transcript });
    }

    // Tier 2: Groq Whisper (fast, free)
    const groqResult = await tryGroq(audioFile);
    if (groqResult && groqResult.transcript) {
      logger.info(
        "[Transcribe] Groq succeeded:",
        groqResult.transcript.length,
        "chars",
      );
      return NextResponse.json({ transcript: groqResult.transcript });
    }

    // Both failed or returned empty
    if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "No transcription API keys configured" },
        { status: 503 },
      );
    }

    logger.info("[Transcribe] Both providers returned empty/filtered");
    return NextResponse.json({ transcript: "" });
  } catch (error) {
    logger.error("[Transcribe] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 },
    );
  }
});
