-- ============================================================================
-- HNSW Index on user_notes.embedding + Vector Search Function
-- Enables fast approximate nearest neighbor search for note embeddings.
-- ============================================================================

-- Create HNSW index for vector similarity search on notes
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw
  ON user_notes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Vector search function for notes
-- ============================================================================

CREATE OR REPLACE FUNCTION vector_search_notes(
  query_embedding TEXT,
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  type TEXT,
  ai_summary TEXT,
  tags TEXT[],
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
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
    1 - (n.embedding <=> query_embedding::vector) AS similarity
  FROM user_notes n
  WHERE n.tenant_id = match_tenant_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY n.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;
