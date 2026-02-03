-- ============================================================================
-- AUTONOMY INTERVENTIONS (ExoSkull MAPE-K Loop)
-- ============================================================================
-- Tracks proposed and executed interventions from the autonomy system.
-- Part of the MAPE-K feedback loop: Monitor → Analyze → Plan → Execute → Knowledge
-- ============================================================================

-- ============================================================================
-- 1. INTERVENTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Intervention identity
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'proactive_message',    -- Send message to user
    'task_creation',        -- Auto-create task
    'task_reminder',        -- Remind about task
    'schedule_adjustment',  -- Modify calendar
    'health_alert',         -- Health-related notification
    'goal_nudge',           -- Nudge toward MIT/goal
    'pattern_notification', -- Notify about detected pattern
    'gap_detection',        -- Alert about blind spot
    'automation_trigger',   -- Trigger automated action
    'custom'                -- Custom intervention
  )),

  -- Intervention details
  title TEXT NOT NULL,
  description TEXT,
  action_payload JSONB NOT NULL DEFAULT '{}',
  -- Example: {"action": "send_sms", "params": {"message": "...", "to": "..."}}

  -- Source (what triggered this)
  source_agent TEXT,               -- Agent that proposed this
  source_pattern_id UUID REFERENCES user_patterns(id) ON DELETE SET NULL,
  source_conversation_id UUID,
  trigger_reason TEXT,             -- Why this intervention was proposed

  -- Priority and timing
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  urgency_score DECIMAL(4,2) DEFAULT 5.0 CHECK (urgency_score >= 0 AND urgency_score <= 10),
  scheduled_for TIMESTAMPTZ,       -- When to execute (NULL = immediate)
  expires_at TIMESTAMPTZ,          -- Don't execute after this time

  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed',      -- Waiting for approval
    'approved',      -- Approved, waiting to execute
    'executing',     -- Currently executing
    'completed',     -- Successfully executed
    'failed',        -- Execution failed
    'rejected',      -- User rejected
    'expired',       -- Expired before execution
    'cancelled'      -- Cancelled by system or user
  )),

  requires_approval BOOLEAN DEFAULT TRUE,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,  -- 'user', 'autonomy_grant', 'auto'
  rejection_reason TEXT,

  -- Execution tracking
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  execution_error TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,

  -- Feedback loop (Knowledge)
  user_feedback TEXT CHECK (user_feedback IN ('helpful', 'neutral', 'unhelpful', 'harmful')),
  feedback_notes TEXT,
  feedback_at TIMESTAMPTZ,

  -- Learning
  learned_from BOOLEAN DEFAULT FALSE,  -- Has this been used for pattern learning?

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_interventions_tenant ON exo_interventions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON exo_interventions(status);
CREATE INDEX IF NOT EXISTS idx_interventions_type ON exo_interventions(intervention_type);
CREATE INDEX IF NOT EXISTS idx_interventions_scheduled ON exo_interventions(scheduled_for)
  WHERE status IN ('proposed', 'approved');
CREATE INDEX IF NOT EXISTS idx_interventions_pending ON exo_interventions(tenant_id, status)
  WHERE status IN ('proposed', 'approved');
CREATE INDEX IF NOT EXISTS idx_interventions_feedback ON exo_interventions(user_feedback)
  WHERE user_feedback IS NOT NULL;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE exo_interventions ENABLE ROW LEVEL SECURITY;

-- Users can view their own interventions
CREATE POLICY "Users can view own interventions"
  ON exo_interventions FOR SELECT
  USING (tenant_id = auth.uid());

-- Users can update their own (for feedback, approval)
CREATE POLICY "Users can update own interventions"
  ON exo_interventions FOR UPDATE
  USING (tenant_id = auth.uid());

-- Service role: full access
CREATE POLICY "Service role full access interventions"
  ON exo_interventions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 4. INTERVENTION QUEUE (For scheduled execution)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_intervention_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES exo_interventions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Queue management
  priority INT NOT NULL DEFAULT 50,  -- Higher = more priority
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,          -- For distributed processing
  locked_by TEXT,                    -- Worker ID

  -- Attempt tracking
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON exo_intervention_queue(scheduled_at)
  WHERE locked_until IS NULL OR locked_until < NOW();
CREATE INDEX IF NOT EXISTS idx_queue_tenant ON exo_intervention_queue(tenant_id);

-- RLS for queue
ALTER TABLE exo_intervention_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access queue"
  ON exo_intervention_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 5. MAPE-K CYCLE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_mapek_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Cycle phases
  monitor_data JSONB,      -- What was observed
  analyze_result JSONB,    -- What was analyzed
  plan_result JSONB,       -- What was planned
  execute_result JSONB,    -- What was executed
  knowledge_result JSONB,  -- What was learned

  -- Interventions proposed in this cycle
  interventions_proposed INT DEFAULT 0,
  interventions_executed INT DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Trigger
  trigger_type TEXT CHECK (trigger_type IN ('cron', 'event', 'manual')),
  trigger_event TEXT,

  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mapek_tenant ON exo_mapek_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mapek_started ON exo_mapek_cycles(started_at DESC);

-- RLS
ALTER TABLE exo_mapek_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own MAPE-K cycles"
  ON exo_mapek_cycles FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access mapek"
  ON exo_mapek_cycles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Propose new intervention
