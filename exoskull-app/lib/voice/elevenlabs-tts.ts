/**
 * ElevenLabs Text-to-Speech
 *
 * Generates speech audio from text using ElevenLabs API.
 * Supports caching to reduce API costs.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "Qs4qmNrqlneCgYPLSNQ7";
const ELEVENLABS_MODEL = "eleven_turbo_v2_5"; // Lowest latency model

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Storage bucket for TTS audio
const AUDIO_BUCKET = "voice-audio";

// ============================================================================
// TYPES
// ============================================================================

export interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  audioUrl?: string;
  cached: boolean;
  durationMs?: number;
}

// ============================================================================
// CORE TTS FUNCTION
// ============================================================================

/**
 * Generate speech audio from text
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {},
): Promise<ArrayBuffer> {
  const {
    voiceId = ELEVENLABS_VOICE_ID,
    modelId = ELEVENLABS_MODEL,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
    useSpeakerBoost = true,
  } = options;

  if (!ELEVENLABS_API_KEY) {
    throw new Error("[ElevenLabs TTS] Missing ELEVENLABS_API_KEY");
  }

  const startTime = Date.now();

  // Timeout: 5 sekund - jeśli ElevenLabs nie odpowie, fallback do Twilio
  const TTS_TIMEOUT_MS = 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
          },
        }),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ElevenLabs TTS] API Error:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(
        `ElevenLabs TTS failed: ${response.status} - ${errorText}`,
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const durationMs = Date.now() - startTime;

    console.log("[ElevenLabs TTS] Generated:", {
      textLength: text.length,
      audioBytes: audioBuffer.byteLength,
      durationMs,
    });

    return audioBuffer;
  } catch (error) {
    // Szczegółowe logowanie błędów
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(
          "[ElevenLabs TTS] Timeout po 5s - fallback do Twilio voice",
        );
        throw new Error("ElevenLabs TTS timeout - using fallback voice");
      }
      console.error("[ElevenLabs TTS] Error:", {
        name: error.name,
        message: error.message,
        voiceId,
      });
    } else {
      console.error("[ElevenLabs TTS] Unknown error:", error);
    }
    throw error;
  }
}

// ============================================================================
// CACHING & STORAGE
// ============================================================================

/**
 * Generate hash for caching
 */
function hashText(text: string, voiceId: string = ELEVENLABS_VOICE_ID): string {
  return crypto.createHash("md5").update(`${voiceId}:${text}`).digest("hex");
}

/**
 * Get Supabase client for storage operations
 */
function getSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Upload audio buffer to Supabase Storage and return public URL
 */
export async function uploadTTSAudio(
  audioBuffer: ArrayBuffer,
  sessionId: string,
  messageIndex: number,
): Promise<string> {
  const supabase = getSupabaseClient();
  const fileName = `${sessionId}/${messageIndex}-${Date.now()}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(fileName, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error("[ElevenLabs TTS] Upload error:", uploadError);
    throw new Error(`Failed to upload TTS audio: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(AUDIO_BUCKET)
    .getPublicUrl(fileName);

  console.log("[ElevenLabs TTS] Uploaded audio:", fileName);

  return urlData.publicUrl;
}

/**
 * Generate TTS and upload to storage, with optional caching
 */
export async function generateAndUploadTTS(
  text: string,
  sessionId: string,
  messageIndex: number,
  options: TTSOptions = {},
): Promise<TTSResult> {
  const cacheKey = hashText(text, options.voiceId);
  const supabase = getSupabaseClient();

  // Check cache first
  const cachedPath = `cache/${cacheKey}.mp3`;
  const { data: cachedFile } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(cachedPath);

  if (cachedFile) {
    const { data: urlData } = supabase.storage
      .from(AUDIO_BUCKET)
      .getPublicUrl(cachedPath);

    console.log("[ElevenLabs TTS] Cache hit:", cacheKey);

    return {
      audioBuffer: await cachedFile.arrayBuffer(),
      audioUrl: urlData.publicUrl,
      cached: true,
    };
  }

  // Generate new TTS
  const audioBuffer = await textToSpeech(text, options);

  // Upload to session-specific path
  const audioUrl = await uploadTTSAudio(audioBuffer, sessionId, messageIndex);

  // Also cache for future use (don't await to not block)
  supabase.storage
    .from(AUDIO_BUCKET)
    .upload(cachedPath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    })
    .then(() => console.log("[ElevenLabs TTS] Cached:", cacheKey))
    .catch((err) => console.warn("[ElevenLabs TTS] Cache write failed:", err));

  return {
    audioBuffer,
    audioUrl,
    cached: false,
  };
}

// ============================================================================
// COMMON PHRASES (PRE-CACHED)
// ============================================================================

const COMMON_PHRASES = [
  "Cześć! Tu IORS. W czym mogę pomóc?",
  "Do usłyszenia!",
  "Jasne.",
  "Ok, zrobione.",
  "Dodane.",
  "Przepraszam, nie zrozumiałem.",
  "Czy jest coś jeszcze?",
  "Miłego dnia!",
];

/**
 * Pre-cache common phrases to reduce latency
 * Run this on app startup or via cron
 */
export async function precacheCommonPhrases(): Promise<void> {
  console.log("[ElevenLabs TTS] Pre-caching common phrases...");

  for (const phrase of COMMON_PHRASES) {
    try {
      const cacheKey = hashText(phrase);
      const supabase = getSupabaseClient();

      // Check if already cached
      const { data } = await supabase.storage
        .from(AUDIO_BUCKET)
        .list("cache", { search: `${cacheKey}.mp3` });

      if (data && data.length > 0) {
        console.log(
          "[ElevenLabs TTS] Already cached:",
          phrase.substring(0, 30),
        );
        continue;
      }

      // Generate and cache
      const audioBuffer = await textToSpeech(phrase);
      await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(`cache/${cacheKey}.mp3`, audioBuffer, {
          contentType: "audio/mpeg",
          upsert: true,
        });

      console.log("[ElevenLabs TTS] Cached:", phrase.substring(0, 30));

      // Rate limit: wait 500ms between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("[ElevenLabs TTS] Failed to cache phrase:", phrase, error);
    }
  }

  console.log("[ElevenLabs TTS] Pre-caching complete");
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Delete session audio files after call ends
 */
export async function cleanupSessionAudio(sessionId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: files, error: listError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .list(sessionId);

  if (listError) {
    console.error("[ElevenLabs TTS] List error:", listError);
    return;
  }

  if (!files || files.length === 0) {
    return;
  }

  const filesToDelete = files.map((f) => `${sessionId}/${f.name}`);

  const { error: deleteError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .remove(filesToDelete);

  if (deleteError) {
    console.error("[ElevenLabs TTS] Delete error:", deleteError);
    return;
  }

  console.log("[ElevenLabs TTS] Cleaned up session audio:", sessionId);
}
