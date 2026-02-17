/**
 * POST /api/agent/upload
 *
 * Unified endpoint for ExoSkull Local Agent file sync.
 * Uses R2 presigned URLs for direct upload (no Supabase Storage).
 *
 * Actions:
 *   get-url       → { presignedUrl, r2Key, documentId, mimeType }
 *   confirm       → { success, document }  (triggers processDocument)
 *   status        → { documentId, status, chunks, error }
 *   batch-status  → { documents: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  generateDocumentPath,
  getPresignedPutUrl,
  headObject,
} from "@/lib/storage/r2-client";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// MIME mapping (expanded — blacklist approach, fallback to octet-stream)
// ---------------------------------------------------------------------------

const EXT_TO_MIME: Record<string, string> = {
  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  rst: "text/x-rst",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  // Office
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Data
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  xml: "text/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "application/toml",
  // Code
  js: "text/javascript",
  ts: "text/typescript",
  jsx: "text/jsx",
  tsx: "text/tsx",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  cs: "text/x-csharp",
  php: "text/x-php",
  sh: "text/x-shellscript",
  sql: "application/sql",
  // Web
  html: "text/html",
  css: "text/css",
  svg: "image/svg+xml",
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  psd: "image/vnd.adobe.photoshop",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  wmv: "video/x-ms-wmv",
  // Archives
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/x-rar-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  // Ebooks
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
};

/** Extensions that should never be uploaded */
const EXCLUDED_EXTENSIONS = new Set([
  "exe",
  "dll",
  "sys",
  "msi",
  "drv",
  "cpl",
  "scr",
  "o",
  "obj",
  "lib",
  "a",
  "so",
  "dylib",
  "pdb",
  "class",
  "jar",
  "pyc",
  "pyo",
  "iso",
  "img",
  "vmdk",
  "vhd",
  "qcow2",
  "dat",
  "reg",
  "lnk",
  "cab",
  "wim",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB (R2 single-PUT max)

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetUrl(
  body: any,
  tenantId: string,
): Promise<NextResponse> {
  const { filename, fileSize, category } = body;

  if (!filename || typeof filename !== "string") {
    return NextResponse.json(
      { error: "filename is required" },
      { status: 400 },
    );
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `File type .${ext} is excluded (system binary/artifact)` },
      { status: 400 },
    );
  }

  if (fileSize && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024 / 1024}GB)` },
      { status: 413 },
    );
  }

  const mimeType = EXT_TO_MIME[ext] || "application/octet-stream";
  const r2Key = generateDocumentPath({
    tenantId,
    category: category || "other",
    extension: ext || "bin",
  });

  // Generate R2 presigned PUT URL
  let presignedUrl: string;
  try {
    const result = await getPresignedPutUrl(r2Key, mimeType, 3600);
    presignedUrl = result.url;
  } catch (error) {
    console.error("[AgentUpload] R2 presigned URL failed:", error);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 },
    );
  }

  // Insert document record
  const supabase = getServiceSupabase();
  const { data: document, error: dbError } = await supabase
    .from("exo_user_documents")
    .insert({
      tenant_id: tenantId,
      filename: r2Key,
      original_name: filename,
      file_type: ext,
      file_size: fileSize || 0,
      storage_path: `r2://${r2Key}`,
      category: category || "other",
      status: "uploading",
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("[AgentUpload] DB insert failed:", dbError);
    return NextResponse.json(
      { error: "Failed to create document record" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    presignedUrl,
    r2Key,
    documentId: document.id,
    mimeType,
  });
}

async function handleConfirm(
  body: any,
  tenantId: string,
): Promise<NextResponse> {
  const { documentId } = body;

  if (!documentId) {
    return NextResponse.json(
      { error: "documentId is required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  const { data: doc, error: docError } = await supabase
    .from("exo_user_documents")
    .select("id, original_name, category, storage_path, status")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
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

  // Verify file exists in R2 via HeadObject
  const r2Key = doc.storage_path.replace(/^r2:\/\//, "");
  const headResult = await headObject(r2Key);

  if (!headResult.exists) {
    await supabase
      .from("exo_user_documents")
      .update({ status: "failed" })
      .eq("id", documentId);

    return NextResponse.json(
      { error: "File not found in R2 storage" },
      { status: 400 },
    );
  }

  // Update file_size from R2 if we have it
  const updateData: Record<string, unknown> = { status: "uploaded" };
  if (headResult.contentLength) {
    updateData.file_size = headResult.contentLength;
  }

  await supabase
    .from("exo_user_documents")
    .update(updateData)
    .eq("id", documentId);

  // Fire-and-forget processing
  import("@/lib/knowledge/document-processor")
    .then(({ processDocument }) => processDocument(documentId, tenantId))
    .then((result) => {
      if (result.success) {
        console.log(
          `[AgentUpload] Processed ${doc.original_name}: ${result.chunks} chunks`,
        );
      } else {
        console.error(
          `[AgentUpload] Processing failed for ${doc.original_name}:`,
          result.error,
        );
      }
    })
    .catch((err) => {
      console.error("[AgentUpload] Processing trigger failed:", err);
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
}

async function handleStatus(
  body: any,
  tenantId: string,
): Promise<NextResponse> {
  const { documentId } = body;

  if (!documentId) {
    return NextResponse.json(
      { error: "documentId is required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  const { data: doc, error: docError } = await supabase
    .from("exo_user_documents")
    .select(
      "id, original_name, status, error_message, file_type, file_size, category, created_at",
    )
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Get chunk count if ready
  let chunks = 0;
  if (doc.status === "ready") {
    const { count } = await supabase
      .from("exo_document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);
    chunks = count || 0;
  }

  return NextResponse.json({
    documentId: doc.id,
    filename: doc.original_name,
    status: doc.status,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    category: doc.category,
    chunks,
    error: doc.error_message || null,
    createdAt: doc.created_at,
  });
}

async function handleBatchStatus(
  body: any,
  tenantId: string,
): Promise<NextResponse> {
  const { documentIds } = body;

  if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json(
      { error: "documentIds array is required" },
      { status: 400 },
    );
  }

  if (documentIds.length > 100) {
    return NextResponse.json(
      { error: "Maximum 100 documents per batch" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  const { data: docs, error: docsError } = await supabase
    .from("exo_user_documents")
    .select("id, original_name, status, error_message, category, created_at")
    .eq("tenant_id", tenantId)
    .in("id", documentIds);

  if (docsError) {
    console.error("[AgentUpload] Batch status failed:", docsError);
    return NextResponse.json(
      { error: "Failed to fetch document statuses" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documents: (docs || []).map((doc) => ({
      documentId: doc.id,
      filename: doc.original_name,
      status: doc.status,
      error: doc.error_message || null,
      category: doc.category,
      createdAt: doc.created_at,
    })),
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const POST = withApiLog(async function POST(req: NextRequest) {
  const auth = await verifyTenantAuth(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "get-url":
        return handleGetUrl(body, tenantId);
      case "confirm":
        return handleConfirm(body, tenantId);
      case "status":
        return handleStatus(body, tenantId);
      case "batch-status":
        return handleBatchStatus(body, tenantId);
      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}`,
            validActions: ["get-url", "confirm", "status", "batch-status"],
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[AgentUpload] Error:", {
      error: error instanceof Error ? error.message : error,
      userId: tenantId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
