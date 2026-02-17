/**
 * Unified Memory Types
 *
 * Single source of truth for all memory search types.
 * Replaces duplicate SearchResult/SearchOptions from search.ts and vector-store.ts.
 */

// ============================================================================
// SOURCE TYPES
// ============================================================================

/** All possible memory source types across the system */
export type MemorySourceType =
  | "message"
  | "summary"
  | "highlight"
  | "note"
  | "document"
  | "entity"
  | "conversation"
  | "email"
  | "voice"
  | "web";

// ============================================================================
// SEARCH RESULT
// ============================================================================

/** Unified search result from any memory source */
export interface UnifiedSearchResult {
  /** Source type (message, note, highlight, document, entity, etc.) */
  type: MemorySourceType;
  /** Content text */
  content: string;
  /** Combined normalized score (0-1) */
  score: number;
  /** Vector cosine similarity (0-1), null if not vector-searched */
  vectorSimilarity: number | null;
  /** Keyword match score (0-1), null if not keyword-searched */
  keywordScore: number | null;
  /** Result date (created_at, summary_date, etc.) */
  date: string;
  /** Source-specific metadata */
  metadata?: Record<string, unknown>;
  /** Related entity names found in this result (for entity boost) */
  relatedEntities?: string[];
  /** Source ID for dedup */
  sourceId?: string;
}

// ============================================================================
// SEARCH OPTIONS
// ============================================================================

/** Options for unified search across all memory sources */
export interface UnifiedSearchOptions {
  tenantId: string;
  query: string;
  /** Max results to return (default 20) */
  limit?: number;
  /** Date range filters */
  dateFrom?: string;
  dateTo?: string;
  /** Filter by source types. If empty/undefined, search all. */
  sourceTypes?: MemorySourceType[];
  /** Score weights (must sum to ~1.0) */
  weights?: {
    /** Weight for vector similarity (default 0.5) */
    vector?: number;
    /** Weight for keyword match (default 0.3) */
    keyword?: number;
    /** Weight for recency (default 0.1) */
    recency?: number;
    /** Weight for entity boost (default 0.1) */
    entity?: number;
  };
  /** Minimum combined score to include (default 0.05) */
  minScore?: number;
  /** Use vector search (default true) */
  useVectors?: boolean;
  /** Use entity boost from knowledge graph (default true) */
  useEntityBoost?: boolean;
}
