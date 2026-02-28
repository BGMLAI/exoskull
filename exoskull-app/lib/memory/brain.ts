/**
 * Unified Brain — Single search entry point for ExoSkull
 *
 * Replaces search_memory + search_knowledge with one intelligent search.
 *
 * Pipeline (QMD-inspired):
 *   1. Query expansion — Gemini Flash generates 2 alternative queries
 *   2. Parallel search on 3 queries:
 *      - BM25 keyword (Postgres FTS on exo_vector_embeddings + exo_unified_messages)
 *      - Vector similarity (pgvector cosine on exo_vector_embeddings)
 *   3. Reciprocal Rank Fusion (k=60) — merges results from both methods
 *   4. Reranking — top 20 results → Gemini Flash scores relevance 0-10
 *   5. Entity boost — results containing known entities get +score
 *   6. Return top K with metadata
 *
 * Cost: ~$0.001 per search (1 Gemini Flash call expansion + 1 reranking)
 *
 * Three memory layers:
 *   - PAR (Projects/Areas/Resources) — life catalog
 *   - Daily — today's conversations, progress, mood
 *   - Tacit — preferences, patterns, security info
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { generateEmbedding } from "./vector-store";
import { searchEntities } from "./knowledge-graph";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type BrainLayer = "par" | "daily" | "tacit" | "all";

export interface BrainSearchOptions {
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  layer?: BrainLayer;
}

export interface BrainSearchResult {
  content: string;
  score: number;
  sourceType: string;
  sourceId?: string;
  layer?: string;
  date?: string;
  metadata?: Record<string, unknown>;
  relatedEntities?: string[];
  /** How this result was found */
  matchMethod: "vector" | "keyword" | "both";
}

// ============================================================================
// CONFIG
// ============================================================================

/** RRF constant — higher = more weight to lower-ranked results */
const RRF_K = 60;

/** Max results to rerank (controls cost) */
const RERANK_POOL_SIZE = 20;

// ============================================================================
// MAIN SEARCH
// ============================================================================

/**
 * Search the unified brain across all memory layers.
 *
 * Uses query expansion + parallel BM25/vector search + RRF fusion + reranking.
 */
export async function searchBrain(
  tenantId: string,
  query: string,
  options?: BrainSearchOptions,
): Promise<BrainSearchResult[]> {
  const limit = options?.limit ?? 10;
  const layer = options?.layer ?? "all";

  const startMs = Date.now();

  try {
    // ── Step 1: Query expansion (Gemini Flash) ──
    const expandedQueries = await expandQuery(query);
    const allQueries = [query, ...expandedQueries];

    // ── Step 2: Parallel search with all queries ──
    const [vectorResults, keywordResults, entityResults] =
      await Promise.allSettled([
        searchVectorParallel(tenantId, allQueries, layer, RERANK_POOL_SIZE),
        searchKeywordParallel(
          tenantId,
          allQueries,
          layer,
          RERANK_POOL_SIZE,
          options?.dateFrom,
          options?.dateTo,
        ),
        searchEntities(tenantId, query, undefined, 10).catch(() => []),
      ]);

    // ── Step 3: Reciprocal Rank Fusion ──
    const vectorHits =
      vectorResults.status === "fulfilled" ? vectorResults.value : [];
    const keywordHits =
      keywordResults.status === "fulfilled" ? keywordResults.value : [];

    const fused = reciprocalRankFusion(vectorHits, keywordHits);

    // ── Step 4: Entity boost ──
    const entityNames = new Set<string>();
    if (entityResults.status === "fulfilled") {
      for (const e of entityResults.value) {
        entityNames.add(e.name.toLowerCase());
      }
    }

    if (entityNames.size > 0) {
      for (const result of fused) {
        const contentLower = result.content.toLowerCase();
        const matched: string[] = [];
        for (const name of entityNames) {
          if (contentLower.includes(name)) {
            matched.push(name);
          }
        }
        if (matched.length > 0) {
          result.relatedEntities = matched;
          result.score += 0.05 * Math.min(matched.length, 3);
        }
      }
    }

    // ── Step 5: Reranking (Gemini Flash) ──
    const pool = fused.slice(0, RERANK_POOL_SIZE);
    let reranked: BrainSearchResult[];

    if (pool.length > 3) {
      reranked = await rerankResults(query, pool);
    } else {
      reranked = pool;
    }

    // ── Step 6: Sort and limit ──
    reranked.sort((a, b) => b.score - a.score);
    const finalResults = reranked.slice(0, limit);

    const durationMs = Date.now() - startMs;
    logger.info("[Brain] Search complete:", {
      query: query.slice(0, 50),
      expanded: expandedQueries.length,
      vectorHits: vectorHits.length,
      keywordHits: keywordHits.length,
      fused: fused.length,
      reranked: finalResults.length,
      entities: entityNames.size,
      durationMs,
    });

    return finalResults;
  } catch (err) {
    logger.error("[Brain] Search failed, falling back to simple search:", {
      error: err instanceof Error ? err.message : String(err),
      query: query.slice(0, 50),
    });
    return fallbackSimpleSearch(tenantId, query, limit);
  }
}

