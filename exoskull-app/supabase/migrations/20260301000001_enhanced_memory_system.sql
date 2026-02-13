-- ============================================================================
-- Enhanced Memory System: Ingestion Jobs, FTS, Hybrid Search
-- Depends on: 20260228000001_vector_and_knowledge_graph.sql (pgvector, tables)
-- ============================================================================

-- ============================================================================
-- INGESTION JOBS — track async document/content processing with progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_ingestion_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'document', -- document, url, conversation, email, voice, bulk
  source_id TEXT, -- FK to exo_user_documents.id or other source
  source_name TEXT, -- human-readable name (filename, URL, etc.)
  status TEXT NOT NULL DEFAULT 'pending', -- pending, extracting, chunking, embedding, graph_extracting, completed, failed
  total_steps INTEGER DEFAULT 5, -- total pipeline steps
  current_step INTEGER DEFAULT 0, -- current step (0-based)
  step_label TEXT, -- human-readable current step description
  chunks_total INTEGER DEFAULT 0,
  chunks_processed INTEGER DEFAULT 0,
  entities_extracted INTEGER DEFAULT 0,
  relationships_extracted INTEGER DEFAULT 0,
  embeddings_stored INTEGER DEFAULT 0,
  error_message TEXT,
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Metadata (file size, content type, etc.)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant ON exo_ingestion_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON exo_ingestion_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_source ON exo_ingestion_jobs(source_id);

ALTER TABLE exo_ingestion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_ingestion_access" ON exo_ingestion_jobs
  FOR ALL USING (tenant_id = auth.uid());

-- ============================================================================
-- FULL-TEXT SEARCH index on vector embeddings content
-- ============================================================================

-- GIN index for keyword/full-text search fallback
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_fts
  ON exo_vector_embeddings
  USING gin (to_tsvector('simple', content));

-- Content hash column for deduplication
ALTER TABLE exo_vector_embeddings ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_hash
  ON exo_vector_embeddings(tenant_id, content_hash);

-- ============================================================================
-- ENHANCED HYBRID SEARCH — vector similarity + full-text score + recency
-- ============================================================================

CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding TEXT,
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 10,
  source_types TEXT[] DEFAULT NULL,
  recency_weight FLOAT DEFAULT 0.1,
  keyword_weight FLOAT DEFAULT 0.3,
  vector_weight FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB,
  vector_similarity FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      e.id,
      e.content,
      e.source_type,
      e.source_id,
      e.metadata,
      e.created_at,
      (1 - (e.embedding <=> query_embedding::vector)) AS v_sim
    FROM exo_vector_embeddings e
    WHERE e.tenant_id = match_tenant_id
      AND (source_types IS NULL OR e.source_type = ANY(source_types))
      AND (1 - (e.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY e.embedding <=> query_embedding::vector
    LIMIT match_count * 3
  ),
  keyword_results AS (
    SELECT
      e.id,
      ts_rank_cd(
        to_tsvector('simple', e.content),
        plainto_tsquery('simple', query_text)
      ) AS k_score
    FROM exo_vector_embeddings e
    WHERE e.tenant_id = match_tenant_id
      AND (source_types IS NULL OR e.source_type = ANY(source_types))
      AND to_tsvector('simple', e.content) @@ plainto_tsquery('simple', query_text)
  )
  SELECT
    vr.id,
    vr.content,
    vr.source_type,
    vr.source_id,
    vr.metadata,
    vr.v_sim AS vector_similarity,
    COALESCE(kr.k_score, 0.0)::FLOAT AS keyword_score,
    (
      vr.v_sim * vector_weight
      + COALESCE(kr.k_score, 0.0) * keyword_weight
      + GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - vr.created_at)) / (86400 * 30)) * recency_weight
    )::FLOAT AS combined_score,
    vr.created_at
  FROM vector_results vr
  LEFT JOIN keyword_results kr ON kr.id = vr.id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- KNOWLEDGE GRAPH: Add embedding column for entity search
-- ============================================================================

