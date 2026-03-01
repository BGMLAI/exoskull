-- ExoSkull v3 Foundation Migration
-- Creates new v3 tables for autonomous organism architecture.
-- Preserves ALL existing data — no drops, only additions.

-- ============================================================================
-- 1. AUTONOMY QUEUE — single queue for heartbeat processing
-- ============================================================================
CREATE TABLE IF NOT EXISTS exo_autonomy_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'gap' | 'overdue' | 'user_request' | 'heartbeat' | 'self_mod' | 'build_app'
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  priority INT NOT NULL DEFAULT 5, -- 1=lowest, 10=highest
  source TEXT NOT NULL DEFAULT 'user', -- 'heartbeat' | 'user' | 'gap_detection' | 'self_mod' | 'goal_engine'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error_log TEXT[]
);

CREATE INDEX idx_autonomy_queue_tenant_status ON exo_autonomy_queue(tenant_id, status);
CREATE INDEX idx_autonomy_queue_priority ON exo_autonomy_queue(tenant_id, status, priority DESC, created_at ASC);

-- RLS
ALTER TABLE exo_autonomy_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own queue" ON exo_autonomy_queue
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access queue" ON exo_autonomy_queue
  FOR ALL USING (true) WITH CHECK (true);

-- Claim function — atomic claim with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_autonomy_item(p_tenant_id UUID)
RETURNS SETOF exo_autonomy_queue
LANGUAGE sql
AS $$
  UPDATE exo_autonomy_queue
  SET status = 'claimed', claimed_at = NOW()
  WHERE id = (
    SELECT id FROM exo_autonomy_queue
    WHERE tenant_id = p_tenant_id AND status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- ============================================================================
-- 2. AUTONOMY LOG — append-only event log (event-sourced state)
-- ============================================================================
CREATE TABLE IF NOT EXISTS exo_autonomy_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'tool_call' | 'tool_result' | 'reflection_sweet' | 'reflection_sour' | 'learn' | 'error' | 'gap_detected' | 'task_enqueued' | 'task_completed' | 'user_notified' | 'approval_requested' | 'approval_granted' | 'heartbeat_ok'
  queue_item_id UUID REFERENCES exo_autonomy_queue(id),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_autonomy_log_tenant_time ON exo_autonomy_log(tenant_id, created_at);
CREATE INDEX idx_autonomy_log_queue_item ON exo_autonomy_log(queue_item_id);
CREATE INDEX idx_autonomy_log_event_type ON exo_autonomy_log(event_type, created_at);

-- RLS
ALTER TABLE exo_autonomy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own log" ON exo_autonomy_log
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access log" ON exo_autonomy_log
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. ORGANISM KNOWLEDGE — what the organism has learned
-- ============================================================================
CREATE TABLE IF NOT EXISTS exo_organism_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'pattern' | 'preference' | 'anti_pattern' | 'fact'
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5, -- 0.0 to 1.0
  source TEXT, -- 'consolidation' | 'conversation' | 'reflexion' | 'user_explicit'
  last_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organism_knowledge_tenant ON exo_organism_knowledge(tenant_id, category);
CREATE INDEX idx_organism_knowledge_confidence ON exo_organism_knowledge(tenant_id, confidence DESC);

-- RLS
ALTER TABLE exo_organism_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own knowledge" ON exo_organism_knowledge
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access knowledge" ON exo_organism_knowledge
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. USER SETTINGS — add v3 permission columns (safe ALTER, no data loss)
-- ============================================================================
DO $$
BEGIN
  -- Add permission_level if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_tenants' AND column_name = 'permission_level'
  ) THEN
    ALTER TABLE exo_tenants ADD COLUMN permission_level TEXT NOT NULL DEFAULT 'ask_first';
    -- Valid: 'autonomous' | 'ask_first' | 'manual'
  END IF;

  -- Add quiet hours if not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_tenants' AND column_name = 'quiet_hours_start'
  ) THEN
    ALTER TABLE exo_tenants ADD COLUMN quiet_hours_start INT DEFAULT 23; -- hour 0-23
    ALTER TABLE exo_tenants ADD COLUMN quiet_hours_end INT DEFAULT 7;
  END IF;

  -- Add preferred channel
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_tenants' AND column_name = 'preferred_channel'
  ) THEN
    ALTER TABLE exo_tenants ADD COLUMN preferred_channel TEXT DEFAULT 'web';
    -- Valid: 'web' | 'sms' | 'voice' | 'telegram' | 'email'
  END IF;
END$$;
