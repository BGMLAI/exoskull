-- Add missing RPC functions: hybrid_search, vector_search, vector_search_notes
-- These are called by brain.ts and vector-store.ts but were never created

-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- hybrid_search: vector similarity + full-text keyword + recency boost
-- Called by: lib/memory/brain.ts (searchVectorParallel)
--            lib/memory/vector-store.ts (hybridSearch)
-- ============================================================================
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding vector(1536),
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.25,
  match_count INTEGER DEFAULT 10,
  source_types TEXT[] DEFAULT NULL,
  recency_weight FLOAT DEFAULT 0.1,
  keyword_weight FLOAT DEFAULT 0.2,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  vector_similarity FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  -- Build tsquery from query_text (handle empty/null)
  BEGIN
    ts_query := websearch_to_tsquery('simple', query_text);
  EXCEPTION WHEN OTHERS THEN
    ts_query := NULL;
  END;

  RETURN QUERY
  SELECT
    e.id,
    e.content,
    e.source_type,
    e.source_id,
    e.metadata,
    e.created_at,
    -- Vector similarity (cosine)
    CASE
      WHEN e.embedding IS NOT NULL
      THEN (1 - (e.embedding <=> query_embedding))::FLOAT
      ELSE 0.0
    END AS vector_similarity,
    -- Keyword score (ts_rank)
    CASE
      WHEN ts_query IS NOT NULL AND to_tsvector('simple', e.content) @@ ts_query
      THEN ts_rank(to_tsvector('simple', e.content), ts_query)::FLOAT
      ELSE 0.0
    END AS keyword_score,
    -- Combined score with weights + recency boost
    (
      CASE WHEN e.embedding IS NOT NULL
        THEN (1 - (e.embedding <=> query_embedding)) * vector_weight
        ELSE 0.0
      END
      +
      CASE WHEN ts_query IS NOT NULL AND to_tsvector('simple', e.content) @@ ts_query
        THEN ts_rank(to_tsvector('simple', e.content), ts_query) * keyword_weight
        ELSE 0.0
      END
      +
      -- Recency: newer = higher score (decay over 30 days)
      GREATEST(0, 1.0 - EXTRACT(EPOCH FROM (NOW() - e.created_at)) / (30 * 86400)) * recency_weight
    )::FLOAT AS combined_score
  FROM exo_vector_embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND (source_types IS NULL OR e.source_type = ANY(source_types))
    AND (
      -- Include if vector similarity passes threshold
      (e.embedding IS NOT NULL AND (1 - (e.embedding <=> query_embedding)) >= match_threshold)
      OR
      -- OR if keyword matches
      (ts_query IS NOT NULL AND to_tsvector('simple', e.content) @@ ts_query)
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- vector_search: simple vector-only search (fallback)
-- Called by: lib/memory/vector-store.ts (fallbackVectorSearch)
-- ============================================================================
CREATE OR REPLACE FUNCTION vector_search(
  query_embedding vector(1536),
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.4,
  match_count INTEGER DEFAULT 20,
  source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
    e.source_type,
    e.source_id,
    e.metadata,
    e.created_at
  FROM exo_vector_embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND e.embedding IS NOT NULL
    AND (source_types IS NULL OR e.source_type = ANY(source_types))
    AND (1 - (e.embedding <=> query_embedding)) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- vector_search_notes: search user_notes by embedding similarity
-- Called by: lib/memory/unified-search.ts (searchNotes)
-- ============================================================================
CREATE OR REPLACE FUNCTION vector_search_notes(
  query_embedding vector(1536),
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  type TEXT,
  ai_summary TEXT,
  tags JSONB,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.content,
    n.type::TEXT,
    n.ai_summary,
    n.tags,
    n.captured_at,
    n.created_at,
    (1 - (n.embedding <=> query_embedding))::FLOAT AS similarity
  FROM user_notes n
  WHERE n.tenant_id = match_tenant_id
    AND n.embedding IS NOT NULL
    AND (1 - (n.embedding <=> query_embedding)) >= match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Add GIN index for full-text search on exo_vector_embeddings.content
-- This speeds up keyword search fallback
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_exo_vector_embeddings_content_fts
  ON exo_vector_embeddings
  USING GIN (to_tsvector('simple', content));

-- Add GIN index for full-text search on exo_unified_messages.content
CREATE INDEX IF NOT EXISTS idx_exo_unified_messages_content_fts
  ON exo_unified_messages
  USING GIN (to_tsvector('simple', content));
