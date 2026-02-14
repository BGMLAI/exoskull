-- ============================================================================
-- Process Conductor — "Never Idle" System
--
-- Provides:
-- 1. exo_process_registry — Tracks ALL running processes (CRONs + conductor work)
-- 2. exo_conductor_config — Tunable parameters (min_concurrent, budget, etc.)
-- 3. RPCs for atomic operations (register, complete, expire, count, claim)
-- ============================================================================

-- ============================================================================
-- TABLE: exo_process_registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_process_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Process identity
  process_type TEXT NOT NULL CHECK (process_type IN (
    'cron',            -- Vercel scheduled CRON
    'conductor_work',  -- Work spawned by the conductor
    'async_task',      -- User-triggered async task
    'event_handler'    -- Petla event handler
  )),
  process_name TEXT NOT NULL,
  worker_id TEXT NOT NULL,

  -- Tenant context (NULL for global/system processes)
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Work metadata
  work_catalog_id TEXT,
  params JSONB NOT NULL DEFAULT '{}',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'running', 'completed', 'failed', 'expired'
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Result
  result_summary JSONB,
  error_message TEXT,
  cost_cents SMALLINT NOT NULL DEFAULT 0,
  duration_ms INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active process count (the hot query — conductor runs this every minute)
CREATE INDEX idx_process_registry_active
  ON exo_process_registry (status, started_at DESC)
  WHERE status = 'running';

-- Per-tenant active processes
CREATE INDEX idx_process_registry_tenant_active
  ON exo_process_registry (tenant_id, status)
  WHERE status = 'running';

-- Stale heartbeat detection
CREATE INDEX idx_process_registry_heartbeat
  ON exo_process_registry (last_heartbeat_at, expires_at)
  WHERE status = 'running';

-- Cleanup index
CREATE INDEX idx_process_registry_cleanup
  ON exo_process_registry (completed_at)
  WHERE status IN ('completed', 'failed', 'expired');

-- Work catalog cooldown lookups
CREATE INDEX idx_process_registry_catalog
  ON exo_process_registry (work_catalog_id, completed_at DESC)
  WHERE work_catalog_id IS NOT NULL;

ALTER TABLE exo_process_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access process_registry"
  ON exo_process_registry FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- TABLE: exo_conductor_config
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_conductor_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exo_conductor_config (key, value) VALUES
  ('min_concurrent', '2'::jsonb),
  ('max_concurrent', '5'::jsonb),
  ('max_conductor_work_per_minute', '2'::jsonb),
  ('daily_system_budget_cents', '100'::jsonb),
  ('work_priorities', '{
    "user_facing": 100,
    "intelligence": 80,
    "system_maintenance": 50,
    "optimization": 30,
    "speculative": 10
  }'::jsonb),
  ('enabled', 'true'::jsonb)
ON CONFLICT DO NOTHING;

ALTER TABLE exo_conductor_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access conductor_config"
  ON exo_conductor_config FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- RPC: register_process
-- ============================================================================

CREATE OR REPLACE FUNCTION register_process(
  p_process_type TEXT,
  p_process_name TEXT,
  p_worker_id TEXT,
  p_tenant_id UUID DEFAULT NULL,
  p_work_catalog_id TEXT DEFAULT NULL,
  p_params JSONB DEFAULT '{}',
  p_ttl_seconds INTEGER DEFAULT 65
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO exo_process_registry (
    process_type, process_name, worker_id, tenant_id,
    work_catalog_id, params, status, expires_at
  ) VALUES (
    p_process_type, p_process_name, p_worker_id, p_tenant_id,
    p_work_catalog_id, p_params, 'running',
    now() + (p_ttl_seconds || ' seconds')::interval
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- RPC: complete_process
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_process(
  p_process_id UUID,
  p_status TEXT DEFAULT 'completed',
  p_result JSONB DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_cost_cents SMALLINT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_started TIMESTAMPTZ;
BEGIN
  SELECT started_at INTO v_started
  FROM exo_process_registry WHERE id = p_process_id;

  IF v_started IS NULL THEN RETURN; END IF;

  UPDATE exo_process_registry
  SET status = p_status,
      completed_at = now(),
      result_summary = COALESCE(p_result, result_summary),
      error_message = p_error,
      cost_cents = p_cost_cents,
      duration_ms = EXTRACT(EPOCH FROM (now() - v_started))::INT * 1000
  WHERE id = p_process_id;
END;
$$;

-- ============================================================================
-- RPC: expire_stale_processes
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_stale_processes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE exo_process_registry
  SET status = 'expired',
      completed_at = now(),
      error_message = 'Process expired (TTL or heartbeat timeout)'
  WHERE status = 'running'
    AND (
      expires_at < now()
      OR last_heartbeat_at < now() - interval '120 seconds'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- RPC: count_active_processes
-- ============================================================================

CREATE OR REPLACE FUNCTION count_active_processes()
RETURNS TABLE (
  total_active INTEGER,
  cron_active INTEGER,
  conductor_active INTEGER,
  async_active INTEGER,
  event_active INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::INTEGER AS total_active,
    COUNT(*) FILTER (WHERE process_type = 'cron')::INTEGER AS cron_active,
    COUNT(*) FILTER (WHERE process_type = 'conductor_work')::INTEGER AS conductor_active,
    COUNT(*) FILTER (WHERE process_type = 'async_task')::INTEGER AS async_active,
    COUNT(*) FILTER (WHERE process_type = 'event_handler')::INTEGER AS event_active
  FROM exo_process_registry
  WHERE status = 'running';
$$;

-- ============================================================================
-- RPC: claim_conductor_work — Atomic dedup + registration
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_conductor_work(
  p_worker_id TEXT,
  p_work_catalog_id TEXT,
  p_tenant_id UUID DEFAULT NULL,
  p_params JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Dedup: skip if this exact work is already running
  IF EXISTS (
    SELECT 1 FROM exo_process_registry
    WHERE work_catalog_id = p_work_catalog_id
      AND (tenant_id = p_tenant_id OR (tenant_id IS NULL AND p_tenant_id IS NULL))
      AND status = 'running'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO exo_process_registry (
    process_type, process_name, worker_id, tenant_id,
    work_catalog_id, params, status, expires_at
  ) VALUES (
    'conductor_work', p_work_catalog_id, p_worker_id, p_tenant_id,
    p_work_catalog_id, p_params, 'running',
    now() + interval '65 seconds'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- RPC: get_conductor_daily_spend
-- ============================================================================

CREATE OR REPLACE FUNCTION get_conductor_daily_spend()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(cost_cents), 0)::INTEGER
  FROM exo_process_registry
  WHERE process_type = 'conductor_work'
    AND status = 'completed'
    AND completed_at >= CURRENT_DATE;
$$;

-- ============================================================================
-- RPC: get_work_last_completed — For cooldown checks
-- ============================================================================

CREATE OR REPLACE FUNCTION get_work_last_completed(
  p_work_catalog_id TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT MAX(completed_at)
  FROM exo_process_registry
  WHERE work_catalog_id = p_work_catalog_id
    AND (tenant_id = p_tenant_id OR (tenant_id IS NULL AND p_tenant_id IS NULL))
    AND status = 'completed';
$$;
