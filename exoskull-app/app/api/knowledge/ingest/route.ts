/**
 * Knowledge Ingestion API
 *
 * POST /api/knowledge/ingest — Process content through the full pipeline
 * GET  /api/knowledge/ingest?jobId=... — Get ingestion job status
 *
 * Pipeline:
 * 1. Accept content (text, URL, or document ID)
 * 2. Extract text (if needed)
 * 3. Chunk with intelligent pipeline
 * 4. Generate embeddings + store in pgvector
 * 5. Extract entities + relationships → knowledge graph
 * 6. Generate ingestion report
 *
 * All steps are tracked in exo_ingestion_jobs with progress updates.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { chunkText, type ChunkOptions } from "@/lib/memory/chunking-pipeline";
import { storeChunksWithEmbeddings } from "@/lib/memory/vector-store";
import { processContentForGraph } from "@/lib/memory/knowledge-graph";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// ============================================================================
// GET — check ingestion job status
// ============================================================================

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;
    const jobId = req.nextUrl.searchParams.get("jobId");
    const supabase = getServiceSupabase();

    if (jobId) {
      // Single job status
      const { data: job, error } = await supabase
        .from("exo_ingestion_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .single();

      if (error || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json({ job });
    }

    // List recent jobs
    const { data: jobs } = await supabase
      .from("exo_ingestion_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// POST — start ingestion
// ============================================================================

interface IngestRequest {
  /** Source type */
  type: "text" | "url" | "document";
  /** Content for type "text" */
  content?: string;
  /** URL for type "url" */
  url?: string;
  /** Document ID for type "document" (already uploaded) */
  documentId?: string;
  /** Human-readable name */
  name?: string;
  /** Content category */
  category?: string;
  /** Custom chunk options */
  chunkOptions?: ChunkOptions;
  /** Whether to also run knowledge graph extraction */
  extractGraph?: boolean;
}

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
    const body: IngestRequest = await req.json();
    const supabase = getServiceSupabase();

    // Validate input
    if (!body.type) {
      return NextResponse.json(
        { error: "type is required (text, url, document)" },
        { status: 400 },
      );
    }

    if (body.type === "text" && !body.content) {
      return NextResponse.json(
        { error: "content is required for type 'text'" },
        { status: 400 },
      );
    }

    if (body.type === "url" && !body.url) {
      return NextResponse.json(
        { error: "url is required for type 'url'" },
        { status: 400 },
      );
    }

    if (body.type === "document" && !body.documentId) {
      return NextResponse.json(
        { error: "documentId is required for type 'document'" },
        { status: 400 },
      );
    }

    // Create ingestion job
    const { data: job, error: jobError } = await supabase
      .from("exo_ingestion_jobs")
      .insert({
        tenant_id: tenantId,
        source_type:
          body.type === "text"
            ? "conversation"
            : body.type === "url"
              ? "url"
              : "document",
        source_id: body.documentId || null,
        source_name: body.name || body.url || "Inline text",
        status: "pending",
        total_steps: body.extractGraph !== false ? 5 : 3,
        current_step: 0,
        step_label: "Queued for processing",
        metadata: {
          category: body.category,
          extract_graph: body.extractGraph !== false,
          content_length: body.content?.length || 0,
          url: body.url,
        },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: `Failed to create job: ${jobError?.message}` },
        { status: 500 },
      );
    }

    // Start async processing (fire-and-forget)
    processIngestion(tenantId, job.id, body).catch((err) => {
      logger.error("[Ingest] Pipeline error:", err);
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: "pending",
      message:
        "Ingestion started. Poll GET /api/knowledge/ingest?jobId=... for progress.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// INGESTION PIPELINE — runs asynchronously
// ============================================================================

async function processIngestion(
  tenantId: string,
  jobId: string,
  request: IngestRequest,
): Promise<void> {
  const supabase = getServiceSupabase();
  const extractGraph = request.extractGraph !== false;

  async function updateJob(update: Record<string, unknown>) {
    await supabase.from("exo_ingestion_jobs").update(update).eq("id", jobId);
  }

  try {
    // ====================================================================
    // STEP 1: Extract text
    // ====================================================================
    await updateJob({
      status: "extracting",
      current_step: 1,
      step_label: "Extracting text...",
      started_at: new Date().toISOString(),
    });

    let text = "";
    let sourceName = request.name || "Unknown";

    if (request.type === "text") {
      text = request.content || "";
      sourceName = request.name || "Inline text";
    } else if (request.type === "url") {
      text = await extractFromUrl(request.url!);
      sourceName = request.name || request.url || "URL import";
    } else if (request.type === "document") {
      text = await extractFromDocument(request.documentId!, tenantId);
      // Get document name
      const { data: doc } = await supabase
        .from("exo_user_documents")
        .select("original_name")
        .eq("id", request.documentId!)
        .single();
      sourceName = doc?.original_name || request.name || "Document";
    }

    if (!text || text.trim().length < 10) {
      await updateJob({
        status: "completed",
        completed_at: new Date().toISOString(),
        step_label: "No text to process",
        metadata: {
          warning: "Content too short or empty",
          source_type: request.type,
          name: request.name,
        },
      });
      return;
    }

    await updateJob({ step_label: `Text extracted (${text.length} chars)` });

    // ====================================================================
    // STEP 2: Chunk content
    // ====================================================================
    await updateJob({
      status: "chunking",
      current_step: 2,
      step_label: "Chunking content...",
    });

    const chunks = chunkText(text, {
      sourceType:
        request.type === "document"
          ? "document"
          : request.type === "url"
            ? "web"
            : "note",
      sourceId: request.documentId,
      sourceName,
      ...request.chunkOptions,
    });

    await updateJob({
      chunks_total: chunks.length,
      step_label: `${chunks.length} chunks created`,
    });

    // ====================================================================
    // STEP 3: Generate embeddings + store
    // ====================================================================
    await updateJob({
      status: "embedding",
      current_step: 3,
      step_label: `Generating embeddings for ${chunks.length} chunks...`,
    });

    const sourceType =
      request.type === "document"
        ? "document"
        : request.type === "url"
          ? "web"
          : "note";

    const storeResult = await storeChunksWithEmbeddings(
      tenantId,
      chunks,
      sourceType,
      request.documentId,
      { source_name: sourceName, category: request.category },
    );

    await updateJob({
      embeddings_stored: storeResult.chunks,
      chunks_processed: storeResult.chunks + storeResult.duplicatesSkipped,
      step_label: `${storeResult.chunks} embeddings stored (${storeResult.duplicatesSkipped} duplicates skipped)`,
    });

    // ====================================================================
    // STEP 4: Knowledge graph extraction (optional)
    // ====================================================================
    if (extractGraph) {
      await updateJob({
        status: "graph_extracting",
        current_step: 4,
        step_label: "Extracting entities and relationships...",
      });

      // Process in segments (entity extraction has a text limit)
      const segmentSize = 5000;
      let totalEntities = 0;
      let totalRelationships = 0;
      const segments = Math.ceil(text.length / segmentSize);

      for (let i = 0; i < segments && i < 10; i++) {
        // Max 10 segments
        const segment = text.slice(i * segmentSize, (i + 1) * segmentSize);
        try {
          const graphResult = await processContentForGraph(
            tenantId,
            segment,
            sourceType,
            request.documentId,
          );
          totalEntities += graphResult.entities;
          totalRelationships += graphResult.relationships;
        } catch (err) {
          logger.warn(
            `[Ingest] Graph extraction failed for segment ${i}:`,
            err,
          );
        }
      }

      await updateJob({
        entities_extracted: totalEntities,
        relationships_extracted: totalRelationships,
        step_label: `${totalEntities} entities, ${totalRelationships} relationships`,
      });
    }

    // ====================================================================
    // STEP 5: Complete
    // ====================================================================
    const finalStep = extractGraph ? 5 : 3;
    await updateJob({
      status: "completed",
      current_step: finalStep,
      completed_at: new Date().toISOString(),
      step_label: "Ingestion complete",
    });

    logger.info("[Ingest] Pipeline completed:", {
      jobId,
      tenantId: tenantId.slice(0, 8),
      source: sourceName,
      chunks: storeResult.chunks,
      textLength: text.length,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error("[Ingest] Pipeline failed:", { jobId, error: errMsg });

    await updateJob({
      status: "failed",
      error_message: errMsg,
      step_label: `Failed: ${errMsg}`,
      completed_at: new Date().toISOString(),
    });
  }
}

// ============================================================================
// TEXT EXTRACTION HELPERS
// ============================================================================

/**
 * Extract text from a URL (web page).
 */
async function extractFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ExoSkull/1.0 (Knowledge Ingestion)" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const html = await response.text();

    if (contentType.includes("text/plain")) {
      return html;
    }

    // Basic HTML to text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch (err) {
    throw new Error(
      `URL extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Extract text from an already-uploaded document.
 */
async function extractFromDocument(
  documentId: string,
  tenantId: string,
): Promise<string> {
  const supabase = getServiceSupabase();

  // Check if document already has extracted text
  const { data: doc } = await supabase
    .from("exo_user_documents")
    .select("extracted_text, storage_path, file_type, status")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (!doc) {
    throw new Error("Document not found");
  }

  // If text already extracted, use it
  if (doc.extracted_text && doc.extracted_text.length > 10) {
    return doc.extracted_text;
  }

  // Otherwise, trigger document processing and wait
  const { processDocument } =
    await import("@/lib/knowledge/document-processor");
  const result = await processDocument(documentId, tenantId);

  if (!result.success) {
    throw new Error(`Document processing failed: ${result.error}`);
  }

  // Refetch extracted text
  const { data: updated } = await supabase
    .from("exo_user_documents")
    .select("extracted_text")
    .eq("id", documentId)
    .single();

  return updated?.extracted_text || "";
}
