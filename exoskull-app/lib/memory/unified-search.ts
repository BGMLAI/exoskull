/**
 * Unified Memory Search
 *
 * Single entry point for searching ALL memory sources:
 * - Vector store (exo_vector_embeddings via hybridSearch)
 * - Keyword search (exo_unified_messages, daily_summaries, highlights)
 * - Notes (user_notes via pgvector + ILIKE)
 * - Knowledge graph entities (exo_knowledge_entities)
 *
 * Flow:
 *   query → generateEmbedding(query)
 *     → Promise.allSettled([vectorStore, keyword, notes, entities])
 *     → entity boost → dedup → sort → limit
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { generateEmbedding } from "./vector-store";
import { hybridSearch } from "./vector-store";
import {
  keywordSearch,
  type SearchResult as KeywordSearchResult,
} from "./search";
import { searchEntities } from "./knowledge-graph";
import type {
  UnifiedSearchResult,
  UnifiedSearchOptions,
  MemorySourceType,
} from "./types";

import { logger } from "@/lib/logger";
// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_WEIGHTS = {
  vector: 0.5,
  keyword: 0.3,
  recency: 0.1,
  entity: 0.1,
};

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_SCORE = 0.05;

// ============================================================================
// UNIFIED SEARCH
// ============================================================================

/**
 * Search across ALL memory sources with unified scoring.
 * Single entry point — replaces separate calls to keywordSearch, hybridSearch, etc.
 */
export async function unifiedSearch(
  options: UnifiedSearchOptions,
): Promise<UnifiedSearchResult[]> {
  const {
    tenantId,
    query,
    limit = DEFAULT_LIMIT,
    dateFrom,
    dateTo,
    sourceTypes,
    weights = DEFAULT_WEIGHTS,
    minScore = DEFAULT_MIN_SCORE,
    useVectors = true,
    useEntityBoost = true,
  } = options;

  const w = { ...DEFAULT_WEIGHTS, ...weights };

  // Generate query embedding once (reused for vector search + notes search)
  let queryEmbedding: number[] | null = null;
  if (useVectors) {
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      logger.error(
        "[UnifiedSearch] Embedding generation failed, falling back to keyword-only:",
        {
          error: err instanceof Error ? err.message : err,
        },
      );
    }
  }

  // Determine which sources to search
  const searchAll = !sourceTypes || sourceTypes.length === 0;
  const shouldSearch = (type: MemorySourceType) =>
    searchAll || sourceTypes!.includes(type);

  // ── Run all searches in parallel ──
  const [vectorResults, keywordResults, notesResults, entityResults] =
    await Promise.allSettled([
      // 1. Vector store (documents, conversations, etc.)
      shouldSearch("document") ||
      shouldSearch("conversation") ||
      shouldSearch("email") ||
      shouldSearch("voice") ||
      shouldSearch("web")
        ? searchVectorStore(tenantId, query, queryEmbedding, limit)
        : Promise.resolve([]),

      // 2. Keyword search (messages, summaries, highlights)
      shouldSearch("message") ||
      shouldSearch("summary") ||
      shouldSearch("highlight")
        ? searchKeyword(tenantId, query, dateFrom, dateTo, limit)
        : Promise.resolve([]),

      // 3. Notes (vector + keyword on user_notes)
      shouldSearch("note")
        ? searchNotes(tenantId, query, queryEmbedding, limit)
        : Promise.resolve([]),

      // 4. Knowledge graph entities
      useEntityBoost || shouldSearch("entity")
        ? searchGraphEntities(tenantId, query)
        : Promise.resolve([]),
    ]);

  // ── Collect all results ──
  const allResults: UnifiedSearchResult[] = [];

  if (vectorResults.status === "fulfilled") {
    allResults.push(...vectorResults.value);
  }
  if (keywordResults.status === "fulfilled") {
    allResults.push(...keywordResults.value);
  }
  if (notesResults.status === "fulfilled") {
    allResults.push(...notesResults.value);
  }

  // Build entity name set for boosting
  const entityNames = new Set<string>();
  if (entityResults.status === "fulfilled") {
    for (const entity of entityResults.value) {
      entityNames.add(entity.content.toLowerCase());
      // Also add as result if searching for entities
      if (shouldSearch("entity")) {
        allResults.push(entity);
      }
    }
  }

  // ── Entity boost: results containing known entity names get +score ──
  if (useEntityBoost && entityNames.size > 0) {
    for (const result of allResults) {
      const contentLower = result.content.toLowerCase();
      const matchedEntities: string[] = [];
      for (const name of entityNames) {
        if (contentLower.includes(name)) {
          matchedEntities.push(name);
        }
      }
      if (matchedEntities.length > 0) {
        result.relatedEntities = matchedEntities;
        result.score += w.entity * Math.min(1, matchedEntities.length * 0.3);
      }
    }
  }

  // ── Deduplicate by content similarity (simple: first 100 chars) ──
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    const key = r.sourceId || r.content.slice(0, 100).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Filter by minScore, sort, limit ──
  return deduped
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// SEARCH ADAPTERS (internal — normalize results to UnifiedSearchResult)
// ============================================================================

