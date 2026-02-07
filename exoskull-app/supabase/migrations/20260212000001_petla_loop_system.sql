-- ============================================================================
-- Pętla Loop System — 3 tables, 5 RPCs
--
-- The heartbeat of IORS: event bus + work queue + per-tenant adaptive timing.
-- Replaces 27 individual CRONs with 3 generic CRONs + task registry.
-- ============================================================================

-- ============================================================================
-- TABLE 1: exo_petla_events — Event Bus
-- External systems (gateway, rigs, crisis detector) emit events here.
-- The 1-minute CRON (petla) scans for unprocessed events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_petla_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'crisis',              -- P0: emergency detected
    'outbound_ready',      -- P1: autonomous action ready
    'proactive_trigger',   -- P2: reminder, suggestion, insight
    'data_ingested',       -- P3: new data from rig/conversation
    'optimization_signal', -- P4: performance metric changed
    'maintenance_due'      -- P5: ETL, cleanup, health check
  )),
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority >= 0 AND priority <= 5),

  -- Event payload
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',

  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'dispatched', 'ignored')),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,

  -- Dedup key: prevents duplicate events within a time window
  dedup_key TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- CRON worker picks pending events by priority
CREATE INDEX idx_petla_events_queue
  ON exo_petla_events (priority ASC, created_at ASC)
  WHERE status = 'pending';

-- Tenant lookup
CREATE INDEX idx_petla_events_tenant
  ON exo_petla_events (tenant_id, created_at DESC);

-- Dedup: prevent duplicate pending events with same key
CREATE UNIQUE INDEX idx_petla_events_dedup
  ON exo_petla_events (dedup_key)
  WHERE dedup_key IS NOT NULL AND status = 'pending';

-- Stale event cleanup
CREATE INDEX idx_petla_events_expires
  ON exo_petla_events (expires_at)
  WHERE expires_at IS NOT NULL AND status = 'pending';

ALTER TABLE exo_petla_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access petla_events"
  ON exo_petla_events FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- TABLE 2: exo_petla_queue — Work Queue
