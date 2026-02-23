/**
 * POST /api/knowledge/upload-url
 *
 * Creates a Supabase Storage signed upload URL + DB record.
 * Client then uploads directly to Storage (bypasses Vercel 4.5MB body limit).
 *
 * Request: { filename: string, contentType: string, fileSize: number, category?: string }
 * Response: { signedUrl: string, token: string, storagePath: string, documentId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/** Canonical extension → MIME mapping (must match bucket allowed_mime_types exactly) */
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const ALLOWED_EXTENSIONS = Object.keys(EXT_TO_MIME);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB (Supabase storage limit for signed URLs)
// For files >500MB, use /api/knowledge/multipart-upload (R2 direct, up to 10GB)

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const tenantId = auth.tenantId;
    const { filename, contentType, fileSize, category } = await req.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "filename is required" },
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

    // Validate size — redirect large files to multipart endpoint
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large for signed URL upload (max ${MAX_FILE_SIZE / 1024 / 1024}MB). Use /api/knowledge/multipart-upload for files up to 10GB.`,
          useMultipart: true,
          multipartEndpoint: "/api/knowledge/multipart-upload",
        },
        { status: 413 },
      );
    }

    const supabase = getServiceSupabase();

    // Generate unique storage path
    const storagePath = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Create signed upload URL (valid for 5 minutes)
    const { data: signedData, error: signedError } = await supabase.storage
      .from("user-documents")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      logger.error("[UploadURL] Signed URL failed:", signedError);
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 },
      );
    }

    // Create document record with "uploading" status
    const { data: document, error: dbError } = await supabase
      .from("exo_user_documents")
      .insert({
        tenant_id: tenantId,
        filename: storagePath,
        original_name: filename,
        file_type: ext,
        file_size: fileSize || 0,
        storage_path: storagePath,
        category: category || "other",
        status: "uploading",
      })
      .select("id")
      .single();

    if (dbError) {
      logger.error("[UploadURL] DB insert failed:", dbError);
      return NextResponse.json(
        { error: "Failed to create document record" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      storagePath,
      documentId: document.id,
      mimeType: EXT_TO_MIME[ext],
    });
  } catch (error) {
    logger.error("[UploadURL] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
});
