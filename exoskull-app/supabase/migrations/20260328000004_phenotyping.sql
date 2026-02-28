-- ============================================================================
-- SCREEN TIME TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_screen_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'unknown',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, package_name, date)
);

CREATE INDEX IF NOT EXISTS idx_screen_time_tenant_date
  ON exo_screen_time_entries(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_screen_time_category
  ON exo_screen_time_entries(category);

ALTER TABLE exo_screen_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_screen_time" ON exo_screen_time_entries
  FOR ALL USING (tenant_id = auth.uid());

-- ============================================================================
-- PHENOTYPING SNAPSHOTS (periodic behavioral summaries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_phenotyping_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  screen_time JSONB NOT NULL DEFAULT '{}',
  activity JSONB NOT NULL DEFAULT '{}',
  sleep JSONB NOT NULL DEFAULT '{}',
  goal_insights JSONB NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_phenotyping_tenant_date
  ON exo_phenotyping_snapshots(tenant_id, snapshot_date DESC);

ALTER TABLE exo_phenotyping_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_phenotyping" ON exo_phenotyping_snapshots
  FOR ALL USING (tenant_id = auth.uid());
