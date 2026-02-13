/**
 * Vector Store — Semantic Search Engine
 *
 * Uses pgvector in Supabase for embedding-based search.
 * Embeddings via OpenAI text-embedding-3-small (cheapest, good quality).
 *
 * Provides:
 * - Store embeddings for any content (documents, conversations, notes)
 * - Hybrid search: vector similarity + full-text keyword + recency boost
 * - Auto-chunking via chunking pipeline
 * - Deduplication via content hash
 * - Batch upsert with configurable concurrency
 * - Deletion by source
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import {
  chunkText,
  hashContent,
  type TextChunk,
  type ChunkOptions,
} from "./chunking-pipeline";

// ============================================================================
// CONFIG
// ============================================================================

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
/** Max texts per OpenAI batch embedding call */
const EMBEDDING_BATCH_SIZE = 100;
/** Max chunk character length sent to embedding API */
const MAX_EMBEDDING_INPUT = 8000;

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Generate embedding vector for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set for embeddings");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, MAX_EMBEDDING_INPUT),
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts (batch).
 * Handles splitting into sub-batches of EMBEDDING_BATCH_SIZE.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const allEmbeddings: number[][] = [];

  // Process in batches (OpenAI supports up to 2048 but we limit for reliability)
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch.map((t) => t.slice(0, MAX_EMBEDDING_INPUT)),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Batch embedding error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const embeddings = data.data
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// ============================================================================
// STORAGE
// ============================================================================

