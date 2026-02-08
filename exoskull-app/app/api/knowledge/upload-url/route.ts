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
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

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
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB (Supabase storage limit)

export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;
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

    // Validate size
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
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
      console.error("[UploadURL] Signed URL failed:", signedError);
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
      console.error("[UploadURL] DB insert failed:", dbError);
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
    });
  } catch (error) {
    console.error("[UploadURL] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
