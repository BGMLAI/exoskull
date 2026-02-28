/**
 * Unified Ingestion Pipeline
 *
 * Single entry point for ingesting ANY content into the Unified Brain.
 *
 * Flow:
 *   Input (any source) → Parse → Chunk → Embed → Store → Extract entities → Classify layer
 *
 * Supported sources:
 *   - conversation: chat messages (filtered: >50 tokens, not "ok"/"dzięki")
 *   - document: PDF, DOCX, TXT, etc. (handled by document-processor.ts)
 *   - url: web page → Firecrawl → markdown
 *   - voice: transcription text
 *   - email: email body
 *   - note: user note as-is
 *   - image: Gemini Flash vision → extracted text
 *
 * Layer classification:
 *   - PAR (Projects/Areas/Resources): documents, goals, notes about projects
 *   - Daily: conversations, daily progress, mood
 *   - Tacit: preferences, patterns, security info, relationship details
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { chunkText, hashContent, estimateTokens } from "./chunking-pipeline";
import { storeChunksWithEmbeddings, type StoreResult } from "./vector-store";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type IngestSourceType =
  | "conversation"
  | "document"
  | "url"
  | "voice"
  | "email"
  | "note"
  | "image";

export type MemoryLayer = "par" | "daily" | "tacit";

export interface IngestInput {
  tenantId: string;
  content: string;
  sourceType: IngestSourceType;
  sourceId?: string;
  sourceName?: string;
  /** Override auto-classification */
  layer?: MemoryLayer;
  /** Additional metadata to store */
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  success: boolean;
  chunksStored: number;
  duplicatesSkipped: number;
  layer: MemoryLayer;
  entitiesExtracted?: number;
  error?: string;
}

// ============================================================================
// CONTENT FILTERS
// ============================================================================

/** Minimum token count for conversation messages to be worth embedding */
const MIN_CONVERSATION_TOKENS = 50;

/** Patterns that indicate trivial/non-meaningful conversation messages */
const TRIVIAL_PATTERNS =
  /^(ok|okej|okay|tak|nie|dzięki|dzieki|thanks|super|fajnie|git|spoko|hej|hey|hi|cześć|mhm|no|aha|rozumiem|jasne|dobra|pa|bye|nara|elo|xd|lol|haha|siema|yo|mm|hmm|uhm|yep|nope|yup|cool|nice|great|sure|yes|no|thx|ty|np|imo|btw|fyi|asap|idk)\s*[.!?]*$/i;

/**
 * Check if a conversation message is worth embedding.
 */
function isWorthEmbedding(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 20) return false;
  if (TRIVIAL_PATTERNS.test(trimmed)) return false;
  if (estimateTokens(trimmed) < MIN_CONVERSATION_TOKENS) return false;
  return true;
}

// ============================================================================
// LAYER CLASSIFICATION
// ============================================================================

/**
 * Classify content into a memory layer based on source type and content.
 */
function classifyLayer(
  sourceType: IngestSourceType,
  content: string,
): MemoryLayer {
  // Source-type defaults
  switch (sourceType) {
    case "conversation":
    case "voice":
      return "daily";
    case "document":
    case "url":
      return "par";
    case "email":
      return "daily";
    case "note":
      return classifyNoteLayer(content);
    case "image":
      return "par";
    default:
      return "daily";
  }
}

/**
 * Classify a note into PAR or Tacit based on content patterns.
 */
function classifyNoteLayer(content: string): MemoryLayer {
  const lower = content.toLowerCase();

  // Tacit patterns: preferences, personal info, passwords, relationships
  const tacitPatterns =
    /\b(prefer|wol[eę]|lubi[eę]|nie lubi|zawsze|nigdy|hasło|password|pin|kod|klucz|key|secret|token|credential|api.?key|login|always|never|habit|nawyk|prefer|ulubion|favorite)\b/i;

  if (tacitPatterns.test(lower)) return "tacit";

  // PAR patterns: projects, goals, resources
  const parPatterns =
    /\b(projekt|project|goal|cel|plan|strategy|resource|zasob|area|obszar|todo|task|deadline|termin|milestone|budget)\b/i;

  if (parPatterns.test(lower)) return "par";

  return "daily";
}

// ============================================================================
// MAIN INGESTION
// ============================================================================

/**
 * Ingest content into the Unified Brain.
 *
 * Handles: filtering → chunking → embedding → storing → entity extraction → layer classification
 */
