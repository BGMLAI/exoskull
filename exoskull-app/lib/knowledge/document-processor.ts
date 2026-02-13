/**
 * Document Processing Pipeline
 *
 * Upload → Extract text → Chunk → Generate embeddings → Store in pgvector
 *
 * Supported formats: TXT, MD, CSV, JSON, PDF, DOCX, XLSX, XLS, PPTX, PPT
 * Uses: unpdf (PDF), mammoth (DOCX), xlsx (Excel), jszip (PPTX),
 *        OpenAI text-embedding-3-small (embeddings)
 *
 * Integrates with:
 * - Chunking pipeline (lib/memory/chunking-pipeline.ts)
 * - Vector store (lib/memory/vector-store.ts)
 * - Knowledge graph (lib/memory/knowledge-graph.ts)
 * - Ingestion jobs (exo_ingestion_jobs table)
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import OpenAI from "openai";
import { chunkText } from "@/lib/memory/chunking-pipeline";
import { hashContent } from "@/lib/memory/chunking-pipeline";

import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process a document: extract text, chunk, embed, store.
 * Call after upload to make the document searchable.
 * Now tracks progress via exo_ingestion_jobs if a job exists.
 */
export async function processDocument(
  documentId: string,
  tenantId: string,
): Promise<{ success: boolean; chunks: number; error?: string }> {
  const supabase = getServiceSupabase();

  // Helper to update ingestion job if one exists for this document
  async function updateIngestionJob(update: Record<string, unknown>) {
    await supabase
      .from("exo_ingestion_jobs")
      .update(update)
      .eq("source_id", documentId)
      .eq("tenant_id", tenantId);
  }

  // 1. Get document record
  const { data: doc, error: docError } = await supabase
    .from("exo_user_documents")
    .select("*")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single();

  if (docError || !doc) {
    console.error("[DocProcessor] Document not found:", {
      documentId,
      docError,
    });
    return { success: false, chunks: 0, error: "Document not found" };
  }

  // Update status to processing
  await supabase
    .from("exo_user_documents")
    .update({ status: "processing" })
    .eq("id", documentId);

  await updateIngestionJob({
    status: "extracting",
    current_step: 1,
    step_label: "Extracting text...",
    started_at: new Date().toISOString(),
  });

  try {
    // 2. Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("user-documents")
      .download(doc.storage_path || doc.filename);

    if (downloadError || !fileData) {
      throw new Error(
        `Download failed: ${downloadError?.message || "No data"}`,
      );
    }

    // 3. Extract text
    const fileType = (doc.file_type || "").toLowerCase();
    let extractedText = "";

    if (["txt", "md", "csv", "json"].includes(fileType)) {
      extractedText = await fileData.text();
    } else if (fileType === "pdf") {
      extractedText = await extractPDF(fileData);
    } else if (["docx", "doc"].includes(fileType)) {
      extractedText = await extractDOCX(fileData);
    } else if (["xlsx", "xls"].includes(fileType)) {
      extractedText = await extractXLSX(fileData);
    } else if (["pptx", "ppt"].includes(fileType)) {
      extractedText = await extractPPTX(fileData);
    } else {
      // Unsupported type — store metadata only
      await supabase
        .from("exo_user_documents")
        .update({
          status: "ready",
          extracted_text: `[Plik ${fileType} — ekstrakcja tekstu niedostępna]`,
        })
        .eq("id", documentId);
      await updateIngestionJob({
        status: "completed",
        completed_at: new Date().toISOString(),
        step_label: "No text to extract (unsupported format)",
      });
      return { success: true, chunks: 0 };
    }

    if (!extractedText.trim()) {
      await supabase
        .from("exo_user_documents")
        .update({
          status: "ready",
          extracted_text: "[Plik pusty lub nie zawiera tekstu]",
        })
        .eq("id", documentId);
      await updateIngestionJob({
        status: "completed",
        completed_at: new Date().toISOString(),
        step_label: "File is empty or contains no text",
      });
      return { success: true, chunks: 0 };
    }

    await updateIngestionJob({
      step_label: `Text extracted (${extractedText.length} chars)`,
    });

    // 4. Generate summary with Claude (fire quick request)
    let summary = "";
    try {
      summary = await generateSummary(extractedText, doc.original_name);
    } catch (err) {
      console.error("[DocProcessor] Summary generation failed:", err);
      summary = extractedText.slice(0, 300) + "...";
    }

    // 5. Save extracted text + summary
    await supabase
      .from("exo_user_documents")
      .update({
        extracted_text: extractedText,
        summary,
      })
      .eq("id", documentId);

    // 6. Chunk text using the unified chunking pipeline
    await updateIngestionJob({
      status: "chunking",
      current_step: 2,
      step_label: "Chunking content...",
    });

    const textChunks = chunkText(extractedText, {
      sourceType: "document",
      sourceId: documentId,
      sourceName: doc.original_name,
    });

    if (textChunks.length === 0) {
      await supabase
        .from("exo_user_documents")
        .update({ status: "ready" })
        .eq("id", documentId);
      await updateIngestionJob({
        status: "completed",
        completed_at: new Date().toISOString(),
        step_label: "No chunks to embed",
      });
      return { success: true, chunks: 0 };
    }

    await updateIngestionJob({
      chunks_total: textChunks.length,
      step_label: `${textChunks.length} chunks created`,
    });

    // 7. Generate embeddings
    await updateIngestionJob({
      status: "embedding",
      current_step: 3,
      step_label: `Generating embeddings for ${textChunks.length} chunks...`,
    });

    const embeddings = await generateEmbeddings(
      textChunks.map((c) => c.content),
    );

    // 8. Store chunks with embeddings (in exo_document_chunks for document-specific search)
    const chunkRecords = textChunks.map((tc, index) => ({
      document_id: documentId,
      tenant_id: tenantId,
      chunk_index: index,
      content: tc.content,
      embedding: JSON.stringify(embeddings[index]),
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkRecords.length; i += 50) {
      const batch = chunkRecords.slice(i, i + 50);
      const { error: insertError } = await supabase
        .from("exo_document_chunks")
        .insert(batch);

      if (insertError) {
        console.error("[DocProcessor] Chunk insert failed:", {
          batch: i,
          error: insertError.message,
        });
      }
    }

    // 9. Also store in exo_vector_embeddings for unified search (with dedup)
    let duplicatesSkipped = 0;
    const vectorRows = textChunks.map((tc, index) => ({
      tenant_id: tenantId,
      content: tc.content,
      content_hash: hashContent(tc.content),
      embedding: JSON.stringify(embeddings[index]),
      source_type: "document",
      source_id: documentId,
      chunk_index: index,
      total_chunks: textChunks.length,
      metadata: {
        source_name: doc.original_name,
        section_heading: tc.sectionHeading,
        strategy: tc.metadata.strategy,
      },
    }));

    // Dedup check
    const hashes = vectorRows.map((r) => r.content_hash);
    const { data: existing } = await supabase
      .from("exo_vector_embeddings")
      .select("content_hash")
      .eq("tenant_id", tenantId)
      .in("content_hash", hashes);

    const existingHashes = new Set((existing || []).map((e) => e.content_hash));
    const newVectorRows = vectorRows.filter(
      (r) => !existingHashes.has(r.content_hash),
    );
    duplicatesSkipped = vectorRows.length - newVectorRows.length;

    // Insert new vector rows
    for (let i = 0; i < newVectorRows.length; i += 50) {
      const batch = newVectorRows.slice(i, i + 50);
      const { error: vectorInsertError } = await supabase
        .from("exo_vector_embeddings")
        .insert(batch);

      if (vectorInsertError) {
        console.error("[DocProcessor] Vector insert failed:", {
          batch: i,
          error: vectorInsertError.message,
        });
      }
    }

    await updateIngestionJob({
      embeddings_stored: newVectorRows.length,
      chunks_processed: textChunks.length,
      step_label: `${newVectorRows.length} embeddings stored, ${duplicatesSkipped} duplicates skipped`,
    });

    // 10. Knowledge graph extraction (for content with meaningful entities)
    if (extractedText.length > 200) {
      await updateIngestionJob({
        status: "graph_extracting",
        current_step: 4,
        step_label: "Extracting entities and relationships...",
      });

      try {
        const { processContentForGraph } =
          await import("@/lib/memory/knowledge-graph");
        // Process first 10K chars for entity extraction
        const graphResult = await processContentForGraph(
          tenantId,
          extractedText.slice(0, 10000),
          "document",
          documentId,
        );

        await updateIngestionJob({
          entities_extracted: graphResult.entities,
          relationships_extracted: graphResult.relationships,
          step_label: `${graphResult.entities} entities, ${graphResult.relationships} relationships`,
        });
      } catch (graphErr) {
        console.warn("[DocProcessor] Graph extraction failed:", graphErr);
        await updateIngestionJob({
          step_label: "Graph extraction skipped (non-critical error)",
        });
      }
    }

    // 11. Mark as ready
    await supabase
      .from("exo_user_documents")
      .update({ status: "ready" })
      .eq("id", documentId);

    await updateIngestionJob({
      status: "completed",
      current_step: 5,
      completed_at: new Date().toISOString(),
      step_label: "Ingestion complete",
    });

    logger.info("[DocProcessor] Document processed:", {
      documentId,
      filename: doc.original_name,
      textLength: extractedText.length,
      chunks: textChunks.length,
      embeddings: newVectorRows.length,
      duplicatesSkipped,
    });

    return { success: true, chunks: textChunks.length };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[DocProcessor] Processing failed:", {
      documentId,
      error: errMsg,
    });

    await supabase
      .from("exo_user_documents")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", documentId);

    await updateIngestionJob({
      status: "failed",
      error_message: errMsg,
      step_label: `Failed: ${errMsg}`,
      completed_at: new Date().toISOString(),
    });

    return { success: false, chunks: 0, error: errMsg };
  }
}

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

