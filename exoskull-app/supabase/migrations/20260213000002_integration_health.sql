-- Integration Health Monitoring System
-- Phase 1: Foundation & Quick Wins
-- Created: 2026-02-13

-- Table 1: Integration Health Status
-- Tracks current health state of each integration (Gmail, Outlook, Twilio, etc.)
CREATE TABLE IF NOT EXISTS exo_integration_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL, -- 'gmail', 'outlook', 'twilio', 'google_fit', 'drive', etc.
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  last_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  error_count_24h INTEGER NOT NULL DEFAULT 0,
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  circuit_opened_at TIMESTAMPTZ,
  last_error_message TEXT,
  last_error_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite unique constraint: one health record per tenant + integration
  UNIQUE(tenant_id, integration_type)
);

-- Table 2: Integration Events Log
-- Detailed forensics of all integration events (success, failures, auth refresh, etc.)
CREATE TABLE IF NOT EXISTS exo_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'health_check',
    'auth_refresh',
    'api_call',
    'auto_disable',
    'auto_enable',
    'circuit_open',
    'circuit_close',
    'circuit_half_open',
    'manual_test'
  )),
  success BOOLEAN NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  error_code TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_health_tenant
  ON exo_integration_health(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_integration_health_type
  ON exo_integration_health(integration_type, status);

CREATE INDEX IF NOT EXISTS idx_integration_events_tenant
  ON exo_integration_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_events_type
  ON exo_integration_events(integration_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_events_lookup
  ON exo_integration_events(tenant_id, integration_type, created_at DESC);

-- RLS Policies
ALTER TABLE exo_integration_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_integration_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own integration health
-- Note: exo_tenants.id IS the auth user ID (no separate auth_user_id column)
CREATE POLICY integration_health_select_own
  ON exo_integration_health
  FOR SELECT
  USING (tenant_id = auth.uid());

-- Policy: Users can read their own integration events
CREATE POLICY integration_events_select_own
  ON exo_integration_events
  FOR SELECT
  USING (tenant_id = auth.uid());

-- Policy: System can insert/update (service role only)
-- Note: These operations will be done via service role in CRON jobs

-- Function: Update integration health status
CREATE OR REPLACE FUNCTION update_integration_health(
  p_tenant_id UUID,
  p_integration_type TEXT,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_failures INTEGER;
  v_new_status TEXT;
  v_new_circuit_state TEXT;
BEGIN
  -- Get current failure count
  SELECT consecutive_failures INTO v_current_failures
  FROM exo_integration_health
  WHERE tenant_id = p_tenant_id AND integration_type = p_integration_type;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO exo_integration_health (
      tenant_id,
      integration_type,
      status,
      consecutive_failures,
      last_check_at,
      last_success_at
    ) VALUES (
      p_tenant_id,
      p_integration_type,
      CASE WHEN p_success THEN 'healthy' ELSE 'degraded' END,
      CASE WHEN p_success THEN 0 ELSE 1 END,
      NOW(),
      CASE WHEN p_success THEN NOW() ELSE NULL END
    );
    RETURN;
  END IF;

  -- Calculate new status and circuit state
  IF p_success THEN
    v_new_status := 'healthy';
    v_new_circuit_state := 'closed';
    v_current_failures := 0;
  ELSE
    v_current_failures := COALESCE(v_current_failures, 0) + 1;

    -- Status based on failure count
    IF v_current_failures >= 3 THEN
      v_new_status := 'down';
      v_new_circuit_state := 'open';
    ELSIF v_current_failures >= 1 THEN
      v_new_status := 'degraded';
      v_new_circuit_state := 'half_open';
    ELSE
      v_new_status := 'healthy';
      v_new_circuit_state := 'closed';
    END IF;
  END IF;

  -- Update health record
  UPDATE exo_integration_health
  SET
    status = v_new_status,
    consecutive_failures = v_current_failures,
    last_check_at = NOW(),
    last_success_at = CASE WHEN p_success THEN NOW() ELSE last_success_at END,
    circuit_state = v_new_circuit_state,
    circuit_opened_at = CASE
      WHEN v_new_circuit_state = 'open' AND circuit_state != 'open' THEN NOW()
      WHEN v_new_circuit_state = 'closed' THEN NULL
      ELSE circuit_opened_at
    END,
    last_error_message = CASE WHEN NOT p_success THEN p_error_message ELSE last_error_message END,
    last_error_code = CASE WHEN NOT p_success THEN p_error_code ELSE last_error_code END,
    error_count_24h = (
      SELECT COUNT(*)
      FROM exo_integration_events
      WHERE tenant_id = p_tenant_id
        AND integration_type = p_integration_type
        AND success = FALSE
        AND created_at > NOW() - INTERVAL '24 hours'
    ),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND integration_type = p_integration_type;

  -- Log event
  INSERT INTO exo_integration_events (
    tenant_id,
    integration_type,
    event_type,
    success,
    error_message,
    error_code
  ) VALUES (
    p_tenant_id,
    p_integration_type,
    'health_check',
    p_success,
    p_error_message,
    p_error_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get integration health summary
CREATE OR REPLACE FUNCTION get_integration_health_summary(p_tenant_id UUID)
RETURNS TABLE (
  integration_type TEXT,
  status TEXT,
  circuit_state TEXT,
  consecutive_failures INTEGER,
  error_count_24h INTEGER,
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ih.integration_type,
    ih.status,
    ih.circuit_state,
    ih.consecutive_failures,
    ih.error_count_24h,
    ih.last_check_at,
    ih.last_success_at,
    ih.last_error_message
  FROM exo_integration_health ih
  WHERE ih.tenant_id = p_tenant_id
  ORDER BY ih.integration_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get recent integration events
CREATE OR REPLACE FUNCTION get_recent_integration_events(
  p_tenant_id UUID,
  p_integration_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  integration_type TEXT,
  event_type TEXT,
  success BOOLEAN,
  duration_ms INTEGER,
  error_message TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ie.id,
    ie.integration_type,
    ie.event_type,
    ie.success,
    ie.duration_ms,
    ie.error_message,
    ie.error_code,
    ie.created_at
  FROM exo_integration_events ie
  WHERE ie.tenant_id = p_tenant_id
    AND (p_integration_type IS NULL OR ie.integration_type = p_integration_type)
  ORDER BY ie.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION update_integration_health TO service_role;
GRANT EXECUTE ON FUNCTION get_integration_health_summary TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_recent_integration_events TO service_role, authenticated;

-- Comments
COMMENT ON TABLE exo_integration_health IS 'Tracks health status and circuit breaker state for each integration';
COMMENT ON TABLE exo_integration_events IS 'Forensics log of all integration events (success, failures, auth refresh)';
COMMENT ON FUNCTION update_integration_health IS 'Updates integration health status and logs event. Auto-opens circuit breaker after 3 failures.';
COMMENT ON FUNCTION get_integration_health_summary IS 'Returns health summary for all integrations of a tenant';
COMMENT ON FUNCTION get_recent_integration_events IS 'Returns recent integration events for debugging';