export interface VectorEntry {
  id?: string;
  tenantId: string;
  content: string;
  sourceType: "document" | "conversation" | "note" | "email" | "voice" | "web";
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface StoreResult {
  success: boolean;
  chunks: number;
  duplicatesSkipped: number;
  error?: string;
}

/**
 * Store content with embeddings. Auto-chunks large content.
 * Deduplicates by content hash within tenant.
 */
export async function storeWithEmbedding(
  entry: VectorEntry,
  chunkOptions?: ChunkOptions,
): Promise<StoreResult> {
  const supabase = getServiceSupabase();

  try {
    // Chunk the content
    const chunks = chunkText(entry.content, {
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      ...chunkOptions,
    });

    if (chunks.length === 0) {
      return { success: true, chunks: 0, duplicatesSkipped: 0 };
    }

    // Check for existing hashes (dedup)
    const hashes = chunks.map((c) => c.contentHash);
    const { data: existing } = await supabase
      .from("exo_vector_embeddings")
      .select("content_hash")
      .eq("tenant_id", entry.tenantId)
      .in("content_hash", hashes);

    const existingHashes = new Set((existing || []).map((e) => e.content_hash));
    const newChunks = chunks.filter((c) => !existingHashes.has(c.contentHash));
    const duplicatesSkipped = chunks.length - newChunks.length;

    if (newChunks.length === 0) {
      return { success: true, chunks: 0, duplicatesSkipped };
    }

    // Generate embeddings for new chunks
    const embeddings = await generateEmbeddingsBatch(
      newChunks.map((c) => c.content),
    );

    // Build rows
    const rows = newChunks.map((chunk, i) => ({
      tenant_id: entry.tenantId,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding: JSON.stringify(embeddings[i]),
      source_type: entry.sourceType,
      source_id: entry.sourceId,
      chunk_index: chunk.index,
      total_chunks: chunk.totalChunks,
      metadata: {
        ...entry.metadata,
        section_heading: chunk.sectionHeading,
        strategy: chunk.metadata.strategy,
        start_offset: chunk.startOffset,
        end_offset: chunk.endOffset,
        estimated_tokens: chunk.estimatedTokens,
      },
    }));

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase
        .from("exo_vector_embeddings")
        .insert(batch);
      if (error) {
        console.error("[VectorStore:storeWithEmbedding:batchFailed]", {
          batch: i,
          error: error.message,
        });
      }
    }

    return { success: true, chunks: newChunks.length, duplicatesSkipped };
  } catch (err) {
    return {
      success: false,
      chunks: 0,
      duplicatesSkipped: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Store pre-chunked content with embeddings.
 * Used when caller has already chunked (e.g. ingestion pipeline).
 */
export async function storeChunksWithEmbeddings(
  tenantId: string,
  chunks: TextChunk[],
  sourceType: string,
  sourceId?: string,
  extraMetadata?: Record<string, unknown>,
): Promise<StoreResult> {
  const supabase = getServiceSupabase();

  try {
    if (chunks.length === 0) {
      return { success: true, chunks: 0, duplicatesSkipped: 0 };
    }

    // Dedup check
    const hashes = chunks.map((c) => c.contentHash);
    const { data: existing } = await supabase
      .from("exo_vector_embeddings")
      .select("content_hash")
      .eq("tenant_id", tenantId)
      .in("content_hash", hashes);

    const existingHashes = new Set((existing || []).map((e) => e.content_hash));
    const newChunks = chunks.filter((c) => !existingHashes.has(c.contentHash));
    const duplicatesSkipped = chunks.length - newChunks.length;

    if (newChunks.length === 0) {
      return { success: true, chunks: 0, duplicatesSkipped };
    }

    // Generate embeddings
    const embeddings = await generateEmbeddingsBatch(
      newChunks.map((c) => c.content),
    );

    // Build rows
    const rows = newChunks.map((chunk, i) => ({
      tenant_id: tenantId,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding: JSON.stringify(embeddings[i]),
      source_type: sourceType,
      source_id: sourceId,
      chunk_index: chunk.index,
      total_chunks: chunk.totalChunks,
      metadata: {
        ...extraMetadata,
        section_heading: chunk.sectionHeading,
        strategy: chunk.metadata.strategy,
        start_offset: chunk.startOffset,
        end_offset: chunk.endOffset,
      },
    }));

    // Insert in batches
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase
        .from("exo_vector_embeddings")
        .insert(batch);
      if (error) {
        console.error("[VectorStore:storeChunks:batchFailed]", {
          batch: i,
          error: error.message,
        });
      }
    }

    return { success: true, chunks: newChunks.length, duplicatesSkipped };
  } catch (err) {
    return {
      success: false,
      chunks: 0,
      duplicatesSkipped: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// SEARCH
// ============================================================================

export interface SearchResult {
  content: string;
  similarity: number;
  keywordScore: number;
  combinedScore: number;
  sourceType: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface SearchOptions {
  limit?: number;
  sourceTypes?: string[];
  minSimilarity?: number;
  recencyBoost?: boolean;
  /** Weight for vector similarity (0-1, default 0.6) */
  vectorWeight?: number;
  /** Weight for keyword match (0-1, default 0.3) */
  keywordWeight?: number;
  /** Weight for recency (0-1, default 0.1) */
  recencyWeight?: number;
}

/**
 * Hybrid search: vector similarity + full-text keyword + recency boost.
 * Uses the hybrid_search SQL function for server-side scoring.
 */
export async function hybridSearch(
  tenantId: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const supabase = getServiceSupabase();
  const limit = options?.limit || 10;
  const minSimilarity = options?.minSimilarity || 0.4;

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Call hybrid_search RPC function
    const { data, error } = await supabase.rpc("hybrid_search", {
      query_text: query,
      query_embedding: JSON.stringify(queryEmbedding),
      match_tenant_id: tenantId,
      match_threshold: minSimilarity,
      match_count: limit,
      source_types: options?.sourceTypes || null,
      recency_weight: options?.recencyWeight ?? 0.1,
      keyword_weight: options?.keywordWeight ?? 0.3,
      vector_weight: options?.vectorWeight ?? 0.6,
    });

    if (error) {
      console.warn("[VectorStore:hybridSearch:rpcFailed]", error.message);
      // Fallback to legacy vector_search
      return fallbackVectorSearch(
        tenantId,
        queryEmbedding,
        query,
        limit,
        options,
      );
    }

    return (data || []).map((r: Record<string, unknown>) => ({
      content: r.content as string,
      similarity: r.vector_similarity as number,
      keywordScore: r.keyword_score as number,
      combinedScore: r.combined_score as number,
      sourceType: r.source_type as string,
      sourceId: r.source_id as string | undefined,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.created_at as string | undefined,
    }));
  } catch (err) {
    console.error("[VectorStore:hybridSearch:error]", err);
    return keywordSearch(tenantId, query, limit);
  }
}

/**
 * Fallback: legacy vector_search RPC (from original migration).
 */
async function fallbackVectorSearch(
  tenantId: string,
  queryEmbedding: number[],
  query: string,
  limit: number,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("vector_search", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_tenant_id: tenantId,
    match_threshold: options?.minSimilarity || 0.4,
    match_count: limit * 2,
    source_types: options?.sourceTypes || null,
  });

  if (error) {
    console.warn("[VectorStore:fallbackVectorSearch:failed]", error.message);
    return keywordSearch(tenantId, query, limit);
  }

  let results = (data || []).map((r: Record<string, unknown>) => ({
    content: r.content as string,
    similarity: r.similarity as number,
    keywordScore: 0,
    combinedScore: r.similarity as number,
    sourceType: r.source_type as string,
    sourceId: r.source_id as string | undefined,
    metadata: r.metadata as Record<string, unknown>,
  }));

  // Client-side recency boost
  if (options?.recencyBoost) {
    results = results.map((r: SearchResult) => {
      const createdAt = (r.metadata as Record<string, unknown>)
        ?.created_at as string;
      if (createdAt) {
        const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
        const recencyFactor = Math.max(0, 1 - ageHours / (24 * 30));
        return { ...r, combinedScore: r.similarity + recencyFactor * 0.1 };
      }
      return r;
    });
  }

  return results
    .sort(
      (a: SearchResult, b: SearchResult) => b.combinedScore - a.combinedScore,
    )
    .slice(0, limit);
}

/**
 * Keyword-only search (fallback when vector/hybrid fails).
 */
async function keywordSearch(
  tenantId: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_vector_embeddings")
    .select("content, source_type, source_id, metadata, created_at")
    .eq("tenant_id", tenantId)
    .textSearch("content", query.split(" ").join(" & "))
    .limit(limit);

  return (data || []).map((r) => ({
    content: r.content,
    similarity: 0,
    keywordScore: 0.5,
    combinedScore: 0.5,
    sourceType: r.source_type,
    sourceId: r.source_id,
    metadata: r.metadata as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

// ============================================================================
// DELETION
// ============================================================================

/**
 * Delete all embeddings for a specific source.
 */
export async function deleteBySource(
  tenantId: string,
  sourceType: string,
  sourceId: string,
): Promise<{ deleted: number }> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from("exo_vector_embeddings")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) {
    console.error("[VectorStore:deleteBySource:error]", error.message);
    return { deleted: 0 };
  }

  return { deleted: count || 0 };
}

/**
 * Delete specific embeddings by content hashes.
 */
export async function deleteByHashes(
  tenantId: string,
  hashes: string[],
): Promise<{ deleted: number }> {
  const supabase = getServiceSupabase();

  const { count, error } = await supabase
    .from("exo_vector_embeddings")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .in("content_hash", hashes);

  if (error) {
    console.error("[VectorStore:deleteByHashes:error]", error.message);
    return { deleted: 0 };
  }

  return { deleted: count || 0 };
}

// ============================================================================
// STATS
// ============================================================================

export interface IngestionStats {
  totalChunks: number;
  totalSources: number;
  bySource: Record<string, number>;
  lastIngestion?: string;
  oldestEmbedding?: string;
  estimatedTokens: number;
}

/**
 * Get detailed ingestion statistics for a tenant.
 */
export async function getIngestionStats(
  tenantId: string,
): Promise<IngestionStats> {
  const supabase = getServiceSupabase();

  // Total count
  const { count } = await supabase
    .from("exo_vector_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  // Count by source type
  const { data: sources } = await supabase
    .from("exo_vector_embeddings")
    .select("source_type")
    .eq("tenant_id", tenantId);

  const bySource: Record<string, number> = {};
  for (const s of sources || []) {
    bySource[s.source_type] = (bySource[s.source_type] || 0) + 1;
  }

  // Unique sources count
  const { data: uniqueSources } = await supabase
    .from("exo_vector_embeddings")
    .select("source_id")
    .eq("tenant_id", tenantId)
    .not("source_id", "is", null);

  const uniqueSourceIds = new Set(
    (uniqueSources || []).map((s) => s.source_id),
  );

  // Latest and oldest
  const { data: latest } = await supabase
    .from("exo_vector_embeddings")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: oldest } = await supabase
    .from("exo_vector_embeddings")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1);

  // Rough token estimate (chunks * avg 375 tokens/chunk)
  const totalChunks = count || 0;

  return {
    totalChunks,
    totalSources: uniqueSourceIds.size,
    bySource,
    lastIngestion: latest?.[0]?.created_at,
    oldestEmbedding: oldest?.[0]?.created_at,
    estimatedTokens: totalChunks * 375,
  };
}
