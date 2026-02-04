-- ============================================================================
-- ADMIN PANEL INFRASTRUCTURE
-- ============================================================================
-- Admin access control, cron monitoring, error logging, API tracking,
-- and daily admin snapshots for the ExoSkull admin panel.
-- ============================================================================

-- ============================================================================
-- 1. ADMIN ACCESS CONTROL
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin_users"
  ON admin_users FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE admin_users IS 'Controls which tenants have admin panel access';

-- ============================================================================
-- 2. CRON EXECUTION LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  result_summary JSONB DEFAULT '{}',
  error_message TEXT,
  http_status INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_cron_name ON admin_cron_runs(cron_name, started_at DESC);
CREATE INDEX idx_admin_cron_status ON admin_cron_runs(status) WHERE status = 'failed';
CREATE INDEX idx_admin_cron_started ON admin_cron_runs(started_at DESC);

ALTER TABLE admin_cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin_cron_runs"
  ON admin_cron_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE admin_cron_runs IS 'Tracks execution of all Vercel cron jobs for admin monitoring';

-- ============================================================================
-- 3. SYSTEM ERROR LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_error_source ON admin_error_log(source, created_at DESC);
CREATE INDEX idx_admin_error_severity ON admin_error_log(severity) WHERE severity IN ('error', 'fatal');
CREATE INDEX idx_admin_error_unresolved ON admin_error_log(created_at DESC) WHERE resolved = FALSE;

ALTER TABLE admin_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin_error_log"
  ON admin_error_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE admin_error_log IS 'Structured error log for crons, agents, API routes';

-- ============================================================================
-- 4. API REQUEST LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  duration_ms INT NOT NULL,
  error_message TEXT,
  tenant_id UUID,
  request_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_api_logs_path ON admin_api_logs(path, created_at DESC);
CREATE INDEX idx_admin_api_logs_status ON admin_api_logs(status_code) WHERE status_code >= 400;
CREATE INDEX idx_admin_api_logs_created ON admin_api_logs(created_at DESC);

ALTER TABLE admin_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin_api_logs"
  ON admin_api_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE admin_api_logs IS 'API request logging for latency tracking and error rate monitoring';

-- ============================================================================
-- 5. DAILY ADMIN SNAPSHOT
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_daily_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  -- Users
  total_users INT DEFAULT 0,
  new_users_today INT DEFAULT 0,
  active_users_24h INT DEFAULT 0,
  active_users_7d INT DEFAULT 0,
  active_users_30d INT DEFAULT 0,

  -- Engagement
  total_conversations_today INT DEFAULT 0,
  total_messages_today INT DEFAULT 0,
  total_voice_minutes_today DECIMAL(8,2) DEFAULT 0,

  -- AI
  ai_total_cost_today DECIMAL(10,6) DEFAULT 0,
  ai_total_requests_today INT DEFAULT 0,
  ai_cache_hit_rate DECIMAL(5,4) DEFAULT 0,

  -- System
  cron_jobs_run INT DEFAULT 0,
  cron_jobs_failed INT DEFAULT 0,
  api_error_rate_5xx DECIMAL(5,4) DEFAULT 0,

  -- Autonomy
  interventions_proposed INT DEFAULT 0,
  interventions_executed INT DEFAULT 0,
  guardian_blocks INT DEFAULT 0,

  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_snapshot_date ON admin_daily_snapshot(date DESC);

ALTER TABLE admin_daily_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin_daily_snapshot"
  ON admin_daily_snapshot FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE admin_daily_snapshot IS 'Pre-calculated daily metrics for fast admin dashboard loads';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Get cron health summary for last N hours
CREATE OR REPLACE FUNCTION get_cron_health_summary(p_hours INT DEFAULT 24)
RETURNS TABLE (
  cron_name TEXT,
  total_runs BIGINT,
  successful_runs BIGINT,
  failed_runs BIGINT,
  avg_duration_ms NUMERIC,
  last_run_at TIMESTAMPTZ,
  last_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    cr.cron_name,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE cr.status = 'completed') as successful_runs,
    COUNT(*) FILTER (WHERE cr.status = 'failed') as failed_runs,
    ROUND(AVG(cr.duration_ms)) as avg_duration_ms,
    MAX(cr.started_at) as last_run_at,
    (SELECT status FROM admin_cron_runs cr2
     WHERE cr2.cron_name = cr.cron_name
     ORDER BY cr2.started_at DESC LIMIT 1) as last_status
  FROM admin_cron_runs cr
  WHERE cr.started_at > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY cr.cron_name
  ORDER BY cr.cron_name;
$$;

-- Get admin overview stats
CREATE OR REPLACE FUNCTION get_admin_overview()
RETURNS TABLE (
  total_users BIGINT,
  active_users_24h BIGINT,
  total_conversations_today BIGINT,
  errors_24h BIGINT,
  cron_failures_24h BIGINT,
  ai_cost_today DECIMAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM exo_tenants) as total_users,
    (SELECT COUNT(DISTINCT tenant_id) FROM exo_conversations
     WHERE created_at > NOW() - INTERVAL '24 hours') as active_users_24h,
    (SELECT COUNT(*) FROM exo_conversations
     WHERE created_at > NOW() - INTERVAL '24 hours') as total_conversations_today,
    (SELECT COUNT(*) FROM admin_error_log
     WHERE created_at > NOW() - INTERVAL '24 hours'
     AND severity IN ('error', 'fatal')) as errors_24h,
    (SELECT COUNT(*) FROM admin_cron_runs
     WHERE started_at > NOW() - INTERVAL '24 hours'
     AND status = 'failed') as cron_failures_24h,
    (SELECT COALESCE(SUM(estimated_cost), 0) FROM exo_ai_usage
     WHERE created_at > NOW() - INTERVAL '24 hours') as ai_cost_today;
$$;

-- Auto-cleanup old logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_admin_logs()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM admin_api_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM admin_cron_runs WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM admin_error_log WHERE created_at < NOW() - INTERVAL '90 days' AND resolved = TRUE;
END;
$$;
