/**
 * Knowledge Upload API
 *
 * POST /api/knowledge/upload - Upload a file to the knowledge base
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  // Legacy office formats
  "application/msword", // doc
  "application/vnd.ms-excel", // xls
  "application/vnd.ms-powerpoint", // ppt
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Auth: verify caller
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = user.id;

    const supabase = getServiceSupabase();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }

    // Generate unique filename
    const ext = file.name.split(".").pop();
    const filename = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("user-documents")
      .upload(filename, file, {
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        {
          error: `Upload failed: ${uploadError.message}`,
        },
        { status: 500 },
      );
    }

    // Create document record
    const { data: document, error: dbError } = await supabase
      .from("exo_user_documents")
      .insert({
        tenant_id: tenantId,
        filename: filename,
        original_name: file.name,
        file_type: ext,
        file_size: file.size,
        storage_path: uploadData.path,
        category: category || "other",
        status: "uploaded",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      // Try to clean up the uploaded file
      await supabase.storage.from("user-documents").remove([filename]);
      return NextResponse.json(
        {
          error: `Database error: ${dbError.message}`,
        },
        { status: 500 },
      );
    }

    // Trigger document processing (text extraction, chunking, embeddings)
    // Fire-and-forget — don't block the upload response
    import("@/lib/knowledge/document-processor")
      .then(({ processDocument }) => processDocument(document.id, tenantId))
      .then((result) => {
        if (result.success) {
          console.log(
            `[KnowledgeUpload] Processed ${document.original_name}: ${result.chunks} chunks`,
          );
        } else {
          console.error(
            `[KnowledgeUpload] Processing failed for ${document.original_name}:`,
            result.error,
          );
        }
      })
      .catch((err) => {
        console.error("[KnowledgeUpload] Processing trigger failed:", err);
      });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        filename: document.original_name,
        status: "processing",
        category: document.category,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
