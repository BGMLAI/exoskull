-- Sprint 5: CRON Reliability Framework
-- Circuit breaker state, dependency chain, dead letter queue

-- ============================================================================
-- 1. Circuit Breaker State (DB-backed for Vercel serverless)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_cron_circuit_breaker (
  cron_name TEXT PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half-open')),
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. ETL Dependency Registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_cron_dependencies (
  cron_name TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  max_age_hours INT NOT NULL DEFAULT 24,
  PRIMARY KEY (cron_name, depends_on)
);

-- Seed ETL chain: silver→bronze, gold→silver, business-metrics→gold
INSERT INTO admin_cron_dependencies (cron_name, depends_on, max_age_hours) VALUES
  ('silver-etl', 'bronze-etl', 6),
  ('gold-etl', 'silver-etl', 6),
  ('business-metrics', 'gold-etl', 24)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Dead Letter Queue for Async Tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_async_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_task_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL,
  prompt TEXT NOT NULL,
  final_error TEXT NOT NULL,
  retry_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('retried', 'discarded', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_dead_letters_unreviewed
  ON exo_async_dead_letters(created_at DESC) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dead_letters_tenant
  ON exo_async_dead_letters(tenant_id, created_at DESC);

-- ============================================================================
-- 4. RPCs for Circuit Breaker Operations
-- ============================================================================

-- Check if dependencies are satisfied for a given CRON
CREATE OR REPLACE FUNCTION check_cron_dependencies(p_cron_name TEXT)
RETURNS TABLE (
  dependency TEXT,
  satisfied BOOLEAN,
  last_success TIMESTAMPTZ,
  required_within_hours INT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    d.depends_on AS dependency,
    EXISTS (
      SELECT 1 FROM admin_cron_runs r
      WHERE r.cron_name = d.depends_on
        AND r.status = 'completed'
        AND r.completed_at > NOW() - (d.max_age_hours || ' hours')::INTERVAL
    ) AS satisfied,
    (SELECT MAX(r.completed_at) FROM admin_cron_runs r
     WHERE r.cron_name = d.depends_on AND r.status = 'completed'
    ) AS last_success,
    d.max_age_hours AS required_within_hours
  FROM admin_cron_dependencies d
  WHERE d.cron_name = p_cron_name;
$$;

-- Record a CRON failure — increments counter, opens circuit if threshold hit
CREATE OR REPLACE FUNCTION record_cron_failure(
  p_cron_name TEXT,
  p_error TEXT,
  p_failure_threshold INT DEFAULT 3,
  p_cooldown_minutes INT DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_failures INT;
BEGIN
  INSERT INTO admin_cron_circuit_breaker (cron_name, consecutive_failures, last_failure_at, last_error, state, updated_at)
  VALUES (p_cron_name, 1, NOW(), p_error, 'closed', NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    consecutive_failures = admin_cron_circuit_breaker.consecutive_failures + 1,
    last_failure_at = NOW(),
    last_error = p_error,
    updated_at = NOW();

  SELECT consecutive_failures INTO v_failures
  FROM admin_cron_circuit_breaker WHERE cron_name = p_cron_name;

  IF v_failures >= p_failure_threshold THEN
    UPDATE admin_cron_circuit_breaker
    SET state = 'open',
        cooldown_until = NOW() + (p_cooldown_minutes || ' minutes')::INTERVAL,
        updated_at = NOW()
    WHERE cron_name = p_cron_name;
    RETURN 'open';
  END IF;

  RETURN 'closed';
END;
$$;

-- Record a CRON success — resets circuit breaker
CREATE OR REPLACE FUNCTION record_cron_success(p_cron_name TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO admin_cron_circuit_breaker (cron_name, consecutive_failures, last_success_at, state, updated_at)
  VALUES (p_cron_name, 0, NOW(), 'closed', NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    consecutive_failures = 0,
    last_success_at = NOW(),
    state = 'closed',
    cooldown_until = NULL,
    updated_at = NOW();
END;
$$;
