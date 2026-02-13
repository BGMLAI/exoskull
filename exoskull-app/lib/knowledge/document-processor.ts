/**
 * Document Processing Pipeline
 *
 * Upload → Extract text → Chunk → Generate embeddings → Store in pgvector
 *
 * Supported formats: TXT, MD, CSV, JSON, PDF, DOCX, XLSX, XLS, PPTX, PPT
 * Uses: unpdf (PDF), mammoth (DOCX), xlsx (Excel), jszip (PPTX),
 *        OpenAI text-embedding-3-small (embeddings)
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
