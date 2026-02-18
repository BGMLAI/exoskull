-- Self-Modification Engine — audit trail for source code modifications
-- Every source modification attempt is logged here for full traceability.

CREATE TABLE IF NOT EXISTS exo_source_modifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  target_files TEXT[] NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  triggered_by TEXT NOT NULL,
  goal_id UUID REFERENCES exo_user_goals(id),
  pr_url TEXT,
  pr_number INT,
  test_passed BOOLEAN,
  auto_merged BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'testing', 'pr_created', 'approved', 'merged', 'rejected', 'failed', 'blocked')),
  ai_confidence NUMERIC(3,2),
  diff_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  merged_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_source_mods_tenant ON exo_source_modifications(tenant_id);
CREATE INDEX idx_source_mods_status ON exo_source_modifications(status);
CREATE INDEX idx_source_mods_created ON exo_source_modifications(created_at DESC);

-- RLS
ALTER TABLE exo_source_modifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_mods_tenant_read" ON exo_source_modifications
  FOR SELECT USING (tenant_id = auth.uid());

-- Service role can do everything (cron/system)
CREATE POLICY "source_mods_service_all" ON exo_source_modifications
  FOR ALL USING (auth.role() = 'service_role');
