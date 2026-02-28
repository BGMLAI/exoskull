-- Goal Content Links — maps ingested content to user goals
-- Used by the goal-based auto-categorizer (lib/memory/goal-categorizer.ts)

CREATE TABLE IF NOT EXISTS exo_goal_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  relevance TEXT NOT NULL DEFAULT 'medium' CHECK (relevance IN ('high', 'medium', 'low')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, goal_id, source_type, source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_goal_content_links_tenant ON exo_goal_content_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goal_content_links_goal ON exo_goal_content_links(goal_id);

-- RLS
ALTER TABLE exo_goal_content_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_goal_content_links"
  ON exo_goal_content_links
  FOR ALL
  USING (tenant_id = auth.uid());
