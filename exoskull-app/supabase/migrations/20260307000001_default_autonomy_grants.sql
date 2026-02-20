-- ============================================================================
-- DEFAULT AUTONOMY GRANTS FOR EXISTING TENANTS
-- ============================================================================
-- Seeds conservative default grants for all tenants that have no grants.
-- This unblocks the autonomous action pipeline that was previously dead code
-- because permission checks always returned false.
-- ============================================================================

-- Insert default grants for all existing tenants who have none
DO $$
DECLARE
  v_tenant RECORD;
  v_count INT;
BEGIN
  FOR v_tenant IN
    SELECT id FROM exo_tenants
    WHERE id NOT IN (
      SELECT DISTINCT user_id FROM user_autonomy_grants WHERE is_active = TRUE
    )
    AND id IN (SELECT id FROM auth.users)
  LOOP
    -- Communication: wellness check-ins
    INSERT INTO user_autonomy_grants (user_id, action_pattern, category, daily_limit, is_active)
    VALUES
      (v_tenant.id, 'send_sms:wellness', 'communication', 5, TRUE),
      (v_tenant.id, 'send_sms:goal', 'communication', 3, TRUE),
      (v_tenant.id, 'send_sms:reminder', 'communication', 5, TRUE),
      (v_tenant.id, 'send_email:summary', 'communication', 2, TRUE),
      (v_tenant.id, 'send_notification:*', 'communication', 20, TRUE),
      -- Tasks
      (v_tenant.id, 'create_task:*', 'tasks', 10, TRUE),
      (v_tenant.id, 'complete_task:*', 'tasks', 10, TRUE),
      -- Health
      (v_tenant.id, 'log_health:*', 'health', 20, TRUE),
      (v_tenant.id, 'trigger_checkin:*', 'health', 5, TRUE)
    ON CONFLICT (user_id, action_pattern) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE NOTICE 'Seeded % default grants for tenant %', v_count, v_tenant.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- OUTCOME TRACKING TABLE
-- Tracks effectiveness of interventions for the learning engine
-- ============================================================================
CREATE TABLE IF NOT EXISTS exo_intervention_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES exo_interventions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  outcome_type TEXT NOT NULL, -- 'user_response', 'behavior_change', 'goal_progress', 'ignored'
  effectiveness FLOAT, -- 0.0 - 1.0
  response_time_minutes INT,
  behavior_before JSONB,
  behavior_after JSONB,
  context JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_tenant ON exo_intervention_outcomes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_intervention ON exo_intervention_outcomes(intervention_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_type ON exo_intervention_outcomes(outcome_type);

-- RLS
ALTER TABLE exo_intervention_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access outcomes"
  ON exo_intervention_outcomes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- TENANT PREFERENCES TABLE
-- Stores learned preferences per tenant for MAPE-K optimization
-- ============================================================================
CREATE TABLE IF NOT EXISTS exo_tenant_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  preference_key TEXT NOT NULL,  -- e.g., 'preferred_channel', 'best_contact_hour', 'message_style'
  preference_value JSONB NOT NULL,
  confidence FLOAT DEFAULT 0.5,  -- How confident we are in this preference
  learned_from TEXT,  -- 'feedback', 'behavior', 'explicit'
  sample_count INT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_prefs_tenant ON exo_tenant_preferences(tenant_id);

ALTER TABLE exo_tenant_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access preferences"
  ON exo_tenant_preferences FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Add learned_from column to interventions if missing
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_interventions' AND column_name = 'learned_from'
  ) THEN
    ALTER TABLE exo_interventions ADD COLUMN learned_from BOOLEAN DEFAULT FALSE;
  END IF;
END;
$$;

COMMENT ON TABLE exo_intervention_outcomes IS 'Tracks intervention effectiveness for closed-loop learning';
COMMENT ON TABLE exo_tenant_preferences IS 'AI-learned user preferences (channel, timing, style)';