/**
 * Store a fact explicitly in tacit knowledge layer.
 */
export async function remember(
  tenantId: string,
  content: string,
  category:
    | "preference"
    | "pattern"
    | "security"
    | "relationship" = "preference",
): Promise<{ success: boolean; error?: string }> {
  try {
    const { storeWithEmbedding } = await import("./vector-store");
    const result = await storeWithEmbedding({
      tenantId,
      content,
      sourceType: "conversation",
      metadata: {
        layer: "tacit",
        tacit_category: category,
        remembered_at: new Date().toISOString(),
        explicit: true,
      },
    });
    return { success: result.success, error: result.error };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// QUERY EXPANSION
// ============================================================================

/**
 * Generate 2 alternative queries using Gemini Flash.
 * Example: "klucze Allegro" → ["Allegro API credentials", "marketplace authentication keys"]
 */
async function expandQuery(query: string): Promise<string[]> {
  try {
    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiKey) return [];

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Generate exactly 2 alternative search queries for finding information related to this query. Return ONLY the 2 queries, one per line, no numbering, no explanation.

Query: "${query}"`,
            },
          ],
        },
      ],
      config: { maxOutputTokens: 100, temperature: 0.5 },
    });

    const text = response.text || "";
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 2 && l.length < 200);

    return lines.slice(0, 2);
  } catch (err) {
    logger.warn("[Brain] Query expansion failed (non-blocking):", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ============================================================================
// VECTOR SEARCH
// ============================================================================

/**
 * Run vector search for multiple queries in parallel, merge results.
 */
async function searchVectorParallel(
  tenantId: string,
  queries: string[],
  layer: BrainLayer,
  limit: number,
): Promise<BrainSearchResult[]> {
  const supabase = getServiceSupabase();

  // Generate embeddings for all queries
  const embeddings = await Promise.all(
    queries.map((q) => generateEmbedding(q).catch(() => null)),
  );

  const validEmbeddings = embeddings.filter((e): e is number[] => e !== null);
  if (validEmbeddings.length === 0) return [];

  // Search with each embedding
  const searchPromises = validEmbeddings.map(async (emb) => {
    const { data, error } = await supabase.rpc("hybrid_search", {
      query_text: queries[0],
      query_embedding: JSON.stringify(emb),
      match_tenant_id: tenantId,
      match_threshold: 0.25,
      match_count: limit,
      source_types: null,
      recency_weight: 0.1,
      keyword_weight: 0.2,
      vector_weight: 0.7,
    });

    if (error) {
      logger.warn("[Brain] Vector search RPC failed:", {
        error: error.message,
      });
      return [];
    }

    return (data || []).map(
      (r: Record<string, unknown>): BrainSearchResult => ({
        content: r.content as string,
        score: r.combined_score as number,
        sourceType: r.source_type as string,
        sourceId: r.source_id as string | undefined,
        layer:
          ((r.metadata as Record<string, unknown>)?.layer as string) ||
          undefined,
        date: r.created_at as string | undefined,
        metadata: r.metadata as Record<string, unknown>,
        matchMethod: "vector",
      }),
    );
  });

  const allResults = (await Promise.all(searchPromises)).flat();

  // Filter by layer if specified
  if (layer !== "all") {
    return allResults.filter((r) => !r.layer || r.layer === layer);
  }

  return allResults;
}

// ============================================================================
// KEYWORD SEARCH
// ============================================================================

/**
 * Run keyword search across unified messages + vector embeddings content.
 */
async function searchKeywordParallel(
  tenantId: string,
  queries: string[],
  layer: BrainLayer,
  limit: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<BrainSearchResult[]> {
  const supabase = getServiceSupabase();
  const allResults: BrainSearchResult[] = [];

  for (const query of queries) {
    const keywords = query
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5);
    if (keywords.length === 0) continue;

    const tsQuery = keywords.join(" & ");

    // Search exo_unified_messages (conversations)
    try {
      let msgQuery = supabase
        .from("exo_unified_messages")
        .select("id, content, role, channel, created_at")
        .eq("tenant_id", tenantId)
        .textSearch("content", tsQuery)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (dateFrom) msgQuery = msgQuery.gte("created_at", dateFrom);
      if (dateTo) msgQuery = msgQuery.lte("created_at", dateTo);

      const { data: msgs } = await msgQuery;

      for (const msg of msgs || []) {
        allResults.push({
          content: msg.content,
          score: 0.4,
          sourceType: "message",
          sourceId: msg.id,
          layer: "daily",
          date: msg.created_at,
          metadata: { role: msg.role, channel: msg.channel },
          matchMethod: "keyword",
        });
      }
    } catch {
      // Non-blocking
    }

    // Search exo_vector_embeddings content (documents, notes, etc.)
    try {
      const { data: vecContent } = await supabase
        .from("exo_vector_embeddings")
        .select("content, source_type, source_id, metadata, created_at")
        .eq("tenant_id", tenantId)
        .textSearch("content", tsQuery)
        .limit(limit);

      for (const v of vecContent || []) {
        const meta = v.metadata as Record<string, unknown> | null;
        allResults.push({
          content: v.content,
          score: 0.35,
          sourceType: v.source_type,
          sourceId: v.source_id,
          layer: (meta?.layer as string) || undefined,
          date: v.created_at,
          metadata: meta || undefined,
          matchMethod: "keyword",
        });
      }
    } catch {
      // Non-blocking
    }
  }

  // Filter by layer if specified
  if (layer !== "all") {
    return allResults.filter((r) => !r.layer || r.layer === layer);
  }

  return allResults;
}

// ============================================================================
// RECIPROCAL RANK FUSION
// ============================================================================

/**
 * Merge ranked lists using Reciprocal Rank Fusion (Cormack et al. 2009).
 * score(d) = sum over lists: 1 / (k + rank_in_list)
 */
function reciprocalRankFusion(
  ...resultSets: BrainSearchResult[][]
): BrainSearchResult[] {
  const scoreMap = new Map<
    string,
    { score: number; result: BrainSearchResult }
  >();

  for (const results of resultSets) {
    // Sort by original score descending
    const sorted = [...results].sort((a, b) => b.score - a.score);

    for (let rank = 0; rank < sorted.length; rank++) {
      const r = sorted[rank];
      const key = r.sourceId || r.content.slice(0, 100);
      const rrfScore = 1 / (RRF_K + rank + 1);

      const existing = scoreMap.get(key);
      if (existing) {
        existing.score += rrfScore;
        // Upgrade matchMethod to "both" if found in multiple lists
        if (existing.result.matchMethod !== r.matchMethod) {
          existing.result.matchMethod = "both";
        }
      } else {
        scoreMap.set(key, { score: rrfScore, result: { ...r } });
      }
    }
  }

  // Convert back to array with RRF scores
  return Array.from(scoreMap.values())
    .map(({ score, result }) => ({ ...result, score }))
    .sort((a, b) => b.score - a.score);
}

// ============================================================================
// RERANKING
// ============================================================================

/**
 * Rerank top results using Gemini Flash relevance scoring.
 */
async function rerankResults(
  query: string,
  results: BrainSearchResult[],
): Promise<BrainSearchResult[]> {
  try {
    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiKey) return results;

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // Build numbered list of results for scoring
    const numbered = results
      .map((r, i) => `[${i}] ${r.content.slice(0, 300)}`)
      .join("\n\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Rate the relevance of each result to the query on a scale of 0-10. Return ONLY a JSON array of scores in order, e.g. [8, 3, 7, ...]. No explanation.

Query: "${query}"

Results:
${numbered}`,
            },
          ],
        },
      ],
      config: { maxOutputTokens: 200, temperature: 0 },
    });

    const text = (response.text || "").trim();
    // Extract JSON array from response
    const match = text.match(/\[[\d,\s.]+\]/);
    if (!match) return results;

    const scores: number[] = JSON.parse(match[0]);

    // Apply rerank scores (normalize to 0-1 and blend with RRF score)
    return results.map((r, i) => {
      const rerankScore = (scores[i] ?? 5) / 10;
      return {
        ...r,
        score: r.score * 0.4 + rerankScore * 0.6,
      };
    });
  } catch (err) {
    logger.warn("[Brain] Reranking failed (non-blocking):", {
      error: err instanceof Error ? err.message : String(err),
    });
    return results;
  }
}

