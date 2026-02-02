-- Knowledge System Migration
-- Enables users to upload documents that the system uses for context

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- User Documents table
CREATE TABLE IF NOT EXISTS public.exo_user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- File info
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type VARCHAR(50), -- pdf, txt, jpg, png, md, docx
  file_size INTEGER,
  storage_path TEXT NOT NULL, -- path in Supabase Storage

  -- Parsed content
  extracted_text TEXT,
  summary TEXT, -- AI-generated summary

  -- Categorization
  category VARCHAR(50), -- health, productivity, personal, finance, other
  tags TEXT[] DEFAULT '{}',

  -- Processing status
  status VARCHAR(20) DEFAULT 'uploaded', -- uploaded, processing, ready, failed
  error_message TEXT,
  processed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document chunks for semantic search
CREATE TABLE IF NOT EXISTS public.exo_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES exo_user_documents(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Chunk content
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,

  -- Embedding (OpenAI ada-002 = 1536 dimensions)
  embedding vector(1536),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_documents_tenant ON exo_user_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_status ON exo_user_documents(status);
CREATE INDEX IF NOT EXISTS idx_user_documents_category ON exo_user_documents(category);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON exo_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant ON exo_document_chunks(tenant_id);

-- Vector similarity index (IVF for fast approximate nearest neighbor search)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON exo_document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS Policies
ALTER TABLE exo_user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_document_chunks ENABLE ROW LEVEL SECURITY;

-- Documents: Users can only see their own
CREATE POLICY "Users can view own documents"
  ON exo_user_documents FOR SELECT
  USING (auth.uid() = tenant_id);

CREATE POLICY "Users can insert own documents"
  ON exo_user_documents FOR INSERT
  WITH CHECK (auth.uid() = tenant_id);

CREATE POLICY "Users can update own documents"
  ON exo_user_documents FOR UPDATE
  USING (auth.uid() = tenant_id);

CREATE POLICY "Users can delete own documents"
  ON exo_user_documents FOR DELETE
  USING (auth.uid() = tenant_id);

-- Chunks: Users can only see their own
CREATE POLICY "Users can view own chunks"
  ON exo_document_chunks FOR SELECT
  USING (auth.uid() = tenant_id);

CREATE POLICY "Users can insert own chunks"
  ON exo_document_chunks FOR INSERT
  WITH CHECK (auth.uid() = tenant_id);

-- Service role can do everything (for background processing)
CREATE POLICY "Service role full access to documents"
  ON exo_user_documents FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to chunks"
  ON exo_document_chunks FOR ALL
  USING (auth.role() = 'service_role');

-- Function to search documents by semantic similarity
CREATE OR REPLACE FUNCTION search_user_documents(
  p_tenant_id UUID,
  p_query_embedding vector(1536),
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.7
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
    d.filename,
    d.category,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM exo_document_chunks c
  JOIN exo_user_documents d ON d.id = c.document_id
  WHERE c.tenant_id = p_tenant_id
    AND d.status = 'ready'
    AND 1 - (c.embedding <=> p_query_embedding) >= p_similarity_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION search_user_documents TO authenticated;

-- Function to get document stats
CREATE OR REPLACE FUNCTION get_document_stats(p_tenant_id UUID)
RETURNS TABLE (
  total_documents INTEGER,
  total_chunks INTEGER,
  by_category JSONB,
  by_status JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM exo_user_documents WHERE tenant_id = p_tenant_id),
    (SELECT COUNT(*)::INTEGER FROM exo_document_chunks WHERE tenant_id = p_tenant_id),
    (SELECT COALESCE(jsonb_object_agg(category, count), '{}')
     FROM (SELECT category, COUNT(*) as count
           FROM exo_user_documents
           WHERE tenant_id = p_tenant_id
           GROUP BY category) sub),
    (SELECT COALESCE(jsonb_object_agg(status, count), '{}')
     FROM (SELECT status, COUNT(*) as count
           FROM exo_user_documents
           WHERE tenant_id = p_tenant_id
           GROUP BY status) sub);
END;
$$;

GRANT EXECUTE ON FUNCTION get_document_stats TO authenticated;

-- Comments for documentation
COMMENT ON TABLE exo_user_documents IS 'User-uploaded documents for knowledge base';
COMMENT ON TABLE exo_document_chunks IS 'Chunked text with embeddings for semantic search';
COMMENT ON FUNCTION search_user_documents IS 'Search documents by semantic similarity to a query embedding';
