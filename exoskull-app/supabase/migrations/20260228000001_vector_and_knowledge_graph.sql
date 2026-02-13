-- ============================================================================
-- Vector Embeddings + Knowledge Graph + Integration Tokens + System Goals
-- Required extensions: pgvector
-- ============================================================================

-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- VECTOR EMBEDDINGS (for semantic search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_vector_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
  source_type TEXT NOT NULL DEFAULT 'document', -- document, conversation, note, email, voice, web
  source_id TEXT,
  chunk_index INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_tenant ON exo_vector_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_source ON exo_vector_embeddings(tenant_id, source_type);

-- Create HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_hnsw ON exo_vector_embeddings 
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE exo_vector_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_vector_access" ON exo_vector_embeddings
  FOR ALL USING (tenant_id = auth.uid());

-- Vector search function
CREATE OR REPLACE FUNCTION vector_search(
  query_embedding TEXT,
  match_tenant_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  source_id TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    e.source_type,
    e.source_id,
    e.metadata,
    1 - (e.embedding <=> query_embedding::vector) AS similarity
  FROM exo_vector_embeddings e
  WHERE e.tenant_id = match_tenant_id
    AND (source_types IS NULL OR e.source_type = ANY(source_types))
    AND 1 - (e.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY e.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- KNOWLEDGE GRAPH (entities + relationships)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_knowledge_entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'concept', -- person, organization, topic, event, location, project, concept
  aliases TEXT[] DEFAULT '{}',
  properties JSONB DEFAULT '{}',
  mention_count INTEGER DEFAULT 1,
  last_mentioned TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_tenant ON exo_knowledge_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON exo_knowledge_entities(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON exo_knowledge_entities(tenant_id, type);

ALTER TABLE exo_knowledge_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_entity_access" ON exo_knowledge_entities
  FOR ALL USING (tenant_id = auth.uid());

CREATE TABLE IF NOT EXISTS exo_knowledge_relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES exo_knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES exo_knowledge_entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'related_to',
  strength FLOAT DEFAULT 0.5,
  context TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, source_entity_id, target_entity_id, type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_rels_tenant ON exo_knowledge_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_rels_source ON exo_knowledge_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_rels_target ON exo_knowledge_relationships(target_entity_id);

ALTER TABLE exo_knowledge_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_relationship_access" ON exo_knowledge_relationships
  FOR ALL USING (tenant_id = auth.uid());

-- ============================================================================
-- INTEGRATION TOKENS (for Google Fit, Drive, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_integration_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- google_fit, google_drive, etc.
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date BIGINT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

ALTER TABLE exo_integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_token_access" ON exo_integration_tokens
  FOR ALL USING (tenant_id = auth.uid());

-- ============================================================================
-- SYSTEM GOALS (GOTCHA framework goals stored in DB)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_system_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID, -- NULL = system-wide goal
  name TEXT NOT NULL,
  objective TEXT,
  inputs TEXT[] DEFAULT '{}',
  tools TEXT[] DEFAULT '{}',
  expected_outputs TEXT[] DEFAULT '{}',
  edge_cases TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- WIDGET INTERACTIONS (for self-builder analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_widget_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  interaction_type TEXT DEFAULT 'view', -- view, click, expand, collapse
  count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_widget_interactions_tenant ON exo_widget_interactions(tenant_id, widget_type);

-- ============================================================================
-- SYSTEM EVENTS (for inter-system bus persistence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_system_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, warn, error, critical
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_events_tenant ON exo_system_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON exo_system_events(type, created_at);

-- ============================================================================
-- EXTENDED VALUE HIERARCHY: Campaigns (Side Quests) + Challenges + Notes linkage
-- ============================================================================

-- Campaigns (side quests under quests)
CREATE TABLE IF NOT EXISTS exo_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- active, paused, completed, archived
  priority INTEGER DEFAULT 5,
  start_date DATE,
  end_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON exo_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_quest ON exo_campaigns(quest_id);

-- Challenges (tasks under missions or campaigns)
CREATE TABLE IF NOT EXISTS exo_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES user_missions(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES exo_campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, blocked
  priority INTEGER DEFAULT 5,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_tenant ON exo_challenges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_challenges_mission ON exo_challenges(mission_id);
CREATE INDEX IF NOT EXISTS idx_challenges_campaign ON exo_challenges(campaign_id);

-- Link notes to hierarchy
ALTER TABLE exo_notes ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES exo_challenges(id) ON DELETE SET NULL;
ALTER TABLE exo_notes ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES user_missions(id) ON DELETE SET NULL;
ALTER TABLE exo_notes ADD COLUMN IF NOT EXISTS quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL;
ALTER TABLE exo_notes ADD COLUMN IF NOT EXISTS value_id UUID REFERENCES exo_values(id) ON DELETE SET NULL;

-- Voice config column for 11labs voice ID
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT '{}';
