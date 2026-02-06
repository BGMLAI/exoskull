-- ============================================================================
-- ASYNC TASK QUEUE
-- Background processing for complex user messages.
-- Gateway classifies messages → queues complex ones → CRON worker processes
-- → delivers results back on the originating channel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Channel context for reply delivery
  channel TEXT NOT NULL,
  channel_metadata JSONB NOT NULL DEFAULT '{}',
  reply_to TEXT NOT NULL,

  -- Task payload
  prompt TEXT NOT NULL,
  session_id TEXT,

  -- Processing state
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'processing', 'completed', 'failed'
  )),
  result TEXT,
  tools_used TEXT[] DEFAULT '{}',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error TEXT,

  -- Retry logic
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,

  -- Distributed locking
  locked_until TIMESTAMPTZ,
  locked_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index for CRON worker: pick up queued tasks, oldest first
CREATE INDEX idx_async_tasks_queue
  ON exo_async_tasks (status, created_at)
  WHERE status IN ('queued', 'failed');

-- Index for tenant lookups (status checks, dashboard)
CREATE INDEX idx_async_tasks_tenant
  ON exo_async_tasks (tenant_id, created_at DESC);

-- Index for stale lock detection
CREATE INDEX idx_async_tasks_stale_locks
  ON exo_async_tasks (locked_until)
  WHERE status = 'processing';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE exo_async_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own async tasks"
  ON exo_async_tasks FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access async tasks"
  ON exo_async_tasks FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- CLAIM FUNCTION — Atomic dequeue with FOR UPDATE SKIP LOCKED
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_async_task(
  p_worker_id TEXT,
  p_lock_seconds INTEGER DEFAULT 55
)
RETURNS SETOF exo_async_tasks
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task exo_async_tasks%ROWTYPE;
BEGIN
  -- Find oldest queued task (or failed task eligible for retry) that's not locked
  SELECT * INTO v_task
  FROM exo_async_tasks
  WHERE (
    status = 'queued'
    OR (status = 'failed' AND retry_count < max_retries)
  )
  AND (locked_until IS NULL OR locked_until <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_task.id IS NULL THEN
    RETURN;
  END IF;

  -- Claim it
  UPDATE exo_async_tasks
  SET status = 'processing',
      locked_until = now() + (p_lock_seconds || ' seconds')::interval,
      locked_by = p_worker_id,
      started_at = COALESCE(started_at, now())
  WHERE id = v_task.id;

  -- Return the claimed task (with updated fields)
  v_task.status := 'processing';
  v_task.locked_by := p_worker_id;
  v_task.locked_until := now() + (p_lock_seconds || ' seconds')::interval;

  RETURN NEXT v_task;
  RETURN;
END;
$$;

COMMENT ON TABLE exo_async_tasks IS
  'Queue for background processing of complex user messages. CRON worker picks up tasks and delivers results back to the originating channel.';

COMMENT ON FUNCTION claim_async_task IS
  'Atomically claim the next queued async task using FOR UPDATE SKIP LOCKED. Returns empty set if no tasks available.';