CREATE OR REPLACE FUNCTION propose_intervention(
  p_tenant_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_action_payload JSONB,
  p_priority TEXT DEFAULT 'medium',
  p_source_agent TEXT DEFAULT NULL,
  p_requires_approval BOOLEAN DEFAULT TRUE,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intervention_id UUID;
  v_status TEXT;
BEGIN
  -- Determine initial status
  IF p_requires_approval THEN
    v_status := 'proposed';
  ELSE
    v_status := 'approved';
  END IF;

  -- Insert intervention
  INSERT INTO exo_interventions (
    tenant_id, intervention_type, title, description, action_payload,
    priority, source_agent, requires_approval, status, scheduled_for
  ) VALUES (
    p_tenant_id, p_type, p_title, p_description, p_action_payload,
    p_priority, p_source_agent, p_requires_approval, v_status, p_scheduled_for
  )
  RETURNING id INTO v_intervention_id;

  -- If auto-approved and scheduled, add to queue
  IF NOT p_requires_approval THEN
    INSERT INTO exo_intervention_queue (
      intervention_id, tenant_id, priority, scheduled_at
    ) VALUES (
      v_intervention_id,
      p_tenant_id,
      CASE p_priority
        WHEN 'critical' THEN 100
        WHEN 'high' THEN 75
        WHEN 'medium' THEN 50
        ELSE 25
      END,
      COALESCE(p_scheduled_for, NOW())
    );
  END IF;

  RETURN v_intervention_id;
END;
$$;

-- Approve intervention
CREATE OR REPLACE FUNCTION approve_intervention(
  p_intervention_id UUID,
  p_approved_by TEXT DEFAULT 'user'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intervention exo_interventions%ROWTYPE;
BEGIN
  SELECT * INTO v_intervention
  FROM exo_interventions
  WHERE id = p_intervention_id;

  IF v_intervention IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_intervention.status != 'proposed' THEN
    RETURN FALSE;
  END IF;

  -- Update status
  UPDATE exo_interventions
  SET status = 'approved',
      approved_at = NOW(),
      approved_by = p_approved_by,
      updated_at = NOW()
  WHERE id = p_intervention_id;

  -- Add to queue
  INSERT INTO exo_intervention_queue (
    intervention_id, tenant_id, priority, scheduled_at
  ) VALUES (
    p_intervention_id,
    v_intervention.tenant_id,
    CASE v_intervention.priority
      WHEN 'critical' THEN 100
      WHEN 'high' THEN 75
      WHEN 'medium' THEN 50
      ELSE 25
    END,
    COALESCE(v_intervention.scheduled_for, NOW())
  );

  RETURN TRUE;
END;
$$;

-- Get pending interventions for user
CREATE OR REPLACE FUNCTION get_pending_interventions(
  p_tenant_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  intervention_type TEXT,
  title TEXT,
  description TEXT,
  priority TEXT,
  scheduled_for TIMESTAMPTZ,
  source_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id, intervention_type, title, description, priority, scheduled_for, source_agent, created_at
  FROM exo_interventions
  WHERE tenant_id = p_tenant_id
    AND status = 'proposed'
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    created_at ASC
  LIMIT p_limit;
$$;

-- Record intervention feedback
CREATE OR REPLACE FUNCTION record_intervention_feedback(
  p_intervention_id UUID,
  p_feedback TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE exo_interventions
  SET user_feedback = p_feedback,
      feedback_notes = p_notes,
      feedback_at = NOW(),
      updated_at = NOW()
  WHERE id = p_intervention_id;
$$;

-- Get intervention stats for learning
CREATE OR REPLACE FUNCTION get_intervention_stats(
  p_tenant_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  intervention_type TEXT,
  total_proposed INT,
  total_approved INT,
  total_executed INT,
  total_helpful INT,
  total_unhelpful INT,
  approval_rate DECIMAL,
  success_rate DECIMAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    intervention_type,
    COUNT(*)::INT as total_proposed,
    COUNT(*) FILTER (WHERE status IN ('approved', 'completed', 'executing'))::INT as total_approved,
    COUNT(*) FILTER (WHERE status = 'completed')::INT as total_executed,
    COUNT(*) FILTER (WHERE user_feedback = 'helpful')::INT as total_helpful,
    COUNT(*) FILTER (WHERE user_feedback IN ('unhelpful', 'harmful'))::INT as total_unhelpful,
    ROUND(
      COUNT(*) FILTER (WHERE status NOT IN ('proposed', 'rejected'))::DECIMAL /
      NULLIF(COUNT(*), 0), 2
    ) as approval_rate,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL /
      NULLIF(COUNT(*) FILTER (WHERE status IN ('approved', 'completed', 'failed')), 0), 2
    ) as success_rate
  FROM exo_interventions
  WHERE tenant_id = p_tenant_id
    AND created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY intervention_type;
$$;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_interventions IS 'Proposed and executed interventions from MAPE-K autonomy loop';
COMMENT ON TABLE exo_intervention_queue IS 'Queue for scheduled intervention execution';
COMMENT ON TABLE exo_mapek_cycles IS 'Log of MAPE-K autonomy cycles for debugging and analytics';

COMMENT ON COLUMN exo_interventions.action_payload IS 'JSON with action type and parameters to execute';
COMMENT ON COLUMN exo_interventions.user_feedback IS 'User feedback for learning: helpful, neutral, unhelpful, harmful';
COMMENT ON COLUMN exo_interventions.learned_from IS 'Whether this intervention has been used to improve the system';
