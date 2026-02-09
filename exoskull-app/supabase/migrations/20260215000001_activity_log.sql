-- ============================================================================
-- Activity Log — IORS Observability
--
-- Records every action IORS takes so the user can see what's happening.
-- Powers the Activity Feed widget on the canvas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- What happened
  action_type TEXT NOT NULL,  -- chat_message, tool_call, loop_eval, cron_action, intervention, error
  action_name TEXT NOT NULL,  -- e.g. save_memory, analyze_health, petla_eval
  description TEXT NOT NULL,  -- Human-readable: "Zapisano wspomnienie o kawie"

  -- Context
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending', 'skipped')),
  source TEXT,                -- gateway, petla, loop-15, cron, manual
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recent activity per tenant (primary query pattern)
CREATE INDEX idx_activity_log_tenant
  ON exo_activity_log (tenant_id, created_at DESC);

-- Filter by type
CREATE INDEX idx_activity_log_type
  ON exo_activity_log (tenant_id, action_type, created_at DESC);

ALTER TABLE exo_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own activity
CREATE POLICY "Users read own activity"
  ON exo_activity_log FOR SELECT
  USING (auth.uid() = tenant_id);

-- Service role full access (for server-side logging)
CREATE POLICY "Service role full access activity_log"
  ON exo_activity_log FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE exo_activity_log IS 'IORS action log for observability. Powers the Activity Feed widget.';