async function extractPDF(fileData: Blob): Promise<string> {
  try {
    // unpdf: serverless-optimized PDF.js wrapper (no native deps, no canvas)
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (err) {
    logger.error("[extractPDF] unpdf failed, trying fallback:", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Fallback: try raw text extraction from buffer
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const raw = buffer.toString("utf-8");
    // If buffer contains readable text (not just binary), return it
    const textContent = raw
      .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F\u0400-\u04FF]/g, " ")
      .replace(/\s{3,}/g, " ")
      .trim();
    if (textContent.length > 100) return textContent;
    throw err;
  }
}

async function extractDOCX(fileData: Blob): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await fileData.arrayBuffer());

  // Use convertToHtml to preserve image locations (extractRawText silently discards images)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    buffer,
    convertImage: mammoth.images.imgElement(
      (image: {
        contentType: string;
        read: (encoding: string) => Promise<string>;
      }) => {
        return image.read("base64").then((base64: string) => ({
          src: `data:${image.contentType};base64,${base64.slice(0, 50)}`,
          alt: `[IMAGE: ${image.contentType}]`,
        }));
      },
    ),
  };
  const result = await mammoth.convertToHtml(options);

  // Convert HTML to text, replacing img tags with image markers
  let text = result.value;
  text = text.replace(/<img[^>]*alt="(\[IMAGE:[^"]*\])"[^>]*>/g, "\n$1\n");
  text = text.replace(/<img[^>]*>/g, "\n[IMAGE]\n");
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

