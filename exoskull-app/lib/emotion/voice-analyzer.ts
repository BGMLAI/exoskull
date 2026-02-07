/**
 * Voice Prosody Analyzer — Layer 11 Phase 2
 *
 * Downloads Twilio recording, sends to Deepgram, extracts word-level
 * timing data, and computes VoiceFeatures (speech_rate, pause metrics).
 *
 * Pitch/energy not available from Deepgram word timings — deferred to Phase 3.
 */

import type { VoiceFeatures } from "./types";

import { logger } from "@/lib/logger";
interface DeepgramWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

const PAUSE_THRESHOLD_SEC = 0.3; // gaps > 300ms count as pauses

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Download audio from Twilio recording URL and analyze via Deepgram.
 * Returns VoiceFeatures computed from word timings.
 * Returns null if recording unavailable or analysis fails (non-blocking).
 */
export async function analyzeVoiceProsody(
  recordingUrl: string,
): Promise<VoiceFeatures | null> {
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    logger.warn("[VoiceAnalyzer] DEEPGRAM_API_KEY not configured");
    return null;
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  try {
    // 1. Download recording from Twilio (requires basic auth)
    const audioUrl = recordingUrl.endsWith(".wav")
      ? recordingUrl
      : `${recordingUrl}.wav`;

    const fetchOptions: RequestInit = {};
    if (twilioSid && twilioToken) {
      fetchOptions.headers = {
        Authorization:
          "Basic " +
          Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
      };
    }

    const audioResponse = await fetch(audioUrl, fetchOptions);
    if (!audioResponse.ok) {
      console.error("[VoiceAnalyzer] Twilio download failed:", {
        status: audioResponse.status,
        url: audioUrl,
      });
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();

    // 2. Send to Deepgram with word-level timing
    const dgResponse = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=pl&punctuate=true&utterances=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": "audio/wav",
        },
        body: audioBuffer,
      },
    );

    if (!dgResponse.ok) {
      console.error("[VoiceAnalyzer] Deepgram error:", {
        status: dgResponse.status,
      });
      return null;
    }

    const result = await dgResponse.json();
    const words: DeepgramWord[] =
      result.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    const duration: number =
      result.metadata?.duration ||
      (words.length > 0 ? words[words.length - 1].end : 0);

    if (words.length === 0 || duration === 0) {
      logger.warn("[VoiceAnalyzer] No words detected in recording");
      return null;
    }

    return computeProsodyFromTimings(words, duration);
  } catch (error) {
    console.error("[VoiceAnalyzer] Analysis failed:", {
      error: error instanceof Error ? error.message : error,
      recordingUrl,
    });
    return null;
  }
}

// ============================================================================
// PROSODY COMPUTATION (pure function)
// ============================================================================

/**
 * Compute prosody features from Deepgram word timing array.
 * Pure function, no I/O.
 */
export function computeProsodyFromTimings(
  words: DeepgramWord[],
  totalDurationSec: number,
): VoiceFeatures {
  if (words.length === 0 || totalDurationSec <= 0) {
    return {
      pitch_mean: 0,
      pitch_variance: 0,
      speech_rate: 0,
      energy: 0,
      pause_frequency: 0,
      pause_duration_avg: 0,
    };
  }

  // Speech rate: words per minute
  const speechRate = (words.length / totalDurationSec) * 60;

  // Pause detection: gap > PAUSE_THRESHOLD between consecutive words
  const pauses: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > PAUSE_THRESHOLD_SEC) {
      pauses.push(gap);
    }
  }

  const durationMinutes = totalDurationSec / 60;
  const pauseFrequency =
    durationMinutes > 0 ? pauses.length / durationMinutes : 0;
  const pauseDurationAvg =
    pauses.length > 0 ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0;

  return {
    pitch_mean: 0, // Not available from word timings (Phase 3)
    pitch_variance: 0,
    speech_rate: Math.round(speechRate * 10) / 10,
    energy: 0, // Not available from word timings (Phase 3)
    pause_frequency: Math.round(pauseFrequency * 10) / 10,
    pause_duration_avg: Math.round(pauseDurationAvg * 100) / 100,
  };
}
