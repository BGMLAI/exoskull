-- Claude Code sessions tracking + usage column
-- For /dashboard/claude-code feature

-- Sessions table (history + monitoring)
CREATE TABLE IF NOT EXISTS exo_code_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  workspace_dir TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
  message_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE exo_code_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON exo_code_sessions
  FOR ALL
  USING (tenant_id = auth.uid());

-- Index for tenant lookup
CREATE INDEX IF NOT EXISTS idx_code_sessions_tenant
  ON exo_code_sessions(tenant_id, started_at DESC);

-- Usage tracking column for daily rate limiting
ALTER TABLE exo_usage_daily
  ADD COLUMN IF NOT EXISTS coding_sessions_count INTEGER DEFAULT 0;
