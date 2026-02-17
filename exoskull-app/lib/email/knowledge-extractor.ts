/**
 * Email Knowledge Extractor
 *
 * Extracts key facts from analyzed emails and stores them in the
 * existing RAG pipeline (exo_user_documents + exo_document_chunks).
 *
 * Reuses existing OpenAI embeddings infrastructure — zero new search infra needed.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import OpenAI from "openai";
import type { AnalyzedEmail, KeyFact } from "./types";

import { logger } from "@/lib/logger";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Extract key facts from an email and store in RAG knowledge base.
 * Returns number of chunks created.
 */
export async function extractKnowledge(
  email: AnalyzedEmail,
  keyFacts: KeyFact[],
): Promise<number> {
  if (!keyFacts.length) return 0;

  const supabase = getServiceSupabase();

  // Only store facts with confidence >= 0.5
  const worthyFacts = keyFacts.filter((f) => f.confidence >= 0.5);
  if (!worthyFacts.length) return 0;

  // Create a virtual document entry
  const senderDisplay = email.from_name || email.from_email;
  const docTitle = `Email od ${senderDisplay} — ${email.subject || "(brak tematu)"}`;

  const { data: doc, error: docError } = await supabase
    .from("exo_user_documents")
    .insert({
      tenant_id: email.tenant_id,
      original_name: docTitle.slice(0, 255),
      file_type: "email",
      file_size: (email.body_text || "").length,
      status: "ready",
      summary: worthyFacts.map((f) => f.fact).join(". "),
      extracted_text: worthyFacts.map((f) => f.fact).join("\n\n"),
      metadata: {
        source: "email_analysis",
        email_id: email.id,
        from: email.from_email,
        date: email.date_received,
        category: email.category,
      },
    })
    .select("id")
    .single();

  if (docError || !doc) {
    logger.error(
      "[KnowledgeExtractor] Failed to create document:",
      docError?.message,
    );
    return 0;
  }

  // Build chunk text — combine facts with context
  const chunkText = `Email od: ${senderDisplay} (${email.from_email})
Temat: ${email.subject || "(brak)"}
Data: ${new Date(email.date_received).toLocaleDateString("pl-PL")}
Kategoria: ${email.category || "unknown"}

Kluczowe fakty:
${worthyFacts.map((f, i) => `${i + 1}. ${f.fact}`).join("\n")}`;

  // Generate embedding
  if (!OPENAI_API_KEY) {
    logger.error("[KnowledgeExtractor] Missing OPENAI_API_KEY");
    return 0;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const embResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [chunkText],
    });

    const embedding = embResponse.data[0].embedding;

    // Store chunk
    const { error: chunkError } = await supabase
      .from("exo_document_chunks")
      .insert({
        document_id: doc.id,
        tenant_id: email.tenant_id,
        chunk_index: 0,
        content: chunkText,
        embedding: JSON.stringify(embedding),
      });

    if (chunkError) {
      logger.error(
        "[KnowledgeExtractor] Chunk insert failed:",
        chunkError.message,
      );
      return 0;
    }

    // Mark facts as stored
    const updatedFacts = keyFacts.map((f) => ({
      ...f,
      stored_in_rag: worthyFacts.some((wf) => wf.fact === f.fact),
    }));

    await supabase
      .from("exo_analyzed_emails")
      .update({
        key_facts: updatedFacts,
        knowledge_extracted: true,
        knowledge_chunk_ids: [doc.id],
      })
      .eq("id", email.id);

    return 1;
  } catch (err) {
    logger.error("[KnowledgeExtractor] Embedding generation failed:", {
      error: err instanceof Error ? err.message : err,
    });
    return 0;
  }
}
