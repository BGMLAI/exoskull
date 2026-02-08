/**
 * Voice Transcription API
 *
 * POST /api/voice/transcribe - Transcribe audio to text
 *
 * Uses Groq Whisper for fast, accurate Polish transcription.
 * Includes hallucination detection (Whisper repeats phrases on silence/noise).
 */

import { NextRequest, NextResponse } from "next/server";
import { isHallucination } from "@/lib/voice/transcribe-voice-note";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    // Reject too-small files (likely just noise/clicks)
    if (audio.size < 5000) {
      logger.info("[Transcribe] Audio too small:", audio.size, "bytes");
      return NextResponse.json({ transcript: "" });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      console.error("[Transcribe] GROQ_API_KEY not configured");
      return NextResponse.json(
        {
          error:
            "Transcription service unavailable — GROQ_API_KEY not configured",
        },
        { status: 503 },
      );
    }

    // Build FormData for Groq API
    const groqForm = new FormData();
    groqForm.append("file", audio, "audio.webm");
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("language", "pl");
    groqForm.append("response_format", "verbose_json");
    groqForm.append("temperature", "0.0");
    // No prompt — explicit prompts bias Whisper toward hallucinations on short audio

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: groqForm,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Transcribe] Groq API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Transcription failed", details: errorText },
        { status: 500 },
      );
    }

    const result = await response.json();
    const transcript = (result.text || "").trim();

    logger.info(
      "[Transcribe] Raw result:",
      JSON.stringify({
        text: transcript,
        duration: result.duration,
        segments: result.segments?.length,
      }),
    );

    // Filter hallucinations
    if (isHallucination(transcript)) {
      logger.info("[Transcribe] Filtered hallucination:", transcript);
      return NextResponse.json({ transcript: "" });
    }

    // Filter segments with high no_speech_prob (0.6 threshold)
    if (result.segments?.length) {
      const realSegments = result.segments.filter(
        (s: { no_speech_prob?: number }) => (s.no_speech_prob || 0) < 0.6,
      );
      if (realSegments.length === 0) {
        logger.info("[Transcribe] All segments have high no_speech_prob");
        return NextResponse.json({ transcript: "" });
      }
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("[Transcribe] Error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 },
    );
  }
}
