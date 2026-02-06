/**
 * Voice Transcription CRON Worker
 *
 * Processes voice notes with status="uploaded", transcribes audio,
 * and updates the database with the transcript.
 *
 * Schedule: Every 1 minute
 * Batch size: Up to 3 notes per invocation (safe within 60s Vercel timeout)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron/auth";
import { transcribeVoiceNote } from "@/lib/voice/transcribe-voice-note";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BATCH_SIZE = 3;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const supabase = getSupabase();
  let processed = 0;
  let failed = 0;

  try {
    // 1. Release stuck "processing" notes (older than 5 minutes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from("exo_voice_notes")
      .update({ status: "uploaded" })
      .eq("status", "processing")
      .lt("updated_at", fiveMinAgo)
      .select("id");

    if (stuck?.length) {
      console.log("[VoiceCRON] Released stuck notes:", stuck.length);
    }

    // 2. Fetch pending voice notes
    const { data: pendingNotes, error: fetchError } = await supabase
      .from("exo_voice_notes")
      .select("id, audio_path, transcript_language")
      .eq("status", "uploaded")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("[VoiceCRON] Fetch error:", fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingNotes?.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        pending: 0,
        durationMs: Date.now() - startTime,
      });
    }

    // 3. Process each note
    for (const note of pendingNotes) {
      try {
        // Claim: set status to processing
        await supabase
          .from("exo_voice_notes")
          .update({ status: "processing" })
          .eq("id", note.id)
          .eq("status", "uploaded"); // Optimistic lock

        // Download audio from Supabase Storage
        const { data: audioData, error: downloadError } = await supabase.storage
          .from("voice-notes")
          .download(note.audio_path);

        if (downloadError || !audioData) {
          console.error("[VoiceCRON] Download failed:", {
            noteId: note.id,
            path: note.audio_path,
            error: downloadError?.message,
          });
          await supabase
            .from("exo_voice_notes")
            .update({ status: "failed" })
            .eq("id", note.id);
          failed++;
          continue;
        }

        const audioBuffer = await audioData.arrayBuffer();

        // Transcribe
        const result = await transcribeVoiceNote(audioBuffer, {
          language: note.transcript_language || "pl",
        });

        // Update DB with transcript
        await supabase
          .from("exo_voice_notes")
          .update({
            transcript: result.text,
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", note.id);

        console.log("[VoiceCRON] Transcribed:", {
          noteId: note.id,
          provider: result.provider,
          textLength: result.text.length,
        });
        processed++;
      } catch (error) {
        console.error("[VoiceCRON] Processing failed:", {
          noteId: note.id,
          error: (error as Error).message,
        });
        await supabase
          .from("exo_voice_notes")
          .update({ status: "failed" })
          .eq("id", note.id);
        failed++;
      }
    }

    // 4. Count remaining
    const { count: pending } = await supabase
      .from("exo_voice_notes")
      .select("id", { count: "exact", head: true })
      .eq("status", "uploaded");

    return NextResponse.json({
      ok: true,
      processed,
      failed,
      pending: pending || 0,
      releasedStuck: stuck?.length || 0,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[VoiceCRON] Error:", error);
    return NextResponse.json(
      {
        error: "Voice transcription CRON failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
