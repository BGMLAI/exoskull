-- ============================================================================
-- Migration: Workflows table + Personalized thresholds support
-- Part of: Autonomy Enhancement (10 proposals)
-- ============================================================================

-- Autonomous workflows for multi-step goal execution
CREATE TABLE IF NOT EXISTS exo_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES exo_user_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  current_step_index INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'paused')),
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exo_workflows_tenant_status
  ON exo_workflows(tenant_id, status);

-- RLS
ALTER TABLE exo_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for workflows"
  ON exo_workflows
  FOR ALL
  USING (tenant_id = auth.uid() OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

-- Service role full access
CREATE POLICY "Service role full access to workflows"
  ON exo_workflows
  FOR ALL
  USING (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');
