-- ============================================================================
-- ALIGNMENT GUARDIAN SYSTEM
-- ============================================================================
-- Continuous verification that autonomous actions benefit the user.
-- Pre-action benefit scoring, post-action effectiveness measurement,
-- value drift detection, and conflict resolution.
-- Part of GAP 1: Beneficiary Alignment Guardian
-- ============================================================================

-- ============================================================================
-- 1. EXTEND INTERVENTIONS WITH GUARDIAN FIELDS
-- ============================================================================

ALTER TABLE exo_interventions ADD COLUMN IF NOT EXISTS benefit_score DECIMAL(4,2)
  CHECK (benefit_score >= 0 AND benefit_score <= 10);
ALTER TABLE exo_interventions ADD COLUMN IF NOT EXISTS benefit_reasoning TEXT;
ALTER TABLE exo_interventions ADD COLUMN IF NOT EXISTS guardian_verdict TEXT
  CHECK (guardian_verdict IN ('approved', 'blocked', 'modified', 'deferred'));
ALTER TABLE exo_interventions ADD COLUMN IF NOT EXISTS guardian_checked_at TIMESTAMPTZ;
ALTER TABLE exo_interventions ADD COLUMN IF NOT EXISTS value_alignment_score DECIMAL(4,2);

-- ============================================================================
-- 2. USER VALUES (what the user cares about)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_user_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  value_area TEXT NOT NULL,
  importance DECIMAL(3,2) NOT NULL CHECK (importance >= 0 AND importance <= 1),
  description TEXT,
  source TEXT DEFAULT 'discovery' CHECK (source IN (
    'discovery', 'explicit', 'inferred', 'reconfirmed'
  )),
  last_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  drift_detected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, value_area)
);

CREATE INDEX idx_user_values_tenant ON exo_user_values(tenant_id);

-- ============================================================================
-- 3. INTERVENTION EFFECTIVENESS
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_intervention_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES exo_interventions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL,

  -- Pre-action state snapshot
  pre_action_metrics JSONB DEFAULT '{}',

  -- Post-action state (measured later)
  post_action_metrics_24h JSONB,
  post_action_metrics_7d JSONB,

  -- Effectiveness scoring
  effectiveness_score DECIMAL(4,2),
  user_reported_benefit TEXT,
  measured_impact TEXT,

  -- Timestamps
  measured_at_24h TIMESTAMPTZ,
  measured_at_7d TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_effectiveness_tenant ON exo_intervention_effectiveness(tenant_id);
CREATE INDEX idx_effectiveness_type ON exo_intervention_effectiveness(intervention_type);
CREATE INDEX idx_effectiveness_pending_24h ON exo_intervention_effectiveness(created_at)
  WHERE measured_at_24h IS NULL;
CREATE INDEX idx_effectiveness_pending_7d ON exo_intervention_effectiveness(measured_at_24h)
  WHERE measured_at_7d IS NULL AND measured_at_24h IS NOT NULL;

-- ============================================================================
-- 4. VALUE CONFLICTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_value_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  value_a TEXT NOT NULL,
  value_b TEXT NOT NULL,
  conflict_description TEXT NOT NULL,
  suggested_resolution TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT CHECK (resolved_by IN ('user', 'system')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_value_conflicts_tenant ON exo_value_conflicts(tenant_id)
  WHERE resolved = FALSE;

-- ============================================================================
-- 5. GUARDIAN THROTTLE CONFIG (per tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_guardian_config (
  tenant_id UUID PRIMARY KEY REFERENCES exo_tenants(id) ON DELETE CASCADE,
  max_interventions_per_day INT DEFAULT 10,
  cooldown_minutes INT DEFAULT 30,
  min_benefit_score DECIMAL(4,2) DEFAULT 4.0,
  disabled_types TEXT[] DEFAULT '{}',
  auto_throttle_enabled BOOLEAN DEFAULT TRUE,
  last_throttle_adjustment TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE exo_user_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_intervention_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_value_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_guardian_config ENABLE ROW LEVEL SECURITY;

-- User values
CREATE POLICY "Users can view own values"
  ON exo_user_values FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can manage own values"
  ON exo_user_values FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access values"
  ON exo_user_values FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Effectiveness
CREATE POLICY "Users can view own effectiveness"
  ON exo_intervention_effectiveness FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access effectiveness"
  ON exo_intervention_effectiveness FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Value conflicts
CREATE POLICY "Users can view own conflicts"
  ON exo_value_conflicts FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can resolve own conflicts"
  ON exo_value_conflicts FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access conflicts"
  ON exo_value_conflicts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Guardian config
CREATE POLICY "Users can view own guardian config"
  ON exo_guardian_config FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can update own guardian config"
  ON exo_guardian_config FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access guardian config"
  ON exo_guardian_config FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get average effectiveness for intervention type
CREATE OR REPLACE FUNCTION get_intervention_effectiveness_avg(
  p_tenant_id UUID,
  p_intervention_type TEXT,
  p_days INT DEFAULT 30
)
RETURNS DECIMAL
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(AVG(effectiveness_score), 5.0)
  FROM exo_intervention_effectiveness
  WHERE tenant_id = p_tenant_id
    AND intervention_type = p_intervention_type
    AND created_at > NOW() - (p_days || ' days')::INTERVAL
    AND effectiveness_score IS NOT NULL;
$$;

-- Count interventions today for throttle check
CREATE OR REPLACE FUNCTION count_interventions_today(p_tenant_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INT
  FROM exo_interventions
  WHERE tenant_id = p_tenant_id
    AND created_at::DATE = CURRENT_DATE
    AND status NOT IN ('cancelled', 'expired', 'rejected');
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_user_values IS 'User value hierarchy - what the user cares about, with importance weights';
COMMENT ON TABLE exo_intervention_effectiveness IS 'Pre/post measurement of intervention impact (24h and 7d)';
COMMENT ON TABLE exo_value_conflicts IS 'Detected contradictions between user values requiring resolution';
COMMENT ON TABLE exo_guardian_config IS 'Per-tenant guardian throttle configuration';
COMMENT ON COLUMN exo_interventions.benefit_score IS 'Guardian-assigned benefit score (0-10) before execution';
COMMENT ON COLUMN exo_interventions.guardian_verdict IS 'Guardian decision: approved, blocked, modified, or deferred';
