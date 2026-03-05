-- F1: Graph DB — nodes + edges tables for knowledge graph
-- Replaces Tyrolka (user_loops, user_ops) long-term
-- Dual-write phase: both old tables AND new graph tables

-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- NODES
-- =====================================================
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('goal', 'task', 'note', 'memory', 'pattern', 'document', 'tag')),
  name TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  parent_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_tenant ON nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(tenant_id, status);

-- HNSW vector index for semantic search
CREATE INDEX IF NOT EXISTS idx_nodes_embedding ON nodes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =====================================================
-- EDGES
-- =====================================================
CREATE TABLE IF NOT EXISTS edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('has_subtask', 'tagged_with', 'related_to', 'blocks', 'depends_on', 'parent_of')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

-- Nodes: tenant can only see own nodes
CREATE POLICY IF NOT EXISTS nodes_tenant_policy ON nodes
  FOR ALL USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Service role bypass
CREATE POLICY IF NOT EXISTS nodes_service_policy ON nodes
  FOR ALL USING (auth.role() = 'service_role');

-- Edges: visible if source node is visible
CREATE POLICY IF NOT EXISTS edges_read_policy ON edges
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.tenant_id = auth.uid())
  );

CREATE POLICY IF NOT EXISTS edges_service_policy ON edges
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- HELPER: semantic search on graph nodes
-- =====================================================
CREATE OR REPLACE FUNCTION search_graph_nodes(
  p_tenant_id UUID,
  p_embedding vector(1536),
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_min_score FLOAT DEFAULT 0.3
)
RETURNS TABLE(
  id UUID,
  type TEXT,
  name TEXT,
  content TEXT,
  metadata JSONB,
  score FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    n.id,
    n.type,
    n.name,
    n.content,
    n.metadata,
    1 - (n.embedding <=> p_embedding) AS score
  FROM nodes n
  WHERE n.tenant_id = p_tenant_id
    AND n.embedding IS NOT NULL
    AND (p_type IS NULL OR n.type = p_type)
    AND 1 - (n.embedding <=> p_embedding) >= p_min_score
  ORDER BY n.embedding <=> p_embedding
  LIMIT p_limit;
$$;