export async function ingest(input: IngestInput): Promise<IngestResult> {
  const { tenantId, content, sourceType, sourceId, sourceName, metadata } =
    input;

  // Filter trivial conversation messages
  if (sourceType === "conversation" && !isWorthEmbedding(content)) {
    return {
      success: true,
      chunksStored: 0,
      duplicatesSkipped: 0,
      layer: "daily",
    };
  }

  // Classify layer
  const layer = input.layer || classifyLayer(sourceType, content);

  try {
    // ── Chunk the content ──
    const chunks = chunkText(content, {
      sourceType: sourceType === "conversation" ? "conversation" : "document",
      sourceId,
      sourceName,
    });

    if (chunks.length === 0) {
      return {
        success: true,
        chunksStored: 0,
        duplicatesSkipped: 0,
        layer,
      };
    }

    // ── Build layer metadata ──
    const layerMetadata: Record<string, unknown> = {
      layer,
      ...metadata,
    };

    if (layer === "par") {
      layerMetadata.par_type =
        sourceType === "document" ? "resource" : "project";
    } else if (layer === "daily") {
      layerMetadata.daily_date = new Date().toISOString().split("T")[0];
    } else if (layer === "tacit") {
      layerMetadata.tacit_category = metadata?.tacit_category || "preference";
    }

    if (sourceName) {
      layerMetadata.source_name = sourceName;
    }

    // ── Store chunks with embeddings ──
    const storeResult: StoreResult = await storeChunksWithEmbeddings(
      tenantId,
      chunks,
      sourceType,
      sourceId,
      layerMetadata,
    );

    if (!storeResult.success) {
      return {
        success: false,
        chunksStored: 0,
        duplicatesSkipped: 0,
        layer,
        error: storeResult.error,
      };
    }

    // ── Entity extraction (async, non-blocking) ──
    let entitiesExtracted = 0;
    if (content.length > 200 && storeResult.chunks > 0) {
      try {
        const { processContentForGraph } = await import("./knowledge-graph");
        const graphResult = await processContentForGraph(
          tenantId,
          content.slice(0, 6000),
          sourceType,
          sourceId,
        );
        entitiesExtracted = graphResult.entities;
      } catch (graphErr) {
        logger.warn("[Ingest] Entity extraction failed (non-blocking):", {
          error:
            graphErr instanceof Error ? graphErr.message : String(graphErr),
        });
      }
    }

    return {
      success: true,
      chunksStored: storeResult.chunks,
      duplicatesSkipped: storeResult.duplicatesSkipped,
      layer,
      entitiesExtracted,
    };
  } catch (err) {
    logger.error("[Ingest] Pipeline failed:", {
      error: err instanceof Error ? err.message : String(err),
      sourceType,
      sourceId,
      tenantId,
    });
    return {
      success: false,
      chunksStored: 0,
      duplicatesSkipped: 0,
      layer,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// BATCH INGESTION (for conversations)
// ============================================================================

/**
 * Ingest multiple conversation messages in batch.
 * Filters trivial messages, batches embeddings for efficiency.
 */
export async function ingestConversationBatch(
  tenantId: string,
  messages: Array<{
    id: string;
    content: string;
    role: string;
    channel?: string;
    created_at: string;
  }>,
): Promise<{ ingested: number; skipped: number }> {
  // Filter to meaningful messages only
  const meaningful = messages.filter((m) => isWorthEmbedding(m.content));
  const skipped = messages.length - meaningful.length;

  if (meaningful.length === 0) {
    return { ingested: 0, skipped };
  }

  // Check for existing hashes to avoid re-embedding
  const supabase = getServiceSupabase();
  const hashes = meaningful.map((m) => hashContent(m.content));
  const { data: existing } = await supabase
    .from("exo_vector_embeddings")
    .select("content_hash")
    .eq("tenant_id", tenantId)
    .in("content_hash", hashes);

  const existingHashes = new Set((existing || []).map((e) => e.content_hash));
  const newMessages = meaningful.filter(
    (m) => !existingHashes.has(hashContent(m.content)),
  );

  if (newMessages.length === 0) {
    return { ingested: 0, skipped: skipped + meaningful.length };
  }

  // Chunk and embed in batch
  const allChunks = newMessages.flatMap((m) =>
    chunkText(m.content, {
      sourceType: "conversation",
      sourceId: m.id,
    }).map((chunk) => ({
      ...chunk,
      messageId: m.id,
      messageDate: m.created_at,
      role: m.role,
      channel: m.channel,
    })),
  );

  // Store with layer metadata
  const result = await storeChunksWithEmbeddings(
    tenantId,
    allChunks,
    "conversation",
    undefined,
    {
      layer: "daily",
      daily_date: new Date().toISOString().split("T")[0],
    },
  );

  return {
    ingested: result.chunks,
    skipped: skipped + (meaningful.length - newMessages.length),
  };
}
