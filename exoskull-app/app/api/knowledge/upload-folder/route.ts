/**
 * Bulk Folder Upload API
 *
 * POST /api/knowledge/upload-folder
 *
 * Accepts multiple files with relative paths (preserving folder structure).
 * Frontend sends FormData with:
 *   - files[]: File objects
 *   - paths[]: relative paths (e.g. "docs/readme.md", "src/index.ts")
 *   - category: optional category for all files
 *
 * Each file gets uploaded to Supabase Storage under tenant's namespace
 * with folder structure preserved, then queued for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 1GB total, 100MB per file
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 500;

const ALLOWED_EXTENSIONS = new Set([
  // Documents
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
  "rtf",
  "odt",
  "ods",
  "odp",
  // Code
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "sql",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "xml",
  "html",
  "css",
  "scss",
  "less",
  "svg",
  // Config
  "env",
  "gitignore",
  "dockerignore",
  "editorconfig",
  // Images
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  // Data
  "parquet",
  "ndjson",
]);

interface UploadResult {
  path: string;
  success: boolean;
  documentId?: string;
  error?: string;
}

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // Auth
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
    const category = (formData.get("category") as string) || "folder_upload";

    // Collect all files and paths
    const files: File[] = [];
    const paths: string[] = [];

    // Support both indexed (files[0], paths[0]) and repeated (files, paths) FormData
    for (const [key, value] of formData.entries()) {
      if (key === "files" || key.startsWith("files[")) {
        if (value instanceof File) {
          files.push(value);
        }
      }
      if (key === "paths" || key.startsWith("paths[")) {
        if (typeof value === "string") {
          paths.push(value);
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files. Max: ${MAX_FILES}` },
        { status: 400 },
      );
    }

    // Validate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        {
          error: `Total size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds limit ${MAX_TOTAL_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 },
      );
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const results: UploadResult[] = [];
    const documentIds: string[] = [];

    logger.info(
      `[FolderUpload] Starting batch ${batchId}: ${files.length} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB`,
      {
        tenantId,
        fileCount: files.length,
        totalSize,
      },
    );

    // Process files in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchPaths = paths.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (file, idx): Promise<UploadResult> => {
          const relativePath = batchPaths[idx] || file.name;

          try {
            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
              return {
                path: relativePath,
                success: false,
                error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
              };
            }

            // Validate extension
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            if (!ALLOWED_EXTENSIONS.has(ext)) {
              return {
                path: relativePath,
                success: false,
                error: `Extension .${ext} not allowed`,
              };
            }

            // Sanitize path: remove leading slashes, normalize
            const safePath = relativePath
              .replace(/\\/g, "/")
              .replace(/^\/+/, "")
              .replace(/\.\./g, "_");

            const storagePath = `${tenantId}/folders/${batchId}/${safePath}`;

            // Upload to storage
            const { data: uploadData, error: uploadError } =
              await supabase.storage
                .from("user-documents")
                .upload(storagePath, file, {
                  contentType: file.type || "application/octet-stream",
                  cacheControl: "3600",
                });

            if (uploadError) {
              return {
                path: relativePath,
                success: false,
                error: uploadError.message,
              };
            }

            // Create document record
            const { data: document, error: dbError } = await supabase
              .from("exo_user_documents")
              .insert({
                tenant_id: tenantId,
                filename: storagePath,
                original_name: file.name,
                file_type: ext,
                file_size: file.size,
                storage_path: uploadData.path,
                category,
                status: "uploaded",
                metadata: {
                  batch_id: batchId,
                  relative_path: safePath,
                  folder_upload: true,
                },
              })
              .select("id")
              .single();

            if (dbError) {
              return {
                path: relativePath,
                success: false,
                error: dbError.message,
              };
            }

            documentIds.push(document.id);
            return {
              path: relativePath,
              success: true,
              documentId: document.id,
            };
          } catch (err) {
            return {
              path: relativePath,
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            };
          }
        }),
      );

      results.push(...batchResults);
    }

    // Trigger batch processing (fire-and-forget)
    if (documentIds.length > 0) {
      import("@/lib/knowledge/document-processor")
        .then(({ processDocument }) => {
          // Process each document sequentially to avoid overloading
          return documentIds.reduce(
            (chain, docId) =>
              chain.then(() =>
                processDocument(docId, tenantId).catch((err: Error) => {
                  logger.error(
                    `[FolderUpload] Processing failed for ${docId}:`,
                    err.message,
                  );
                  return { success: false, error: err.message };
                }),
              ),
            Promise.resolve() as Promise<any>,
          );
        })
        .then(() => {
          logger.info(
            `[FolderUpload] Batch ${batchId} processing complete: ${documentIds.length} documents`,
          );
        })
        .catch((err) => {
          logger.error(`[FolderUpload] Batch processing error:`, err);
        });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    logger.info(
      `[FolderUpload] Batch ${batchId} uploaded: ${successCount} OK, ${failCount} failed`,
    );

    return NextResponse.json({
      success: true,
      batchId,
      total: files.length,
      uploaded: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    logger.error("[FolderUpload] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
