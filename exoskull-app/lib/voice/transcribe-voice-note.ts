/**
 * Voice Note Transcription — Reusable Library
 *
 * 3-tier fallback: Groq Whisper → ElevenLabs → Deepgram
 * Includes Whisper hallucination detection for Polish.
 */

import { transcribeAudio, type STTResult } from "./elevenlabs-stt";

import { logger } from "@/lib/logger";

const STT_TIMEOUT_MS = 30_000; // 30s timeout for transcription API calls
// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptionResult {
  text: string;
  provider: "groq" | "elevenlabs" | "deepgram";
}

export interface TranscriptionOptions {
  language?: string;
}

// ============================================================================
// HALLUCINATION DETECTION (extracted from /api/voice/transcribe)
// ============================================================================

/**
 * Detect Whisper hallucinations — repetitive patterns on silence/noise.
 * e.g. "Dziękuję. Dziękuję. Dziękuję." or "Napisy tworzone..."
 */
export function isHallucination(text: string): boolean {
  const t = text.trim();
  if (!t) return true;

  const hallucinations = [
    /^(dziękuję[.\s!]*)+$/i,
    /^(napisy (stworzone|tworzone|wykonane).*)+$/i,
    /^(subskrybuj[.\s!]*)+$/i,
    /^(do zobaczenia[.\s!]*)+$/i,
    /^(hej[.\s!]*)+$/i,
    /^(cześć[.\s!]*)+$/i,
    /^\.+$/,
    // Classic Whisper Polish hallucinations on silence/noise/short audio
    /wszelkie prawa zastrzeżone/i,
    /dziękuję za uwagę/i,
    /dziękuję za obejrzenie/i,
    /zapraszam do subskrypcji/i,
    /podoba ci się ten film/i,
    /tłumaczenie:/i,
    /redakcja i korekta/i,
    /^www\.\S+$/i,
    /społeczność amara/i,
    /proszę o subskrypcję/i,
    /dziękuję za wysłuchanie/i,
    /prosimy o subskrybowanie/i,
    /^to (jest|był[ao]?) (wszystko|tyle)/i,
    // YouTube outro / background noise phrases
    /nie zapomnijcie zasubskrybować/i,
    /zafollowować mnie na/i,
    /zobaczcie co się wydarzyło/i,
    /dziękuję za oglądanie/i,
    /dzięk(i|uje) za ogl[aą]danie/i,
    /praca na farmie w danii/i,
    /zostaw(cie)? (łapkę|lajka|kciuka)/i,
    /dajcie znać w komentarz/i,
    /^(dzień dobry[.\s]*){2,}$/i,
    /^(halo[.\s?]*){3,}$/i,
  ];

  for (const pattern of hallucinations) {
    if (pattern.test(t)) return true;
  }

  // Repetition detection: if >60% of words are the same word
  const words = t
    .toLowerCase()
    .replace(/[.!?,]+/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length >= 4) {
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    const maxFreq = Math.max(...freq.values());
    if (maxFreq / words.length >= 0.5) return true;
  }

  return false;
}

// ============================================================================
// GROQ WHISPER (PRIMARY)
// ============================================================================

async function transcribeWithGroq(
  audioBuffer: ArrayBuffer,
  language: string,
): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");
  formData.append("temperature", "0.0");
  // No prompt — reduces hallucinations on short/noisy audio

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
      signal: controller.signal,
    },
  ).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[TranscribeLib] Groq API error:", {
      status: response.status,
      error: errorText,
    });
    return null;
  }

  const result = await response.json();
  const transcript = (result.text || "").trim();

  // Filter hallucinations
  if (isHallucination(transcript)) {
    logger.info("[TranscribeLib] Groq hallucination filtered:", transcript);
    return "";
  }

  // Filter segments with high no_speech_prob (0.6 threshold)
  if (result.segments?.length) {
    const realSegments = result.segments.filter(
      (s: { no_speech_prob?: number }) => (s.no_speech_prob || 0) < 0.6,
    );
    if (realSegments.length === 0) {
      logger.info("[TranscribeLib] All segments have high no_speech_prob");
      return "";
    }
  }

  return transcript;
}

// ============================================================================
// MAIN: transcribeVoiceNote
// ============================================================================

/**
 * Transcribe audio buffer with 3-tier fallback:
 * 1. Groq Whisper (fastest, free tier)
 * 2. ElevenLabs Scribe (fallback)
 * 3. Deepgram (fallback)
 *
 * Returns empty text for silence/noise (not an error).
 */
export async function transcribeVoiceNote(
  audioBuffer: ArrayBuffer,
  options: TranscriptionOptions = {},
): Promise<TranscriptionResult> {
  const language = options.language || "pl";

  // Reject too-small files (noise/clicks)
  if (audioBuffer.byteLength < 5000) {
    logger.info(
      "[TranscribeLib] Audio too small:",
      audioBuffer.byteLength,
      "bytes",
    );
    return { text: "", provider: "groq" };
  }

  // Tier 1: Groq Whisper
  try {
    const groqResult = await transcribeWithGroq(audioBuffer, language);
    if (groqResult !== null) {
      logger.info("[TranscribeLib] Groq succeeded:", {
        textLength: groqResult.length,
      });
      return { text: groqResult, provider: "groq" };
    }
  } catch (error) {
    logger.warn("[TranscribeLib] Groq failed:", (error as Error).message);
  }

  // Tier 2+3: ElevenLabs → Deepgram (unified fallback)
  try {
    const fallbackResult: STTResult = await transcribeAudio(audioBuffer, {
      language,
    });

    const text = fallbackResult.text?.trim() || "";
    if (isHallucination(text)) {
      return { text: "", provider: "elevenlabs" };
    }

    // Determine which provider actually succeeded
    const provider =
      fallbackResult.confidence !== undefined ? "deepgram" : "elevenlabs";
    logger.info("[TranscribeLib] Fallback succeeded:", {
      provider,
      textLength: text.length,
    });
    return { text, provider: provider as "elevenlabs" | "deepgram" };
  } catch (error) {
    logger.error("[TranscribeLib] All providers failed:", {
      error: (error as Error).message,
    });
    throw new Error(
      `Transcription failed on all providers: ${(error as Error).message}`,
    );
  }
}
