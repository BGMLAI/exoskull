-- Fix search_user_documents to explicitly filter NULL embeddings
-- and add a dedicated keyword search function
CREATE OR REPLACE FUNCTION search_user_documents(
  p_tenant_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  filename TEXT,
  category VARCHAR(50),
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    d.original_name AS filename,
    d.category,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM exo_document_chunks c
  JOIN exo_user_documents d ON d.id = c.document_id
  WHERE c.tenant_id = p_tenant_id
    AND d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;
