/**
 * Document Processing Pipeline
 *
 * Upload → Extract text → Chunk → Generate embeddings → Store in pgvector
 *
 * Supported formats: TXT, MD, CSV, JSON, PDF, DOCX
 * Uses: unpdf (PDF), mammoth (DOCX), OpenAI text-embedding-3-small (embeddings)
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import OpenAI from "openai";

import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims
const CHUNK_SIZE = 500; // ~500 tokens per chunk
const CHUNK_OVERLAP = 50; // overlap between chunks

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process a document: extract text, chunk, embed, store.
 * Call after upload to make the document searchable.
 */
export async function processDocument(
  documentId: string,
  tenantId: string,
): Promise<{ success: boolean; chunks: number; error?: string }> {
  const supabase = getServiceSupabase();

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
    } else {
      // Unsupported type — store metadata only
      await supabase
        .from("exo_user_documents")
        .update({
          status: "ready",
          extracted_text: `[Plik ${fileType} — ekstrakcja tekstu niedostępna]`,
        })
        .eq("id", documentId);
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
      return { success: true, chunks: 0 };
    }

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

    // 6. Chunk text
    const chunks = chunkText(extractedText, CHUNK_SIZE, CHUNK_OVERLAP);

    if (chunks.length === 0) {
      await supabase
        .from("exo_user_documents")
        .update({ status: "ready" })
        .eq("id", documentId);
      return { success: true, chunks: 0 };
    }

    // 7. Generate embeddings
    const embeddings = await generateEmbeddings(chunks);

    // 8. Store chunks with embeddings
    const chunkRecords = chunks.map((content, index) => ({
      document_id: documentId,
      tenant_id: tenantId,
      chunk_index: index,
      content,
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

    // 9. Mark as ready
    await supabase
      .from("exo_user_documents")
      .update({ status: "ready" })
      .eq("id", documentId);

    logger.info("[DocProcessor] Document processed:", {
      documentId,
      filename: doc.original_name,
      textLength: extractedText.length,
      chunks: chunks.length,
    });

    return { success: true, chunks: chunks.length };
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
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ============================================================================
// CHUNKING
// ============================================================================

/**
 * Split text into chunks with overlap.
 * Uses word boundaries for clean splits.
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= chunkSize) return [text.trim()];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ").trim();
    if (chunk) chunks.push(chunk);
    start += chunkSize - overlap;
  }

  return chunks;
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

  // OpenAI supports batch embedding (up to 2048 inputs)
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks,
  });

  return response.data.map((item) => item.embedding);
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
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_limit: limit,
    p_similarity_threshold: 0.5,
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
