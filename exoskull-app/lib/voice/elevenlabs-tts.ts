/**
 * Cartesia Text-to-Speech (Sonic 3)
 *
 * Generates speech audio from text using Cartesia API.
 * Supports caching to reduce API costs.
 *
 * Migration: Replaced ElevenLabs Turbo v2.5 with Cartesia Sonic 3 (5x cheaper, 2x faster TTFA).
 * File name kept as elevenlabs-tts.ts to avoid changing imports across consumers.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

import { logger } from "@/lib/logger";
// ============================================================================
// CONFIGURATION
// ============================================================================

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!;
// Default: "Tomek - Casual Companion" (energetic male, casual conversations, Polish)
const CARTESIA_VOICE_ID =
  process.env.CARTESIA_VOICE_ID || "82a7fc13-2927-4e42-9b8a-bb1f9e506521";
const CARTESIA_MODEL = "sonic-3";
const CARTESIA_API_VERSION = "2025-04-16";

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
  language?: string;
  speed?: number;
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
 * Generate speech audio from text using Cartesia Sonic 3
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {},
): Promise<ArrayBuffer> {
  const voiceId = options.voiceId || CARTESIA_VOICE_ID;
  const language = options.language || "pl";

  if (!CARTESIA_API_KEY) {
    throw new Error("[Cartesia TTS] Missing CARTESIA_API_KEY");
  }

  const startTime = Date.now();

  // Timeout: 5 seconds — if Cartesia doesn't respond, fallback to Twilio voice
  const TTS_TIMEOUT_MS = 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": CARTESIA_API_KEY,
        "Cartesia-Version": CARTESIA_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice: { mode: "id", id: voiceId },
        output_format: {
          container: "mp3",
          encoding: "mp3",
          sample_rate: 44100,
        },
        language,
        ...(options.speed ? { speed: options.speed } : {}),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Cartesia TTS] API Error:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Cartesia TTS failed: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const durationMs = Date.now() - startTime;

    logger.info("[Cartesia TTS] Generated:", {
      textLength: text.length,
      audioBytes: audioBuffer.byteLength,
      durationMs,
    });

    return audioBuffer;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(
          "[Cartesia TTS] Timeout po 5s - fallback do Twilio voice",
        );
        throw new Error("Cartesia TTS timeout - using fallback voice");
      }
      console.error("[Cartesia TTS] Error:", {
        name: error.name,
        message: error.message,
        voiceId,
      });
    } else {
      console.error("[Cartesia TTS] Unknown error:", error);
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
function hashText(text: string, voiceId: string = CARTESIA_VOICE_ID): string {
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
    console.error("[Cartesia TTS] Upload error:", uploadError);
    throw new Error(`Failed to upload TTS audio: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(AUDIO_BUCKET)
    .getPublicUrl(fileName);

  logger.info("[Cartesia TTS] Uploaded audio:", fileName);

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

    logger.info("[Cartesia TTS] Cache hit:", cacheKey);

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
    .then(() => logger.info("[Cartesia TTS] Cached:", cacheKey))
    .catch((err) => logger.warn("[Cartesia TTS] Cache write failed:", err));

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
  logger.info("[Cartesia TTS] Pre-caching common phrases...");

  for (const phrase of COMMON_PHRASES) {
    try {
      const cacheKey = hashText(phrase);
      const supabase = getSupabaseClient();

      // Check if already cached
      const { data } = await supabase.storage
        .from(AUDIO_BUCKET)
        .list("cache", { search: `${cacheKey}.mp3` });

      if (data && data.length > 0) {
        logger.info("[Cartesia TTS] Already cached:", phrase.substring(0, 30));
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

      logger.info("[Cartesia TTS] Cached:", phrase.substring(0, 30));

      // Rate limit: wait 200ms between requests (Cartesia is faster than ElevenLabs)
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("[Cartesia TTS] Failed to cache phrase:", phrase, error);
    }
  }

  logger.info("[Cartesia TTS] Pre-caching complete");
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
    console.error("[Cartesia TTS] List error:", listError);
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
    console.error("[Cartesia TTS] Delete error:", deleteError);
    return;
  }

  logger.info("[Cartesia TTS] Cleaned up session audio:", sessionId);
}
