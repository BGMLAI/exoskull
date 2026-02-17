/**
 * Notes API
 *
 * Universal content container for all note formats:
 * text, image, audio, video, url, social, message, document, code
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { generateAndStoreNoteEmbedding } from "@/lib/memory/note-embeddings";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

type NoteType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "url"
  | "social"
  | "message"
  | "document"
  | "code";

// ============================================================================
// GET - List/search notes
// ============================================================================

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as NoteType | null;
    const loopSlug = searchParams.get("loop");
    const opId = searchParams.get("opId");
    const questId = searchParams.get("questId");
    const isResearch = searchParams.get("isResearch");
    const isExperience = searchParams.get("isExperience");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("user_notes")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("captured_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq("type", type);
    if (loopSlug) query = query.eq("loop_slug", loopSlug);
    if (opId) query = query.eq("op_id", opId);
    if (questId) query = query.eq("quest_id", questId);
    if (isResearch === "true") query = query.eq("is_research", true);
    if (isExperience === "true") query = query.eq("is_experience", true);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,content.ilike.%${search}%,ai_summary.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[Notes API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      notes: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Notes API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// POST - Create note
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const {
      type,
      title,
      content,
      mediaUrl,
      sourceUrl,
      metadata,
      opId,
      questId,
      loopSlug,
      tags,
      isResearch,
      isExperience,
      sourceType,
      sourceId,
      capturedAt,
    } = body;

    if (!type) {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }

    // Validate type
    const validTypes: NoteType[] = [
      "text",
      "image",
      "audio",
      "video",
      "url",
      "social",
      "message",
      "document",
      "code",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_notes")
      .insert({
        tenant_id: tenantId,
        type,
        title,
        content,
        media_url: mediaUrl,
        source_url: sourceUrl,
        metadata: metadata || {},
        op_id: opId,
        quest_id: questId,
        loop_slug: loopSlug,
        tags: tags || [],
        is_research: isResearch || false,
        is_experience: isExperience || false,
        source_type: sourceType || "manual",
        source_id: sourceId,
        captured_at: capturedAt || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[Notes API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Fire-and-forget: generate embedding for the note (does not block response)
    if (data?.id && (content || title)) {
      generateAndStoreNoteEmbedding(data.id, content, title).catch(() => {});
    }

    return NextResponse.json({ success: true, note: data });
  } catch (error) {
    console.error("[Notes API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// PATCH - Update note
// ============================================================================

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { noteId, ...updates } = body;

    if (!noteId) {
      return NextResponse.json({ error: "noteId required" }, { status: 400 });
    }

    // Map camelCase to snake_case
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.content !== undefined) dbUpdates.content = updates.content;
    if (updates.mediaUrl !== undefined) dbUpdates.media_url = updates.mediaUrl;
    if (updates.sourceUrl !== undefined)
      dbUpdates.source_url = updates.sourceUrl;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
    if (updates.opId !== undefined) dbUpdates.op_id = updates.opId;
    if (updates.questId !== undefined) dbUpdates.quest_id = updates.questId;
    if (updates.loopSlug !== undefined) dbUpdates.loop_slug = updates.loopSlug;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
    if (updates.isResearch !== undefined)
      dbUpdates.is_research = updates.isResearch;
    if (updates.isExperience !== undefined)
      dbUpdates.is_experience = updates.isExperience;

    const { data, error } = await supabase
      .from("user_notes")
      .update(dbUpdates)
      .eq("id", noteId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Notes API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, note: data });
  } catch (error) {
    console.error("[Notes API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// DELETE - Delete note
// ============================================================================

export const DELETE = withApiLog(async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json({ error: "noteId required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_notes")
      .delete()
      .eq("id", noteId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Notes API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notes API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
