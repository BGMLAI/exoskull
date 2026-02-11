-- Knowledge Analysis Engine (KAE) — Storage
-- Tracks autonomous knowledge analysis runs and their insights.

CREATE TABLE IF NOT EXISTS exo_knowledge_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Run metadata
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('light', 'deep')),
  trigger TEXT NOT NULL CHECK (trigger IN ('loop_daily', 'loop_15', 'manual', 'event')),

  -- Input fingerprint (prevents duplicate runs on same data)
  snapshot_hash TEXT,
  data_window_days INT DEFAULT 30,

  -- Output
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights_count INT GENERATED ALWAYS AS (jsonb_array_length(insights)) STORED,

  -- Action tracking
  actions_proposed INT DEFAULT 0,
  actions_executed INT DEFAULT 0,
  actions_blocked INT DEFAULT 0,

  -- Cost tracking
  model_used TEXT,
  model_tier INT,
  cost_cents NUMERIC(10,4) DEFAULT 0,
  duration_ms INT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_ka_tenant_created
  ON exo_knowledge_analyses(tenant_id, created_at DESC);

CREATE INDEX idx_ka_type
  ON exo_knowledge_analyses(analysis_type);

-- Prevent exact-duplicate runs (same data, same tenant)
CREATE UNIQUE INDEX idx_ka_dedup
  ON exo_knowledge_analyses(tenant_id, snapshot_hash)
  WHERE snapshot_hash IS NOT NULL;

-- RLS
ALTER TABLE exo_knowledge_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can read own analyses"
  ON exo_knowledge_analyses FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access to analyses"
  ON exo_knowledge_analyses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
