/**
 * Voice Notes API
 *
 * POST /api/voice/notes - Upload a voice note
 * GET /api/voice/notes - List voice notes
 * DELETE /api/voice/notes - Delete a voice note
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/voice/notes
 * Upload a new voice note
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const tenantId = formData.get("tenant_id") as string | null;
    const duration = formData.get("duration") as string | null;
    const contextType = formData.get("context_type") as string | null;
    const linkedTaskId = formData.get("linked_task_id") as string | null;

    if (!audio) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    // Generate unique filename
    const ext = audio.name.split(".").pop() || "webm";
    const filename = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("voice-notes")
      .upload(filename, audio, {
        contentType: audio.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Voice note upload error:", uploadError);
      return NextResponse.json(
        {
          error: `Upload failed: ${uploadError.message}`,
        },
        { status: 500 },
      );
    }

    // Create voice note record
    const { data: voiceNote, error: dbError } = await supabase
      .from("exo_voice_notes")
      .insert({
        tenant_id: tenantId,
        audio_path: uploadData.path,
        duration_seconds: duration ? parseFloat(duration) : null,
        file_size: audio.size,
        context_type: contextType || "quick_note",
        linked_task_id: linkedTaskId || null,
        status: "uploaded",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Voice note DB error:", dbError);
      // Try to clean up the uploaded file
      await supabase.storage.from("voice-notes").remove([filename]);
      return NextResponse.json(
        {
          error: `Database error: ${dbError.message}`,
        },
        { status: 500 },
      );
    }

    // Queue for transcription (async)
    // In production, this would trigger a background job
    // For now, we'll transcribe inline if the file is small
    if (audio.size < 5 * 1024 * 1024) {
      // < 5MB
      await queueTranscription(voiceNote.id);
    }

    return NextResponse.json({
      success: true,
      voice_note: {
        id: voiceNote.id,
        duration_seconds: voiceNote.duration_seconds,
        status: voiceNote.status,
        context_type: voiceNote.context_type,
      },
    });
  } catch (error) {
    console.error("POST /api/voice/notes error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/voice/notes
 * List voice notes for a tenant
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const tenantId = req.nextUrl.searchParams.get("tenant_id");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
    const contextType = req.nextUrl.searchParams.get("context_type");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    let query = supabase
      .from("exo_voice_notes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (contextType) {
      query = query.eq("context_type", contextType);
    }

    const { data: voiceNotes, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get signed URLs for audio playback
    const notesWithUrls = await Promise.all(
      (voiceNotes || []).map(async (note) => {
        const { data: signedUrl } = await supabase.storage
          .from("voice-notes")
          .createSignedUrl(note.audio_path, 3600); // 1 hour expiry

        return {
          ...note,
          audio_url: signedUrl?.signedUrl || null,
        };
      }),
    );

    return NextResponse.json({
      voice_notes: notesWithUrls,
    });
  } catch (error) {
    console.error("GET /api/voice/notes error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/voice/notes
 * Delete a voice note
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const { tenant_id, voice_note_id } = body;

    if (!tenant_id || !voice_note_id) {
      return NextResponse.json(
        {
          error: "tenant_id and voice_note_id required",
        },
        { status: 400 },
      );
    }

    // Get voice note to find audio path
    const { data: voiceNote, error: fetchError } = await supabase
      .from("exo_voice_notes")
      .select("audio_path")
      .eq("id", voice_note_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (fetchError || !voiceNote) {
      return NextResponse.json(
        { error: "Voice note not found" },
        { status: 404 },
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("voice-notes")
      .remove([voiceNote.audio_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
    }

    // Delete record
    const { error: deleteError } = await supabase
      .from("exo_voice_notes")
      .delete()
      .eq("id", voice_note_id)
      .eq("tenant_id", tenant_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/voice/notes error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Queue voice note for transcription
 * In production, this would be a background job
 */
async function queueTranscription(voiceNoteId: string) {
  // Update status to processing
  await getSupabase()
    .from("exo_voice_notes")
    .update({ status: "processing" })
    .eq("id", voiceNoteId);

  // TODO: Implement actual transcription via Deepgram/Whisper
  // For now, just mark as ready for transcription
  console.log(`Voice note ${voiceNoteId} queued for transcription`);
}
