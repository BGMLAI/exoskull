-- ============================================================================
-- IMPULSE & AUTONOMY GRANTS (ExoSkull Patterns)
-- ============================================================================
-- Impulse: Batched periodic checks (health, tasks, calendar, social)
-- Autonomy Grants: Pre-approved autonomous action patterns
-- ============================================================================

-- ============================================================================
-- IMPULSE STATE
-- Tracks when checks were last performed to avoid redundant API calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_impulse_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_impulse_at TIMESTAMPTZ,

  -- Track individual check times
  checks_performed JSONB DEFAULT '{}'::JSONB,
  -- Example: {"health": "2026-02-02T10:00:00Z", "tasks": "2026-02-02T10:00:00Z", "calendar": "2026-02-02T09:30:00Z"}

  -- Pending alerts to deliver on next interaction
  pending_alerts JSONB DEFAULT '[]'::JSONB,
  -- Example: [{"type": "sleep_debt", "message": "Malo spisz ostatnio", "priority": "medium"}]

  -- Config
  impulse_interval_minutes INT DEFAULT 30,
  enabled_checks JSONB DEFAULT '["health", "tasks", "calendar"]'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_impulse_last_at ON user_impulse_state(last_impulse_at);

-- ============================================================================
-- AUTONOMY GRANTS
-- Pre-approved patterns for autonomous actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_autonomy_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Action pattern
  action_pattern TEXT NOT NULL,
  -- Examples: "send_sms:*", "send_email:family", "create_task", "complete_task:*"

  category TEXT,
  -- Examples: 'communication', 'tasks', 'health', 'finance', 'calendar'

  -- Grant metadata
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = never expires

  -- Usage tracking (circuit breaker)
  last_used_at TIMESTAMPTZ,
  use_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,

  -- Limits
  spending_limit DECIMAL, -- For financial actions
  daily_limit INT, -- Max uses per day

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, action_pattern)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_autonomy_user ON user_autonomy_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_pattern ON user_autonomy_grants(action_pattern);
CREATE INDEX IF NOT EXISTS idx_autonomy_active ON user_autonomy_grants(user_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE user_impulse_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_autonomy_grants ENABLE ROW LEVEL SECURITY;

-- Impulse: Users can only see/modify their own state
CREATE POLICY "Users can view own impulse state"
  ON user_impulse_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own impulse state"
  ON user_impulse_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own impulse state"
  ON user_impulse_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Autonomy Grants: Users can manage their own grants
CREATE POLICY "Users can view own autonomy grants"
  ON user_autonomy_grants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own autonomy grants"
  ON user_autonomy_grants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own autonomy grants"
  ON user_autonomy_grants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own autonomy grants"
  ON user_autonomy_grants FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- SERVICE ROLE POLICIES (for cron/backend)
-- ============================================================================
CREATE POLICY "Service role full access impulse"
  ON user_impulse_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access autonomy"
  ON user_autonomy_grants FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Check if action is granted for user
CREATE OR REPLACE FUNCTION check_autonomy_grant(
  p_user_id UUID,
  p_action_pattern TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_grant user_autonomy_grants%ROWTYPE;
BEGIN
  -- Check for exact match or wildcard
  SELECT * INTO v_grant
  FROM user_autonomy_grants
  WHERE user_id = p_user_id
    AND is_active = TRUE
    AND (
      action_pattern = p_action_pattern
      OR (action_pattern LIKE '%:*' AND p_action_pattern LIKE split_part(action_pattern, ':*', 1) || ':%')
      OR action_pattern = '*'
    )
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY
    CASE WHEN action_pattern = p_action_pattern THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_grant IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check daily limit
  IF v_grant.daily_limit IS NOT NULL THEN
    IF v_grant.use_count >= v_grant.daily_limit
       AND v_grant.last_used_at::DATE = CURRENT_DATE THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Update usage stats
  UPDATE user_autonomy_grants
  SET
    last_used_at = NOW(),
    use_count = CASE
      WHEN last_used_at::DATE < CURRENT_DATE THEN 1
      ELSE use_count + 1
    END,
    updated_at = NOW()
  WHERE id = v_grant.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record action error (circuit breaker)
CREATE OR REPLACE FUNCTION record_autonomy_error(
  p_user_id UUID,
  p_action_pattern TEXT,
  p_error_message TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE user_autonomy_grants
  SET
    error_count = error_count + 1,
    last_error_at = NOW(),
    last_error_message = p_error_message,
    -- Disable after 5 consecutive errors
    is_active = CASE WHEN error_count >= 4 THEN FALSE ELSE is_active END,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND action_pattern = p_action_pattern;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending impulse alerts for user
CREATE OR REPLACE FUNCTION get_pending_impulse_alerts(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_alerts JSONB;
BEGIN
  SELECT pending_alerts INTO v_alerts
  FROM user_impulse_state
  WHERE user_id = p_user_id;

  -- Clear alerts after fetching
  UPDATE user_impulse_state
  SET pending_alerts = '[]'::JSONB, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_alerts, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE user_impulse_state IS 'Tracks periodic check state per user (ExoSkull impulse system)';
COMMENT ON TABLE user_autonomy_grants IS 'Pre-approved action patterns for autonomous operations';
COMMENT ON FUNCTION check_autonomy_grant IS 'Check if action is granted, supports wildcards (e.g., send_sms:*)';