async function extractXLSX(fileData: Blob): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length === 0) continue;

    parts.push(`--- Arkusz: ${sheetName} ---`);
    for (const row of rows) {
      const line = row.map((cell) => String(cell ?? "")).join("\t");
      if (line.trim()) parts.push(line);
    }
  }

  return parts.join("\n");
}

async function extractPPTX(fileData: Blob): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);

  const parts: string[] = [];
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort();

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    // Extract text from <a:t> tags
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    if (texts.length > 0) {
      const slideNum = slidePath.match(/slide(\d+)/)?.[1] || "?";
      parts.push(`--- Slajd ${slideNum} ---`);
      parts.push(texts.join(" "));
    }
  }

  return parts.join("\n");
}

// ============================================================================
// EMBEDDINGS
// ============================================================================

/**
 * Generate embeddings for text chunks using OpenAI.
 */
async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error("[DocProcessor] Missing OPENAI_API_KEY");
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const allEmbeddings: number[][] = [];

  // Process in batches of 100 (OpenAI supports up to 2048 but we limit for reliability)
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.slice(0, 8000)), // Safety limit
    });

    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((item) => item.embedding));
  }

  return allEmbeddings;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate a brief summary using Claude Haiku (cheap + fast).
 */
async function generateSummary(
  text: string,
  filename: string,
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const truncated = text.slice(0, 4000); // Limit to ~1000 tokens

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Napisz krótkie podsumowanie (2-3 zdania, po polsku) tego dokumentu "${filename}":\n\n${truncated}`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  return (textBlock && "text" in textBlock ? textBlock.text : "") || "";
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search documents by semantic similarity.
 * Generates query embedding and calls pgvector search function.
 */
export async function searchDocuments(
  tenantId: string,
  query: string,
  limit: number = 5,
): Promise<
  {
    chunk_id: string;
    document_id: string;
    content: string;
    filename: string;
    category: string;
    similarity: number;
  }[]
> {
  if (!OPENAI_API_KEY) {
    throw new Error("[DocProcessor] Missing OPENAI_API_KEY for search");
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const supabase = getServiceSupabase();

  // Generate query embedding
  const embResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  const queryEmbedding = embResponse.data[0].embedding;

  // Call pgvector search function
  const { data, error } = await supabase.rpc("search_user_documents", {
    p_tenant_id: tenantId,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
    p_similarity_threshold: 0.3,
  });

  if (error) {
    console.error("[DocProcessor] Search failed:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  return data || [];
}
