-- ============================================================================
-- BRAIN SEED — ExoSkull Ecosystem Import
-- Migration: 20260218000002
-- Description: Schema additions for seeding the full Claude Code ecosystem
--              into ExoSkull: agents, skills, MCP servers, plugins, commands,
--              BGML frameworks, recursive agent hierarchy, ecosystem registry.
-- ============================================================================

-- ============================================================================
-- 1. EXTEND exo_agents — slug, hierarchy, generation tracking
-- ============================================================================

ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES exo_agents(id);
ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;
ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS max_sub_agents INTEGER DEFAULT 5;
ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS created_by_agent UUID REFERENCES exo_agents(id);
ALTER TABLE exo_agents ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

-- Unique slug index (partial — ignore nulls for legacy agents without slugs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_exo_agents_slug
  ON exo_agents(slug) WHERE slug IS NOT NULL;

-- Hierarchy indexes
CREATE INDEX IF NOT EXISTS idx_exo_agents_parent ON exo_agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_exo_agents_depth ON exo_agents(depth);
CREATE INDEX IF NOT EXISTS idx_exo_agents_type ON exo_agents(type);

COMMENT ON COLUMN exo_agents.slug IS 'URL-friendly unique identifier (e.g. wealth-pilot)';
COMMENT ON COLUMN exo_agents.parent_agent_id IS 'Parent agent in recursive hierarchy';
COMMENT ON COLUMN exo_agents.depth IS 'Hierarchy depth (0=root, max 10)';
COMMENT ON COLUMN exo_agents.max_sub_agents IS 'Max sub-agents this agent can create';
COMMENT ON COLUMN exo_agents.created_by_agent IS 'Agent that created this agent';
COMMENT ON COLUMN exo_agents.auto_generated IS 'True if created by another agent at runtime';

-- Update RLS: service role can manage all agents (for seed scripts + agent factory)
DROP POLICY IF EXISTS "Service role manages agents" ON exo_agents;
CREATE POLICY "Service role manages agents"
  ON exo_agents FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 2. SYSTEM TENANT — for global/system-owned resources
-- ============================================================================

INSERT INTO exo_tenants (id, email, name, onboarding_status)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@exoskull.xyz',
  'System',
  'completed'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. BGML FRAMEWORKS — reasoning framework registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS bgml_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,               -- business, engineering, general, science
  description TEXT,
  prompt_template TEXT NOT NULL,      -- System prompt fragment for this framework
  example_questions TEXT[],
  quality_score DECIMAL(3,2) DEFAULT 0.5,
  usage_count INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bgml_frameworks_domain ON bgml_frameworks(domain);
CREATE INDEX IF NOT EXISTS idx_bgml_frameworks_score ON bgml_frameworks(quality_score DESC);

ALTER TABLE bgml_frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Frameworks visible to all authenticated"
  ON bgml_frameworks FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Service role manages frameworks"
  ON bgml_frameworks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE bgml_frameworks IS 'BGML reasoning frameworks for prompt enhancement';

-- ============================================================================
-- 4. MCP SERVERS — dynamic MCP registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'stdio',    -- stdio | sse | http
  command TEXT,                           -- e.g. "npx" or "node"
  args TEXT[],                            -- e.g. ["-y", "@modelcontextprotocol/server-memory"]
  env_vars JSONB DEFAULT '{}',           -- required env var names (not values!)
  url TEXT,                               -- for sse/http types
  description TEXT,
  capabilities TEXT[],                    -- e.g. ["search", "read", "write"]
  category TEXT,                          -- utility | dev | comms | data | finance | ai
  requires_auth BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_category ON exo_mcp_servers(category);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON exo_mcp_servers(is_enabled);

ALTER TABLE exo_mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MCP servers visible to all authenticated"
  ON exo_mcp_servers FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Service role manages MCP servers"
  ON exo_mcp_servers FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE exo_mcp_servers IS 'Registry of MCP servers available in ExoSkull ecosystem';

-- ============================================================================
-- 5. PLUGINS — plugin registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,                -- lsp | dev-workflow | output-style | integration | meta
  description TEXT,
  capabilities TEXT[],
  source TEXT DEFAULT 'claude-plugins-official',
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugins_category ON exo_plugins(category);

ALTER TABLE exo_plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plugins visible to all authenticated"
  ON exo_plugins FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Service role manages plugins"
  ON exo_plugins FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE exo_plugins IS 'Installed Claude Code plugins available to IORS';

-- ============================================================================
-- 6. COMMANDS — command template registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  category TEXT,                          -- dev | testing | ops | workflow | ai
  is_global BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commands_category ON exo_commands(category);

ALTER TABLE exo_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commands visible to all authenticated"
  ON exo_commands FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Service role manages commands"
  ON exo_commands FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE exo_commands IS 'Reusable prompt templates (slash commands)';

-- ============================================================================
-- 7. ECOSYSTEM REGISTRY — unified cross-resource index
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_ecosystem_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,            -- agent | skill | mcp | plugin | command | framework
  resource_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  capabilities TEXT[],
  is_enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(resource_type, slug)
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_type ON exo_ecosystem_registry(resource_type);
CREATE INDEX IF NOT EXISTS idx_ecosystem_slug ON exo_ecosystem_registry(slug);
CREATE INDEX IF NOT EXISTS idx_ecosystem_enabled ON exo_ecosystem_registry(is_enabled);

ALTER TABLE exo_ecosystem_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ecosystem visible to all authenticated"
  ON exo_ecosystem_registry FOR SELECT
  USING (auth.role() IS NOT NULL);

CREATE POLICY "Service role manages ecosystem"
  ON exo_ecosystem_registry FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE exo_ecosystem_registry IS 'Unified search index across agents, skills, MCP, plugins, commands';

-- ============================================================================
-- 8. UPDATE SKILLS RLS — allow system tenant skills to be visible
-- ============================================================================

-- Add policy so users can also see system-level skills
DROP POLICY IF EXISTS "Users see system skills" ON exo_generated_skills;
CREATE POLICY "Users see system skills"
  ON exo_generated_skills FOR SELECT
  USING (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ============================================================================
-- END
-- ============================================================================
