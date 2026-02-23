/**
 * POST /api/knowledge/confirm-upload
 *
 * Called after client uploads file directly to Supabase Storage.
 * Updates document status and triggers processing pipeline.
 *
 * Request: { documentId: string }
 * Response: { success: boolean, document: {...} }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const tenantId = auth.tenantId;
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();

    // Verify document belongs to this tenant and is in "uploading" status
    const { data: doc, error: docError } = await supabase
      .from("exo_user_documents")
      .select("id, original_name, category, storage_path, status")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    if (doc.status !== "uploading") {
      return NextResponse.json({
        success: true,
        document: {
          id: doc.id,
          filename: doc.original_name,
          status: doc.status,
          category: doc.category,
        },
      });
    }

    // Verify file exists in storage
    const { data: fileCheck } = await supabase.storage
      .from("user-documents")
      .list(doc.storage_path.split("/").slice(0, -1).join("/"), {
        search: doc.storage_path.split("/").pop(),
      });

    if (!fileCheck || fileCheck.length === 0) {
      // File not found in storage — mark as failed
      await supabase
        .from("exo_user_documents")
        .update({ status: "failed" })
        .eq("id", documentId);

      return NextResponse.json(
        { error: "File not found in storage" },
        { status: 400 },
      );
    }

    // Update status to "uploaded"
    await supabase
      .from("exo_user_documents")
      .update({ status: "uploaded" })
      .eq("id", documentId);

    // Trigger document processing (fire-and-forget)
    import("@/lib/knowledge/document-processor")
      .then(({ processDocument }) => processDocument(documentId, tenantId))
      .then((result) => {
        if (result.success) {
          logger.info(
            `[ConfirmUpload] Processed ${doc.original_name}: ${result.chunks} chunks`,
          );
        } else {
          logger.error(
            `[ConfirmUpload] Processing failed for ${doc.original_name}:`,
            result.error,
          );
        }
      })
      .catch((err) => {
        logger.error("[ConfirmUpload] Processing trigger failed:", err);
      });

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        filename: doc.original_name,
        status: "processing",
        category: doc.category,
      },
    });
  } catch (error) {
    logger.error("[ConfirmUpload] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 },
    );
  }
});
