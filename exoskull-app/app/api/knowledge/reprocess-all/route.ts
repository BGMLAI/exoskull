/**
 * POST /api/knowledge/reprocess-all
 *
 * Reprocess all documents for a tenant.
 * Deletes existing chunks, re-runs the processing pipeline.
 * Useful after fixing extractors or embedding bugs.
 *
 * Requires CRON_SECRET for admin access.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { processDocument } from "@/lib/knowledge/document-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for bulk processing

export async function POST(req: NextRequest) {
  try {
    // Auth: either CRON_SECRET or logged-in user
    const cronSecret = req.headers.get("x-cron-secret");
    let tenantId: string;

    if (cronSecret === process.env.CRON_SECRET) {
      const body = await req.json().catch(() => ({}));
      tenantId = body.tenant_id;
      if (!tenantId) {
        return NextResponse.json(
          { error: "tenant_id required for CRON access" },
          { status: 400 },
        );
      }
    } else {
      const authSupabase = await createAuthClient();
      const {
        data: { user },
      } = await authSupabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      tenantId = user.id;
    }

    const supabase = getServiceSupabase();

    // 1. Delete existing chunks for this tenant
    const { error: deleteError } = await supabase
      .from("exo_document_chunks")
      .delete()
      .eq("tenant_id", tenantId);

    if (deleteError) {
      console.error("[ReprocessAll] Delete chunks failed:", deleteError);
    }

    // 2. Get all documents
    const { data: docs, error: docsError } = await supabase
      .from("exo_user_documents")
      .select("id, original_name, file_type, status")
      .eq("tenant_id", tenantId);

    if (docsError || !docs) {
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 },
      );
    }

    // 3. Reprocess each document
    const results = {
      total: docs.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [] as {
        id: string;
        name: string;
        status: string;
        chunks: number;
      }[],
    };

    for (const doc of docs) {
      try {
        const result = await processDocument(doc.id, tenantId);
        if (result.success) {
          results.success++;
          results.details.push({
            id: doc.id,
            name: doc.original_name,
            status: "success",
            chunks: result.chunks,
          });
        } else {
          results.failed++;
          results.details.push({
            id: doc.id,
            name: doc.original_name,
            status: `failed: ${result.error}`,
            chunks: 0,
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          id: doc.id,
          name: doc.original_name,
          status: `error: ${error instanceof Error ? error.message : "unknown"}`,
          chunks: 0,
        });
      }
    }

    console.log("[ReprocessAll] Complete:", {
      tenantId,
      total: results.total,
      success: results.success,
      failed: results.failed,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("[ReprocessAll] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: "Failed to reprocess" }, { status: 500 });
  }
}
