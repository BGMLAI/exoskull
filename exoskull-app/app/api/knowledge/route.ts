/**
 * Knowledge API
 *
 * GET /api/knowledge - List user's documents
 * DELETE /api/knowledge - Delete a document
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge
 * List user's documents with optional filtering
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const tenantId = req.nextUrl.searchParams.get("tenant_id");
    const category = req.nextUrl.searchParams.get("category");
    const status = req.nextUrl.searchParams.get("status");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    let query = supabase
      .from("exo_user_documents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: documents, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get stats
    const { data: stats } = await supabase.rpc("get_document_stats", {
      p_tenant_id: tenantId,
    });

    return NextResponse.json({
      documents: documents || [],
      stats: stats?.[0] || {
        total_documents: 0,
        total_chunks: 0,
        by_category: {},
        by_status: {},
      },
    });
  } catch (error) {
    console.error("GET /api/knowledge error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/knowledge
 * Delete a document and its storage file
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await req.json();
    const { tenant_id, document_id } = body;

    if (!tenant_id || !document_id) {
      return NextResponse.json(
        {
          error: "tenant_id and document_id required",
        },
        { status: 400 },
      );
    }

    // Get document to find storage path
    const { data: document, error: fetchError } = await supabase
      .from("exo_user_documents")
      .select("storage_path")
      .eq("id", document_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("user-documents")
      .remove([document.storage_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      // Continue anyway - might be already deleted
    }

    // Delete chunks first (foreign key constraint)
    await supabase
      .from("exo_document_chunks")
      .delete()
      .eq("document_id", document_id);

    // Delete document record
    const { error: deleteError } = await supabase
      .from("exo_user_documents")
      .delete()
      .eq("id", document_id)
      .eq("tenant_id", tenant_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/knowledge error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
