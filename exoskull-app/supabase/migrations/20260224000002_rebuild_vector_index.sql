-- Fix: IVFFlat index was created on empty table, resulting in 0 clusters.
-- All subsequent inserts are invisible to index-based queries.
-- Solution: Drop and recreate using HNSW (works even on empty tables).

-- Drop the broken IVFFlat index
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- Recreate as HNSW (no training data needed, works immediately)
CREATE INDEX idx_document_chunks_embedding
  ON exo_document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
