import { logger } from "@/lib/logger";
/**
 * ElevenLabs Speech-to-Text
 *
 * Transcribes audio to text using ElevenLabs Scribe API.
 * Used as backup when Twilio's built-in STT is not available (e.g., for recordings).
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const DEFAULT_LANGUAGE = "pl"; // Polish

// ============================================================================
// TYPES
// ============================================================================

export interface STTOptions {
  language?: string;
  modelId?: string;
}

export interface STTResult {
  text: string;
  confidence?: number;
  durationMs?: number;
  language?: string;
}

// ============================================================================
// CORE STT FUNCTION
// ============================================================================

/**
 * Transcribe audio buffer to text
 */
export async function speechToText(
  audioBuffer: ArrayBuffer,
  options: STTOptions = {},
): Promise<STTResult> {
  const { language = DEFAULT_LANGUAGE, modelId = "scribe_v1" } = options;

  if (!ELEVENLABS_API_KEY) {
    throw new Error("[ElevenLabs STT] Missing ELEVENLABS_API_KEY");
  }

  const startTime = Date.now();

  try {
    const formData = new FormData();
    formData.append("audio", new Blob([audioBuffer]), "audio.wav");
    formData.append("model_id", modelId);
    formData.append("language_code", language);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs STT] API Error:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(
        `ElevenLabs STT failed: ${response.status} - ${errorText}`,
      );
    }

    const result = await response.json();
    const durationMs = Date.now() - startTime;

    logger.info("[ElevenLabs STT] Transcribed:", {
      textLength: result.text?.length || 0,
      durationMs,
      language,
    });

    return {
      text: result.text || "",
      confidence: result.confidence,
      durationMs,
      language,
    };
  } catch (error) {
    console.error("[ElevenLabs STT] Error:", error);
    throw error;
  }
}

/**
 * Transcribe audio from URL (e.g., Twilio recording URL)
 */
export async function speechToTextFromUrl(
  audioUrl: string,
  options: STTOptions = {},
): Promise<STTResult> {
  const startTime = Date.now();

  try {
    // Download audio from URL
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const downloadTime = Date.now() - startTime;

    logger.info("[ElevenLabs STT] Downloaded audio:", {
      url: audioUrl.substring(0, 50),
      bytes: audioBuffer.byteLength,
      downloadTimeMs: downloadTime,
    });

    // Transcribe the downloaded audio
    return await speechToText(audioBuffer, options);
  } catch (error) {
    console.error("[ElevenLabs STT] Error transcribing from URL:", error);
    throw error;
  }
}

// ============================================================================
// DEEPGRAM FALLBACK
// ============================================================================

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Fallback to Deepgram STT if ElevenLabs fails
 * Deepgram is already configured in the project
 */
export async function speechToTextDeepgram(
  audioBuffer: ArrayBuffer,
  options: { language?: string } = {},
): Promise<STTResult> {
  const { language = "pl" } = options;

  if (!DEEPGRAM_API_KEY) {
    throw new Error("[Deepgram STT] Missing DEEPGRAM_API_KEY");
  }

  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://api.deepgram.com/v1/listen?language=${language}&smart_format=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/wav",
        },
        body: audioBuffer,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Deepgram STT] API Error:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Deepgram STT failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const durationMs = Date.now() - startTime;

    const transcript =
      result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    const confidence =
      result.results?.channels?.[0]?.alternatives?.[0]?.confidence;

    logger.info("[Deepgram STT] Transcribed:", {
      textLength: transcript.length,
      durationMs,
      confidence,
    });

    return {
      text: transcript,
      confidence,
      durationMs,
      language,
    };
  } catch (error) {
    console.error("[Deepgram STT] Error:", error);
    throw error;
  }
}

// ============================================================================
// UNIFIED STT FUNCTION (WITH FALLBACK)
// ============================================================================

/**
 * Transcribe audio with automatic fallback
 * Tries ElevenLabs first, falls back to Deepgram if available
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  options: STTOptions = {},
): Promise<STTResult> {
  try {
    // Try ElevenLabs first
    return await speechToText(audioBuffer, options);
  } catch (elevenLabsError) {
    logger.warn(
      "[STT] ElevenLabs failed, trying Deepgram fallback:",
      elevenLabsError,
    );

    if (DEEPGRAM_API_KEY) {
      return await speechToTextDeepgram(audioBuffer, options);
    }

    // No fallback available, re-throw original error
    throw elevenLabsError;
  }
}

/**
 * Transcribe audio from URL with automatic fallback
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  options: STTOptions = {},
): Promise<STTResult> {
  // Download audio once
  const audioResponse = await fetch(audioUrl);

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }

  const audioBuffer = await audioResponse.arrayBuffer();

  // Use unified transcription
  return await transcribeAudio(audioBuffer, options);
}
