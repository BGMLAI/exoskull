import { NextRequest, NextResponse } from "next/server";
import { CACHED_PHRASES } from "@/lib/voice/audio-cache";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// Cartesia Sonic 3 voice settings
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY!;
const CARTESIA_VOICE_ID =
  process.env.CARTESIA_VOICE_ID || "82a7fc13-2927-4e42-9b8a-bb1f9e506521";
const CARTESIA_MODEL = "sonic-3";
const CARTESIA_API_VERSION = "2025-04-16";

/**
 * POST /api/audio/generate-cache
 *
 * Generates and caches all predefined audio phrases using Cartesia Sonic 3.
 * This should be run once to populate the cache, then periodically to refresh.
 *
 * Body (optional):
 * - keys: string[] - specific keys to generate (default: all)
 * - force: boolean - regenerate even if exists (default: false)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();

    if (!CARTESIA_API_KEY) {
      return NextResponse.json(
        {
          error: "CARTESIA_API_KEY not configured",
          hint: "Add CARTESIA_API_KEY to .env.local",
        },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedKeys = body.keys as string[] | undefined;
    const force = (body.force as boolean) || false;

    const results: Record<
      string,
      { success: boolean; error?: string; skipped?: boolean }
    > = {};

    // Filter phrases to generate
    const phrasesToGenerate = requestedKeys
      ? CACHED_PHRASES.filter((p) => requestedKeys.includes(p.key))
      : CACHED_PHRASES;

    logger.info(`🎙️ Generating ${phrasesToGenerate.length} audio phrases...`);

    for (const phrase of phrasesToGenerate) {
      // Check if already exists (unless force)
      if (!force) {
        const { data: existing } = await supabase.storage
          .from("audio-cache")
          .list("", { search: `${phrase.key}.mp3` });

        if (existing && existing.length > 0) {
          results[phrase.key] = { success: true, skipped: true };
          logger.info(`⏭️ Skipped ${phrase.key} (already exists)`);
          continue;
        }
      }

      try {
        // Generate audio with Cartesia Sonic 3
        const audioResponse = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": CARTESIA_API_KEY,
            "Cartesia-Version": CARTESIA_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: CARTESIA_MODEL,
            transcript: phrase.text,
            voice: { mode: "id", id: CARTESIA_VOICE_ID },
            output_format: {
              container: "mp3",
              encoding: "mp3",
              sample_rate: 44100,
            },
            language: "pl",
          }),
        });

        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          throw new Error(
            `Cartesia API error: ${audioResponse.status} - ${errorText}`,
          );
        }

        // Get audio as blob
        const audioBlob = await audioResponse.blob();

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("audio-cache")
          .upload(`${phrase.key}.mp3`, audioBlob, {
            contentType: "audio/mpeg",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Upload error: ${uploadError.message}`);
        }

        results[phrase.key] = { success: true };
        logger.info(`✅ Generated ${phrase.key}: "${phrase.text}"`);

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results[phrase.key] = { success: false, error: errorMessage };
        console.error(`❌ Failed ${phrase.key}:`, errorMessage);
      }
    }

    // Summary
    const successful = Object.values(results).filter(
      (r) => r.success && !r.skipped,
    ).length;
    const skipped = Object.values(results).filter((r) => r.skipped).length;
    const failed = Object.values(results).filter((r) => !r.success).length;

    return NextResponse.json({
      summary: {
        total: phrasesToGenerate.length,
        generated: successful,
        skipped,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error("❌ Audio cache generation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/audio/generate-cache
 *
 * Returns list of all cached phrases and their status
 */
export async function GET() {
  try {
    const supabase = getServiceSupabase();
    // List all files in audio-cache bucket
    const { data: files, error } = await supabase.storage
      .from("audio-cache")
      .list();

    if (error) {
      throw error;
    }

    const cachedKeys = new Set(
      files?.map((f) => f.name.replace(".mp3", "")) || [],
    );

    // Build status for each phrase
    const status = CACHED_PHRASES.map((phrase) => ({
      key: phrase.key,
      text: phrase.text,
      category: phrase.category,
      cached: cachedKeys.has(phrase.key),
    }));

    return NextResponse.json({
      total: CACHED_PHRASES.length,
      cached: cachedKeys.size,
      missing: CACHED_PHRASES.length - cachedKeys.size,
      phrases: status,
    });
  } catch (error) {
    console.error("❌ Error fetching cache status:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
