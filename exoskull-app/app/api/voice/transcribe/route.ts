/**
 * Voice Transcription API
 *
 * POST /api/voice/transcribe - Transcribe audio to text
 *
 * Uses Deepgram for fast, accurate Polish transcription
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getDeepgramApiKey() {
  return process.env.DEEPGRAM_API_KEY;
}

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

    // Check if Deepgram API key is configured
    if (!getDeepgramApiKey()) {
      console.warn("DEEPGRAM_API_KEY not configured, returning placeholder");
      return NextResponse.json({
        transcript: "[Transkrypcja niedostepna - brak klucza API]",
        confidence: 0,
      });
    }

    // Convert File to ArrayBuffer
    const audioBuffer = await audio.arrayBuffer();

    // Call Deepgram API
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=pl&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${getDeepgramApiKey()}`,
          "Content-Type": audio.type || "audio/webm",
        },
        body: audioBuffer,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Deepgram API error:", response.status, errorText);
      return NextResponse.json(
        {
          error: "Transcription failed",
          details: errorText,
        },
        { status: 500 },
      );
    }

    const result = await response.json();

    // Extract transcript from Deepgram response
    const transcript =
      result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    const confidence =
      result.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    return NextResponse.json({
      transcript,
      confidence,
      words: result.results?.channels?.[0]?.alternatives?.[0]?.words || [],
    });
  } catch (error) {
    console.error("POST /api/voice/transcribe error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
