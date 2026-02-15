/**
 * POST /api/agent/upload
 *
 * Unified endpoint for ExoSkull Local Agent file sync.
 * Combines upload-url + confirm-upload + status into single endpoint with Bearer JWT auth.
 *
 * Actions:
 *   get-url       → { signedUrl, token, storagePath, documentId, mimeType }
 *   confirm       → { success, document }  (triggers processDocument)
 *   status        → { documentId, status, chunks, error }
 *   batch-status  → { documents: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Auth (reuses mobile/sync pattern)
// ---------------------------------------------------------------------------

async function authenticateRequest(
  req: NextRequest,
): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// MIME mapping (mirrors upload-url)
// ---------------------------------------------------------------------------

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
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

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
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      {
        error: `File type .${ext} not allowed`,
        allowedTypes: ALLOWED_EXTENSIONS,
      },
      { status: 400 },
    );
  }

  if (fileSize && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const supabase = getServiceSupabase();
  const storagePath = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data: signedData, error: signedError } = await supabase.storage
    .from("user-documents")
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    console.error("[AgentUpload] Signed URL failed:", signedError);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 },
    );
  }

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
    console.error("[AgentUpload] DB insert failed:", dbError);
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

  // Verify file exists in storage
  const { data: fileCheck } = await supabase.storage
    .from("user-documents")
    .list(doc.storage_path.split("/").slice(0, -1).join("/"), {
      search: doc.storage_path.split("/").pop(),
    });

  if (!fileCheck || fileCheck.length === 0) {
    await supabase
      .from("exo_user_documents")
      .update({ status: "failed" })
      .eq("id", documentId);

    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 400 },
    );
  }

  await supabase
    .from("exo_user_documents")
    .update({ status: "uploaded" })
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

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "get-url":
        return handleGetUrl(body, auth.userId);
      case "confirm":
        return handleConfirm(body, auth.userId);
      case "status":
        return handleStatus(body, auth.userId);
      case "batch-status":
        return handleBatchStatus(body, auth.userId);
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
      userId: auth.userId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