ALTER TABLE exo_knowledge_entities ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE exo_knowledge_entities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE exo_knowledge_entities ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.5;

-- Enable pg_trgm for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for entity name search
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name_trgm
  ON exo_knowledge_entities USING gin (name gin_trgm_ops);

-- Enable trigram extension for fuzzy entity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Entity search function (fuzzy name match + optional vector)
CREATE OR REPLACE FUNCTION search_entities(
  match_tenant_id UUID,
  search_name TEXT DEFAULT NULL,
  entity_types TEXT[] DEFAULT NULL,
  match_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  properties JSONB,
  mention_count INTEGER,
  last_mentioned TIMESTAMPTZ,
  description TEXT,
  importance FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    e.properties,
    e.mention_count,
    e.last_mentioned,
    e.description,
    e.importance,
    CASE
      WHEN search_name IS NOT NULL THEN similarity(e.name, search_name)
      ELSE 1.0
    END::FLOAT AS similarity
  FROM exo_knowledge_entities e
  WHERE e.tenant_id = match_tenant_id
    AND (entity_types IS NULL OR e.type = ANY(entity_types))
    AND (search_name IS NULL OR e.name % search_name OR e.name ILIKE '%' || search_name || '%')
  ORDER BY
    CASE WHEN search_name IS NOT NULL THEN similarity(e.name, search_name) ELSE 0 END DESC,
    e.mention_count DESC
  LIMIT match_limit;
END;
$$;

-- ============================================================================
-- GRAPH TRAVERSAL: Find connected entities (BFS up to N hops)
-- ============================================================================

CREATE OR REPLACE FUNCTION traverse_knowledge_graph(
  match_tenant_id UUID,
  start_entity_id UUID,
  max_hops INT DEFAULT 2,
  max_results INT DEFAULT 50
)
RETURNS TABLE (
  entity_id UUID,
  entity_name TEXT,
  entity_type TEXT,
  hop_distance INT,
  relationship_type TEXT,
  relationship_strength FLOAT,
  connected_via TEXT -- name of entity that connects at previous hop
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph_walk AS (
    -- Seed: the starting entity
    SELECT
      e.id AS entity_id,
      e.name AS entity_name,
      e.type AS entity_type,
      0 AS hop_distance,
      ''::TEXT AS relationship_type,
      1.0::FLOAT AS relationship_strength,
      ''::TEXT AS connected_via
    FROM exo_knowledge_entities e
    WHERE e.id = start_entity_id AND e.tenant_id = match_tenant_id

    UNION ALL

    -- Walk outbound relationships
    SELECT
      CASE WHEN r.source_entity_id = gw.entity_id THEN t.id ELSE s.id END,
      CASE WHEN r.source_entity_id = gw.entity_id THEN t.name ELSE s.name END,
      CASE WHEN r.source_entity_id = gw.entity_id THEN t.type ELSE s.type END,
      gw.hop_distance + 1,
      r.type,
      r.strength,
      gw.entity_name
    FROM graph_walk gw
    JOIN exo_knowledge_relationships r
      ON (r.source_entity_id = gw.entity_id OR r.target_entity_id = gw.entity_id)
      AND r.tenant_id = match_tenant_id
    JOIN exo_knowledge_entities s ON s.id = r.source_entity_id
    JOIN exo_knowledge_entities t ON t.id = r.target_entity_id
    WHERE gw.hop_distance < max_hops
      AND CASE WHEN r.source_entity_id = gw.entity_id THEN t.id ELSE s.id END != start_entity_id
  )
  SELECT DISTINCT ON (gw2.entity_id)
    gw2.entity_id,
    gw2.entity_name,
    gw2.entity_type,
    gw2.hop_distance,
    gw2.relationship_type,
    gw2.relationship_strength,
    gw2.connected_via
  FROM graph_walk gw2
  WHERE gw2.hop_distance > 0
  ORDER BY gw2.entity_id, gw2.hop_distance ASC
  LIMIT max_results;
END;
$$;