// ============================================================================
// FALLBACK
// ============================================================================

/**
 * Simple fallback search when brain pipeline fails.
 */
async function fallbackSimpleSearch(
  tenantId: string,
  query: string,
  limit: number,
): Promise<BrainSearchResult[]> {
  const { unifiedSearch } = await import("./unified-search");
  const results = await unifiedSearch({ tenantId, query, limit });

  return results.map((r) => ({
    content: r.content,
    score: r.score,
    sourceType: r.type,
    sourceId: r.sourceId,
    date: r.date,
    metadata: r.metadata,
    matchMethod: "both" as const,
  }));
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

/**
 * Format brain search results for agent response.
 */
export function formatBrainResults(
  results: BrainSearchResult[],
  query: string,
): string {
  if (results.length === 0) {
    return `Nie znalazłem nic o "${query}" w mojej pamięci.`;
  }

  const topResults = results.slice(0, 8);
  const formatted: string[] = [];

  for (const r of topResults) {
    const date = r.date
      ? new Date(r.date).toLocaleDateString("pl-PL", {
          day: "numeric",
          month: "short",
        })
      : "";

    const layerTag = r.layer ? `[${r.layer}]` : "";
    const sourceTag = r.sourceType ? `(${r.sourceType})` : "";
    const entities =
      r.relatedEntities && r.relatedEntities.length > 0
        ? ` | powiązane: ${r.relatedEntities.join(", ")}`
        : "";

    const preview =
      r.content.slice(0, 200) + (r.content.length > 200 ? "..." : "");

    formatted.push(
      `${layerTag} ${sourceTag} ${date}: ${preview}${entities}`.trim(),
    );
  }

  const sourceBreakdown = results.reduce(
    (acc, r) => {
      acc[r.sourceType] = (acc[r.sourceType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sourceSummary = Object.entries(sourceBreakdown)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");

  return `Znalazłem ${results.length} wyników dla "${query}" (${sourceSummary}):\n\n${formatted.join("\n\n")}`;
}
