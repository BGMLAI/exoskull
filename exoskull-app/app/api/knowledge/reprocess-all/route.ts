/**
 * POST /api/knowledge/reprocess-all
 *
 * Reprocess documents for a tenant (with batching support).
 * Deletes existing chunks, re-runs the processing pipeline.
 * Useful after fixing extractors or embedding bugs.
 *
 * Body params:
 *   tenant_id (required for CRON_SECRET auth)
 *   offset (default: 0)
 *   limit (default: 1000)
 *   delete_chunks (default: true) — set false for subsequent batches
 *
 * Requires CRON_SECRET for admin access.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { processDocument } from "@/lib/knowledge/document-processor";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for bulk processing

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const body = await req.json().catch(() => ({}));
    let tenantId: string;

    if (cronSecret === process.env.CRON_SECRET) {
      tenantId = body.tenant_id;
      if (!tenantId) {
        return NextResponse.json(
          { error: "tenant_id required for CRON access" },
          { status: 400 },
        );
      }
    } else {
      const auth = await verifyTenantAuth(req);
      if (!auth.ok) return auth.response;
      tenantId = auth.tenantId;
    }

    const supabase = getServiceSupabase();
    const batchOffset = body.offset ?? 0;
    const batchLimit = body.limit ?? 1000;
    const deleteChunks = body.delete_chunks !== false;

    // 1. Delete existing chunks (only on first batch)
    if (deleteChunks) {
      const { error: deleteError } = await supabase
        .from("exo_document_chunks")
        .delete()
        .eq("tenant_id", tenantId);

      if (deleteError) {
        logger.error("[ReprocessAll] Delete chunks failed:", deleteError);
      }
    }

    // 2. Get documents (with pagination)
    const { data: docs, error: docsError } = await supabase
      .from("exo_user_documents")
      .select("id, original_name, file_type, status")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .range(batchOffset, batchOffset + batchLimit - 1);

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
      offset: batchOffset,
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

    logger.info("[ReprocessAll] Complete:", {
      tenantId,
      total: results.total,
      success: results.success,
      failed: results.failed,
    });

    return NextResponse.json(results);
  } catch (error) {
    logger.error("[ReprocessAll] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: "Failed to reprocess" }, { status: 500 });
  }
});