-- Sub-loop handlers consume items from this queue.
-- Uses the same FOR UPDATE SKIP LOCKED pattern as exo_async_tasks.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_petla_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Maps to 6 sub-loops
  sub_loop TEXT NOT NULL CHECK (sub_loop IN (
    'emergency',     -- P0
    'outbound',      -- P1
    'proactive',     -- P2
    'observation',   -- P3
    'optimization',  -- P4
    'maintenance'    -- P5
  )),
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority >= 0 AND priority <= 5),

  -- Task details
  handler TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  recurrence TEXT,           -- optional cron expression for recurring tasks
  last_run_at TIMESTAMPTZ,

  -- Processing state (mirrors async_tasks pattern)
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'processing', 'completed', 'failed', 'paused'
  )),
  result JSONB,
  error TEXT,
  retry_count SMALLINT NOT NULL DEFAULT 0,
  max_retries SMALLINT NOT NULL DEFAULT 2,

  -- Distributed locking
  locked_until TIMESTAMPTZ,
  locked_by TEXT,

  -- Source event
  source_event_id UUID REFERENCES exo_petla_events(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Pick queued tasks by sub_loop and priority
CREATE INDEX idx_petla_queue_work
  ON exo_petla_queue (sub_loop, priority ASC, scheduled_for ASC)
  WHERE status = 'queued';

CREATE INDEX idx_petla_queue_tenant
  ON exo_petla_queue (tenant_id, status);

-- Stale lock detection
CREATE INDEX idx_petla_queue_locks
  ON exo_petla_queue (locked_until)
  WHERE status = 'processing';

-- Recurring tasks lookup
CREATE INDEX idx_petla_queue_recurring
  ON exo_petla_queue (recurrence, last_run_at)
  WHERE recurrence IS NOT NULL;

ALTER TABLE exo_petla_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access petla_queue"
  ON exo_petla_queue FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- TABLE 3: exo_tenant_loop_config — Per-Tenant Adaptive Timing
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_tenant_loop_config (
  tenant_id UUID PRIMARY KEY REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Adaptive frequency
  activity_class TEXT NOT NULL DEFAULT 'normal' CHECK (activity_class IN (
    'active',     -- 5 min
    'normal',     -- 15 min
    'dormant',    -- 60 min (24h+ no activity)
    'sleeping'    -- 240 min (user timezone sleep hours)
  )),
  eval_interval_minutes SMALLINT NOT NULL DEFAULT 15,

  -- Timing
  last_eval_at TIMESTAMPTZ,
  next_eval_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,

  -- Budget / throttle
  daily_ai_budget_cents SMALLINT NOT NULL DEFAULT 50,
  daily_ai_spent_cents SMALLINT NOT NULL DEFAULT 0,
  budget_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),

  -- Counters
  cycles_today SMALLINT NOT NULL DEFAULT 0,
  interventions_today SMALLINT NOT NULL DEFAULT 0,

  -- Timezone (denormalized for join-free access)
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batch processing: find tenants due for evaluation
CREATE INDEX idx_tenant_loop_next_eval
  ON exo_tenant_loop_config (next_eval_at ASC)
  WHERE next_eval_at IS NOT NULL;

CREATE INDEX idx_tenant_loop_activity
  ON exo_tenant_loop_config (activity_class, last_activity_at);

ALTER TABLE exo_tenant_loop_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access tenant_loop_config"
  ON exo_tenant_loop_config FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- RPC 1: claim_petla_event — Atomic claim with SKIP LOCKED
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_petla_event(
  p_worker_id TEXT,
  p_max_priority SMALLINT DEFAULT 5,
  p_lock_seconds INTEGER DEFAULT 55
)
RETURNS SETOF exo_petla_events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event exo_petla_events%ROWTYPE;
BEGIN
  -- Expire stale events
  UPDATE exo_petla_events
  SET status = 'ignored'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Claim highest priority pending event
  SELECT * INTO v_event
  FROM exo_petla_events
  WHERE status = 'pending'
    AND priority <= p_max_priority
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE exo_petla_events
  SET status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = now()
  WHERE id = v_event.id;

  v_event.status := 'claimed';
  v_event.claimed_by := p_worker_id;
  RETURN NEXT v_event;
  RETURN;
END;
$$;

-- ============================================================================
-- RPC 2: claim_petla_work — Claim work item from queue
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_petla_work(
  p_worker_id TEXT,
  p_sub_loops TEXT[],
  p_lock_seconds INTEGER DEFAULT 55
)
RETURNS SETOF exo_petla_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task exo_petla_queue%ROWTYPE;
BEGIN
  -- Release expired locks first
  UPDATE exo_petla_queue
  SET status = 'queued',
      locked_until = NULL,
      locked_by = NULL
  WHERE status = 'processing'
    AND locked_until IS NOT NULL
    AND locked_until <= now();

  -- Claim next task
  SELECT * INTO v_task
  FROM exo_petla_queue
  WHERE status = 'queued'
    AND sub_loop = ANY(p_sub_loops)
    AND scheduled_for <= now()
  ORDER BY priority ASC, scheduled_for ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_task.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE exo_petla_queue
  SET status = 'processing',
      locked_until = now() + (p_lock_seconds || ' seconds')::interval,
      locked_by = p_worker_id
  WHERE id = v_task.id;

  v_task.status := 'processing';
  v_task.locked_by := p_worker_id;
  RETURN NEXT v_task;
  RETURN;
END;
$$;

-- ============================================================================
-- RPC 3: get_tenants_due_for_eval — Batch fetch
-- ============================================================================

CREATE OR REPLACE FUNCTION get_tenants_due_for_eval(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  tenant_id UUID,
  activity_class TEXT,
  eval_interval_minutes SMALLINT,
  last_eval_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  timezone TEXT,
  daily_ai_spent_cents SMALLINT,
  daily_ai_budget_cents SMALLINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    lc.tenant_id,
    lc.activity_class,
    lc.eval_interval_minutes,
    lc.last_eval_at,
    lc.last_activity_at,
    lc.timezone,
    lc.daily_ai_spent_cents,
    lc.daily_ai_budget_cents
  FROM exo_tenant_loop_config lc
  WHERE lc.next_eval_at <= now()
  ORDER BY lc.next_eval_at ASC
  LIMIT p_limit;
$$;

-- ============================================================================
-- RPC 4: update_tenant_loop_state — Update timing + budget
-- ============================================================================

CREATE OR REPLACE FUNCTION update_tenant_loop_state(
  p_tenant_id UUID,
  p_activity_class TEXT DEFAULT NULL,
  p_ai_cost_cents SMALLINT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_interval SMALLINT;
  v_class TEXT;
BEGIN
  v_class := COALESCE(p_activity_class, (
    SELECT activity_class FROM exo_tenant_loop_config WHERE tenant_id = p_tenant_id
  ));

  v_interval := CASE v_class
    WHEN 'active' THEN 5
    WHEN 'normal' THEN 15
    WHEN 'dormant' THEN 60
    WHEN 'sleeping' THEN 240
    ELSE 15
  END;

  UPDATE exo_tenant_loop_config
  SET activity_class = COALESCE(p_activity_class, activity_class),
      eval_interval_minutes = v_interval,
      last_eval_at = now(),
      next_eval_at = now() + (v_interval || ' minutes')::interval,
      cycles_today = cycles_today + 1,
      daily_ai_spent_cents = daily_ai_spent_cents + p_ai_cost_cents,
      updated_at = now()
  WHERE tenant_id = p_tenant_id;
END;
$$;

-- ============================================================================
-- RPC 5: emit_petla_event — Fire event into the bus
-- ============================================================================

CREATE OR REPLACE FUNCTION emit_petla_event(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_priority SMALLINT DEFAULT 3,
  p_source TEXT DEFAULT 'system',
  p_payload JSONB DEFAULT '{}',
  p_dedup_key TEXT DEFAULT NULL,
  p_expires_minutes INTEGER DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO exo_petla_events (
    tenant_id, event_type, priority, source, payload, dedup_key, expires_at
  ) VALUES (
    p_tenant_id, p_event_type, p_priority, p_source, p_payload,
    p_dedup_key,
    CASE WHEN p_expires_minutes > 0
      THEN now() + (p_expires_minutes || ' minutes')::interval
      ELSE NULL
    END
  )
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status = 'pending'
  DO NOTHING
  RETURNING id INTO v_event_id;

  -- Update tenant activity timestamp
  UPDATE exo_tenant_loop_config
  SET last_activity_at = now(),
      updated_at = now()
  WHERE tenant_id = p_tenant_id;

  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- SEED: Create loop config for existing tenants
-- ============================================================================

INSERT INTO exo_tenant_loop_config (tenant_id, timezone, next_eval_at)
SELECT
  t.id,
  COALESCE(t.timezone, 'Europe/Warsaw'),
  now() + (15 || ' minutes')::interval
FROM exo_tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM exo_tenant_loop_config lc WHERE lc.tenant_id = t.id
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_petla_events IS 'Event bus for Petla loop. External systems emit events; 1-min CRON dispatches them.';
COMMENT ON TABLE exo_petla_queue IS 'Work queue for 6 sub-loops. loop-15 and loop-daily CRONs process items.';
COMMENT ON TABLE exo_tenant_loop_config IS 'Per-tenant adaptive timing for the Petla heartbeat.';
