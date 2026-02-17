/**
 * Multipart Upload API — for large files up to 10GB
 *
 * POST /api/knowledge/multipart-upload
 *   Action: "initiate" — Start multipart upload, get presigned URLs
 *   Action: "complete" — Complete multipart upload after all parts uploaded
 *   Action: "abort" — Cancel/cleanup a failed upload
 *
 * Flow:
 * 1. Client calls POST { action: "initiate", filename, fileSize, contentType }
 *    → Gets { uploadId, key, parts: [{ partNumber, url }], documentId }
 * 2. Client uploads each part directly to R2 via presigned URLs
 *    → Gets ETag from each part response header
 * 3. Client calls POST { action: "complete", uploadId, key, documentId, parts: [{ partNumber, etag }] }
 *    → Triggers ingestion pipeline
 * 4. On failure: POST { action: "abort", uploadId, key, documentId }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  initiateMultipartUpload,
  getPresignedPartUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  MAX_MULTIPART_SIZE,
} from "@/lib/storage/r2-client";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const DEFAULT_PART_SIZE = 100 * 1024 * 1024; // 100MB per part

const ALLOWED_EXTENSIONS = [
  "pdf",
  "txt",
  "md",
  "json",
  "csv",
  "docx",
  "xlsx",
  "pptx",
  "doc",
  "xls",
  "ppt",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "webm",
  "mov",
  "zip",
  "tar",
  "gz",
];

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "initiate":
        return handleInitiate(tenantId, body);
      case "complete":
        return handleComplete(tenantId, body);
      case "abort":
        return handleAbort(tenantId, body);
      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}. Use: initiate, complete, abort`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[MultipartUpload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// INITIATE — start multipart upload
// ============================================================================

async function handleInitiate(
  tenantId: string,
  body: {
    filename: string;
    fileSize: number;
    contentType?: string;
    category?: string;
  },
) {
  const { filename, fileSize, contentType, category } = body;

  if (!filename || !fileSize) {
    return NextResponse.json(
      { error: "filename and fileSize are required" },
      { status: 400 },
    );
  }

  // Validate extension
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `File type .${ext} not allowed` },
      { status: 400 },
    );
  }

  // Validate size
  if (fileSize > MAX_MULTIPART_SIZE) {
    return NextResponse.json(
      {
        error: `File too large. Max: ${MAX_MULTIPART_SIZE / (1024 * 1024 * 1024)}GB`,
      },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Generate unique key in R2
  const key = `${tenantId}/knowledge/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Initiate multipart upload on R2
  const initResult = await initiateMultipartUpload({
    tenantId,
    key,
    contentType,
    metadata: {
      "original-name": filename,
      "file-size": String(fileSize),
    },
  });

  if (!initResult.success || !initResult.session) {
    return NextResponse.json(
      { error: `Failed to initiate upload: ${initResult.error}` },
      { status: 500 },
    );
  }

  const { uploadId } = initResult.session;

  // Calculate parts
  const partSize =
    fileSize > 1024 * 1024 * 1024
      ? DEFAULT_PART_SIZE // 100MB for >1GB files
      : Math.max(5 * 1024 * 1024, Math.ceil(fileSize / 100)); // Minimum 5MB, max 100 parts
  const totalParts = Math.ceil(fileSize / partSize);

  // Generate presigned URLs for all parts
  const urlResult = await getPresignedPartUrls(key, uploadId, totalParts, 7200); // 2h expiry

  if (!urlResult.success || !urlResult.parts) {
    // Cleanup
    await abortMultipartUpload(key, uploadId);
    return NextResponse.json(
      { error: `Failed to generate upload URLs: ${urlResult.error}` },
      { status: 500 },
    );
  }

  // Create document record
  const { data: document, error: dbError } = await supabase
    .from("exo_user_documents")
    .insert({
      tenant_id: tenantId,
      filename: key,
      original_name: filename,
      file_type: ext,
      file_size: fileSize,
      storage_path: key,
      category: category || "other",
      status: "uploading",
    })
    .select("id")
    .single();

  if (dbError) {
    await abortMultipartUpload(key, uploadId);
    return NextResponse.json(
      { error: `Database error: ${dbError.message}` },
      { status: 500 },
    );
  }

  // Create ingestion job (pending)
  await supabase.from("exo_ingestion_jobs").insert({
    tenant_id: tenantId,
    source_type: "document",
    source_id: document.id,
    source_name: filename,
    status: "pending",
    metadata: {
      upload_id: uploadId,
      r2_key: key,
      file_size: fileSize,
      content_type: contentType,
      total_parts: totalParts,
      part_size: partSize,
    },
  });

  return NextResponse.json({
    uploadId,
    key,
    partSize,
    totalParts,
    documentId: document.id,
    parts: urlResult.parts,
  });
}

// ============================================================================
// COMPLETE — finalize multipart upload
// ============================================================================

async function handleComplete(
  tenantId: string,
  body: {
    uploadId: string;
    key: string;
    documentId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  },
) {
  const { uploadId, key, documentId, parts } = body;

  if (!uploadId || !key || !documentId || !parts?.length) {
    return NextResponse.json(
      { error: "uploadId, key, documentId, and parts are required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Verify document belongs to tenant
  const { data: doc } = await supabase
    .from("exo_user_documents")
    .select("id, original_name")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Complete multipart upload on R2
  const completeResult = await completeMultipartUpload(key, uploadId, parts);

  if (!completeResult.success) {
    await supabase
      .from("exo_user_documents")
      .update({ status: "failed" })
      .eq("id", documentId);

    return NextResponse.json(
      { error: `Failed to complete upload: ${completeResult.error}` },
      { status: 500 },
    );
  }

  // Update document status
  await supabase
    .from("exo_user_documents")
    .update({ status: "uploaded", storage_path: key })
    .eq("id", documentId);

  // Update ingestion job status
  await supabase
    .from("exo_ingestion_jobs")
    .update({
      status: "extracting",
      started_at: new Date().toISOString(),
      step_label: "Extracting text...",
    })
    .eq("source_id", documentId)
    .eq("tenant_id", tenantId);

  // Trigger processing pipeline (fire-and-forget)
  import("@/lib/knowledge/document-processor")
    .then(({ processDocument }) => processDocument(documentId, tenantId))
    .then(async (result) => {
      if (result.success) {
        logger.info(
          `[MultipartUpload] Processed ${doc.original_name}: ${result.chunks} chunks`,
        );
        await supabase
          .from("exo_ingestion_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            chunks_total: result.chunks,
            chunks_processed: result.chunks,
            step_label: "Complete",
          })
          .eq("source_id", documentId)
          .eq("tenant_id", tenantId);
      } else {
        logger.error(`[MultipartUpload] Processing failed:`, result.error);
        await supabase
          .from("exo_ingestion_jobs")
          .update({
            status: "failed",
            error_message: result.error,
            step_label: "Failed",
          })
          .eq("source_id", documentId)
          .eq("tenant_id", tenantId);
      }
    })
    .catch(console.error);

  return NextResponse.json({
    success: true,
    document: {
      id: documentId,
      filename: doc.original_name,
      status: "processing",
    },
  });
}

// ============================================================================
// ABORT — cancel failed upload
// ============================================================================

async function handleAbort(
  tenantId: string,
  body: { uploadId: string; key: string; documentId?: string },
) {
  const { uploadId, key, documentId } = body;

  if (!uploadId || !key) {
    return NextResponse.json(
      { error: "uploadId and key are required" },
      { status: 400 },
    );
  }

  // Abort multipart upload on R2
  await abortMultipartUpload(key, uploadId);

  // Clean up DB records
  const supabase = getServiceSupabase();

  if (documentId) {
    await supabase
      .from("exo_user_documents")
      .update({ status: "failed" })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    await supabase
      .from("exo_ingestion_jobs")
      .update({ status: "failed", error_message: "Upload aborted by user" })
      .eq("source_id", documentId)
      .eq("tenant_id", tenantId);
  }

  return NextResponse.json({ success: true });
}
