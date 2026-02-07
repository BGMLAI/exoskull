-- =====================================================
-- PREDICTIVE HEALTH ENGINE
-- Stores predictions generated from health data trends
-- =====================================================

-- =====================================================
-- 1. ADD 'health_prediction' TO INTERVENTION TYPE CHECK
-- =====================================================

ALTER TABLE exo_interventions
  DROP CONSTRAINT IF EXISTS exo_interventions_intervention_type_check;

ALTER TABLE exo_interventions
  ADD CONSTRAINT exo_interventions_intervention_type_check
  CHECK (intervention_type IN (
    'proactive_message',
    'task_creation',
    'task_reminder',
    'schedule_adjustment',
    'health_alert',
    'goal_nudge',
    'pattern_notification',
    'gap_detection',
    'automation_trigger',
    'custom',
    'health_prediction'
  ));

-- =====================================================
-- 2. PREDICTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS exo_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Prediction identity
  metric TEXT NOT NULL,              -- illness_risk, productivity_impact, burnout_risk, fitness_trajectory
  probability FLOAT NOT NULL,        -- 0-1
  confidence FLOAT NOT NULL,         -- 0-1 (how reliable)
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Human-readable messages
  message_pl TEXT,
  message_en TEXT,

  -- Data quality
  data_points INT DEFAULT 0,

  -- Validity window
  expires_at TIMESTAMPTZ,

  -- Supporting data
  metadata JSONB DEFAULT '{}',

  -- Link to intervention (if one was created)
  intervention_id UUID REFERENCES exo_interventions(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_predictions_tenant ON exo_predictions(tenant_id);
CREATE INDEX idx_predictions_metric ON exo_predictions(metric);
CREATE INDEX idx_predictions_active ON exo_predictions(tenant_id, expires_at)
  WHERE delivered_at IS NULL;
CREATE INDEX idx_predictions_created ON exo_predictions(created_at DESC);

-- RLS
ALTER TABLE exo_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own predictions"
  ON exo_predictions FOR SELECT
  USING (tenant_id IN (SELECT id FROM exo_tenants WHERE id = auth.uid()));

CREATE POLICY "Service role full access to predictions"
  ON exo_predictions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE exo_predictions IS 'Health predictions generated from trend analysis of device metrics';
