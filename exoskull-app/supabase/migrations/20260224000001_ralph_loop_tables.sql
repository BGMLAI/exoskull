-- ============================================================================
-- Ralph Loop Tables — Development Memory, Dynamic Tools, Tool Telemetry
-- ============================================================================

-- 3A: Development Memory — internal development journal
CREATE TABLE IF NOT EXISTS exo_dev_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'build',        -- built something new (app, skill, tool)
    'fix',          -- fixed a problem
    'learning',     -- success/failure pattern
    'plan',         -- planned next step
    'observation'   -- observed user pattern
  )),
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'pending', 'skipped')),
  related_entity TEXT,  -- e.g. 'app:mood_tracker', 'tool:dyn_log_calories'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dev_journal_tenant ON exo_dev_journal(tenant_id);
CREATE INDEX idx_dev_journal_type ON exo_dev_journal(tenant_id, entry_type);
CREATE INDEX idx_dev_journal_created ON exo_dev_journal(created_at DESC);

ALTER TABLE exo_dev_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dev journal" ON exo_dev_journal
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service can manage dev journal" ON exo_dev_journal
  FOR ALL USING (true) WITH CHECK (true);


-- 3B: Dynamic Tool Registry — hot-loadable tools per tenant
CREATE TABLE IF NOT EXISTS exo_dynamic_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}',
  handler_type TEXT NOT NULL CHECK (handler_type IN (
    'app_crud',     -- CRUD on exo_app_* table
    'skill_exec',   -- sandbox execution
    'query',        -- read-only Supabase query
    'composite'     -- chain of existing tools
  )),
  handler_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_dynamic_tools_tenant ON exo_dynamic_tools(tenant_id);
CREATE INDEX idx_dynamic_tools_enabled ON exo_dynamic_tools(tenant_id, enabled);

ALTER TABLE exo_dynamic_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dynamic tools" ON exo_dynamic_tools
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service can manage dynamic tools" ON exo_dynamic_tools
  FOR ALL USING (true) WITH CHECK (true);


-- 3C: Tool Execution Telemetry — performance tracking
CREATE TABLE IF NOT EXISTS exo_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  tool_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX idx_tool_exec_tenant ON exo_tool_executions(tenant_id);
CREATE INDEX idx_tool_exec_name ON exo_tool_executions(tool_name, created_at DESC);
CREATE INDEX idx_tool_exec_failures ON exo_tool_executions(tool_name, success) WHERE success = false;
CREATE INDEX idx_tool_exec_expires ON exo_tool_executions(expires_at);

ALTER TABLE exo_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage tool executions" ON exo_tool_executions
  FOR ALL USING (true) WITH CHECK (true);


-- Add agent_state column to async tasks for loop continuation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_async_tasks' AND column_name = 'agent_state'
  ) THEN
    ALTER TABLE exo_async_tasks ADD COLUMN agent_state JSONB;
  END IF;
END $$;


-- Auto-cleanup: delete expired tool executions (called by loop-daily)
CREATE OR REPLACE FUNCTION cleanup_tool_executions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM exo_tool_executions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
