/**
 * POST /api/knowledge/reprocess — Reprocess stuck/failed documents
 *
 * Finds documents stuck in "processing" or "failed" status and reprocesses them.
 * Auth: authenticated user (own docs) OR CRON_SECRET + tenant_id query param.
 * Supports ?limit=N for batching (default: 10, max: 20).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { processDocument } from "@/lib/knowledge/document-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for Pro plan

export async function POST(request: NextRequest) {
  try {
    let tenantId: string;

    // Auth: CRON_SECRET header + tenant_id param OR user session
    const cronSecret = request.headers.get("x-cron-secret");
    const { searchParams } = new URL(request.url);

    if (
      cronSecret === process.env.CRON_SECRET &&
      searchParams.get("tenant_id")
    ) {
      tenantId = searchParams.get("tenant_id")!;
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      tenantId = user.id;
    }

    const limit = Math.min(Number(searchParams.get("limit") || 10), 20);
    const service = getServiceSupabase();

    // Find stuck or failed documents for this user
    const { data: docs, error } = await service
      .from("exo_user_documents")
      .select("id, original_name, status, error_message")
      .eq("tenant_id", tenantId)
      .in("status", ["processing", "failed", "uploaded"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Reprocess] Query failed:", error.message);
      return NextResponse.json(
        { error: "Failed to query documents" },
        { status: 500 },
      );
    }

    if (!docs || docs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No documents to reprocess",
        reprocessed: 0,
      });
    }

    // Reprocess each document (fire-and-forget for speed, but track results)
    const results: Array<{
      id: string;
      name: string;
      success: boolean;
      chunks: number;
      error?: string;
    }> = [];

    for (const doc of docs) {
      try {
        // Reset status to allow reprocessing
        await service
          .from("exo_user_documents")
          .update({ status: "uploaded", error_message: null })
          .eq("id", doc.id);

        // Delete old chunks if any
        await service
          .from("exo_document_chunks")
          .delete()
          .eq("document_id", doc.id);

        const result = await processDocument(doc.id, tenantId);
        results.push({
          id: doc.id,
          name: doc.original_name,
          success: result.success,
          chunks: result.chunks,
          error: result.error,
        });
      } catch (err) {
        results.push({
          id: doc.id,
          name: doc.original_name,
          success: false,
          chunks: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      reprocessed: results.length,
      results,
    });
  } catch (error) {
    console.error("[Reprocess] Error:", error);
    return NextResponse.json(
      { error: "Failed to reprocess documents" },
      { status: 500 },
    );
  }
}