/**
 * Vector store search via hybridSearch (documents, conversations, etc.)
 */
async function searchVectorStore(
  tenantId: string,
  query: string,
  _queryEmbedding: number[] | null,
  limit: number,
): Promise<UnifiedSearchResult[]> {
  try {
    const results = await hybridSearch(tenantId, query, {
      limit,
      minSimilarity: 0.3,
    });

    return results.map((r) => ({
      type: (r.sourceType as MemorySourceType) || "document",
      content: r.content,
      score: r.combinedScore,
      vectorSimilarity: r.similarity,
      keywordScore: r.keywordScore,
      date: r.createdAt || new Date().toISOString(),
      metadata: r.metadata,
      sourceId: r.sourceId,
    }));
  } catch (err) {
    logger.error("[UnifiedSearch:vectorStore] Error:", {
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

/**
 * Keyword search (messages, summaries, highlights)
 */
async function searchKeyword(
  tenantId: string,
  query: string,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 20,
): Promise<UnifiedSearchResult[]> {
  try {
    const results: KeywordSearchResult[] = await keywordSearch({
      tenantId,
      query,
      limit,
      dateFrom,
      dateTo,
    });

    return results.map((r) => ({
      type: r.type as MemorySourceType,
      content: r.content,
      // Normalize keyword score to 0-1 range (original can exceed 1)
      score: Math.min(1, r.score) * 0.6,
      vectorSimilarity: null,
      keywordScore: Math.min(1, r.score),
      date: r.date,
      metadata: r.metadata,
    }));
  } catch (err) {
    logger.error("[UnifiedSearch:keyword] Error:", {
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

/**
 * Notes search: pgvector similarity + ILIKE fallback on user_notes
 */
async function searchNotes(
  tenantId: string,
  query: string,
  queryEmbedding: number[] | null,
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const supabase = getServiceSupabase();
  const results: UnifiedSearchResult[] = [];

  try {
    // Vector search on notes (if embedding available)
    if (queryEmbedding) {
      const { data: vectorNotes, error } = await supabase.rpc(
        "vector_search_notes",
        {
          query_embedding: JSON.stringify(queryEmbedding),
          match_tenant_id: tenantId,
          match_threshold: 0.3,
          match_count: limit,
        },
      );

      if (!error && vectorNotes) {
        for (const note of vectorNotes) {
          results.push({
            type: "note",
            content: [note.title, note.content].filter(Boolean).join(": "),
            score: (note.similarity as number) * 0.8,
            vectorSimilarity: note.similarity as number,
            keywordScore: null,
            date: (note.captured_at as string) || (note.created_at as string),
            metadata: {
              noteId: note.id,
              noteType: note.type,
              ai_summary: note.ai_summary,
              tags: note.tags,
            },
            sourceId: `note:${note.id}`,
          });
        }
      }
    }

    // ILIKE keyword fallback (catches notes without embeddings)
    const searchPattern = `%${query.toLowerCase()}%`;
    const { data: keywordNotes, error: kwError } = await supabase
      .from("user_notes")
      .select(
        "id, title, content, type, ai_summary, tags, captured_at, created_at",
      )
      .eq("tenant_id", tenantId)
      .or(
        `title.ilike.${searchPattern},content.ilike.${searchPattern},ai_summary.ilike.${searchPattern}`,
      )
      .order("captured_at", { ascending: false })
      .limit(limit);

    if (!kwError && keywordNotes) {
      const existingIds = new Set(
        results.map((r) => r.sourceId).filter(Boolean),
      );

      for (const note of keywordNotes) {
        const sourceId = `note:${note.id}`;
        if (existingIds.has(sourceId)) continue; // Already found via vector

        results.push({
          type: "note",
          content: [note.title, note.content].filter(Boolean).join(": "),
          score: 0.3, // Lower score for keyword-only match
          vectorSimilarity: null,
          keywordScore: 0.5,
          date: note.captured_at || note.created_at,
          metadata: {
            noteId: note.id,
            noteType: note.type,
            ai_summary: note.ai_summary,
            tags: note.tags,
          },
          sourceId,
        });
      }
    }
  } catch (err) {
    logger.error("[UnifiedSearch:notes] Error:", {
      error: err instanceof Error ? err.message : err,
    });
  }

  return results;
}

/**
 * Knowledge graph entity search (for entity boost + direct entity results)
 */
async function searchGraphEntities(
  tenantId: string,
  query: string,
): Promise<UnifiedSearchResult[]> {
  try {
    const entities = await searchEntities(tenantId, query, undefined, 10);

    return entities.map((e) => ({
      type: "entity" as MemorySourceType,
      content: e.name,
      score: e.importance * 0.5,
      vectorSimilarity: null,
      keywordScore: null,
      date: e.lastMentioned || new Date().toISOString(),
      metadata: {
        entityType: e.type,
        description: e.description,
        mentionCount: e.mentionCount,
        aliases: e.aliases,
      },
      sourceId: `entity:${e.id}`,
    }));
  } catch (err) {
    logger.error("[UnifiedSearch:entities] Error:", {
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

/**
 * Format unified search results for voice/text response.
 * Groups by type for natural-sounding responses.
 */
export function formatUnifiedResultsForResponse(
  results: UnifiedSearchResult[],
  query: string,
): string {
  if (results.length === 0) {
    return `Nie znalazłem nic o "${query}" w mojej pamięci.`;
  }

  const topResults = results.slice(0, 5);
  const formatted: string[] = [];

  for (const result of topResults) {
    const date = new Date(result.date).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
    });

    switch (result.type) {
      case "message": {
        const preview =
          result.content.slice(0, 100) +
          (result.content.length > 100 ? "..." : "");
        formatted.push(`${date}: "${preview}"`);
        break;
      }
      case "summary": {
        const preview =
          result.content.slice(0, 150) +
          (result.content.length > 150 ? "..." : "");
        formatted.push(`Podsumowanie ${date}: ${preview}`);
        break;
      }
      case "highlight": {
        const category = (result.metadata?.category as string) || "info";
        formatted.push(`Zapamiętane (${category}): ${result.content}`);
        break;
      }
      case "note": {
        const noteType = (result.metadata?.noteType as string) || "notatka";
        const preview =
          result.content.slice(0, 120) +
          (result.content.length > 120 ? "..." : "");
        formatted.push(`Notatka (${noteType}, ${date}): ${preview}`);
        break;
      }
      case "document": {
        const preview =
          result.content.slice(0, 120) +
          (result.content.length > 120 ? "..." : "");
        formatted.push(`Dokument: ${preview}`);
        break;
      }
      case "entity": {
        const entityType = (result.metadata?.entityType as string) || "";
        const desc = (result.metadata?.description as string) || "";
        formatted.push(
          `${entityType ? `[${entityType}] ` : ""}${result.content}${desc ? ` — ${desc}` : ""}`,
        );
        break;
      }
      default: {
        const preview =
          result.content.slice(0, 100) +
          (result.content.length > 100 ? "..." : "");
        formatted.push(`${date}: ${preview}`);
      }
    }
  }

  if (results.length > 5) {
    formatted.push(`...i ${results.length - 5} więcej wyników.`);
  }

  const sourceBreakdown = results.reduce(
    (acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sourceSummary = Object.entries(sourceBreakdown)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");

  return `Znalazłem ${results.length} wyników dla "${query}" (${sourceSummary}):\n\n${formatted.join("\n\n")}`;
}
