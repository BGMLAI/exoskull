-- ============================================================================
-- AGENT FRAMEWORK (ExoSkull Self-Updating System)
-- ============================================================================
-- Dynamic agent spawning, execution logging, MIT detection, pattern learning
-- ============================================================================

-- ============================================================================
-- 1. AGENT EXECUTIONS LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Agent identity
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  tier INT NOT NULL CHECK (tier >= 1 AND tier <= 4),

  -- Decision that was made
  decision JSONB NOT NULL,

  -- Execution result
  result JSONB,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('idle', 'running', 'completed', 'failed')),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Resource usage
  tokens_used INT,
  model_used TEXT,

  -- Error tracking
  error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for agent executions
CREATE INDEX IF NOT EXISTS idx_agent_exec_tenant ON agent_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_agent_exec_agent ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_started ON agent_executions(started_at DESC);

-- ============================================================================
-- 2. USER MITs (Most Important Things)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_mits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Rank (1, 2, or 3)
  rank INT NOT NULL CHECK (rank >= 1 AND rank <= 3),

  -- The objective
  objective TEXT NOT NULL,
  reasoning TEXT,

  -- Scoring components (1-10 each)
  importance INT NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  urgency INT NOT NULL DEFAULT 5 CHECK (urgency >= 1 AND urgency <= 10),
  impact INT NOT NULL DEFAULT 5 CHECK (impact >= 1 AND impact <= 10),

  -- Computed score: (importance * 0.4) + (urgency * 0.3) + (impact * 0.3)
  score DECIMAL(4,2) GENERATED ALWAYS AS (
    (importance * 0.4) + (urgency * 0.3) + (impact * 0.3)
  ) STORED,

  -- Source tracking
  sources UUID[], -- conversation IDs that mentioned this objective
  last_mentioned TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one MIT per rank per tenant
  UNIQUE(tenant_id, rank)
);

-- Indexes for MITs
CREATE INDEX IF NOT EXISTS idx_mits_tenant ON user_mits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mits_score ON user_mits(tenant_id, score DESC);

-- ============================================================================
-- 3. DETECTED PATTERNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Pattern type
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'sleep', 'productivity', 'social', 'health', 'finance', 'custom'
  )),

  -- Description
  description TEXT NOT NULL,
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'monthly', 'irregular')),

  -- Confidence and data
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  data_points INT NOT NULL DEFAULT 0,

  -- Suggested automation
  suggested_automation TEXT,
  automation_enabled BOOLEAN DEFAULT FALSE,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'rejected')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ,

  -- Prevent duplicate patterns
  UNIQUE(tenant_id, pattern_type, description)
);

-- Indexes for patterns
CREATE INDEX IF NOT EXISTS idx_patterns_tenant ON user_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON user_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON user_patterns(tenant_id, confidence DESC);

-- ============================================================================
-- 4. LEARNING EVENTS LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Event type
  event_type TEXT NOT NULL CHECK (event_type IN (
    'highlight_added',
    'highlight_boosted',
    'highlight_decayed',
    'pattern_detected',
    'mit_updated',
    'agent_spawned',
    'agent_completed'
  )),

  -- Event data
  data JSONB NOT NULL DEFAULT '{}',

  -- Source
  agent_id TEXT,
  conversation_id UUID,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for learning events
CREATE INDEX IF NOT EXISTS idx_learning_tenant ON learning_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_type ON learning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_learning_created ON learning_events(created_at DESC);

-- ============================================================================
-- 5. CONVERSATION PROCESSING STATUS
-- ============================================================================

-- Add columns to track highlight extraction status
ALTER TABLE exo_conversations
ADD COLUMN IF NOT EXISTS highlight_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS highlights_extracted INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Index for finding unprocessed conversations
CREATE INDEX IF NOT EXISTS idx_conv_highlight_processed
ON exo_conversations(highlight_processed)
WHERE highlight_processed = FALSE;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;

-- Agent executions: users can view their own
CREATE POLICY "Users can view own agent executions"
  ON agent_executions FOR SELECT
  USING (tenant_id = auth.uid());

-- Service role: full access to agent executions
CREATE POLICY "Service role full access agent_executions"
  ON agent_executions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- MITs: users can view and manage their own
CREATE POLICY "Users can view own MITs"
  ON user_mits FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can manage own MITs"
  ON user_mits FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access MITs"
  ON user_mits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Patterns: users can view and manage their own
CREATE POLICY "Users can view own patterns"
  ON user_patterns FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can manage own patterns"
  ON user_patterns FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access patterns"
  ON user_patterns FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Learning events: users can view their own
CREATE POLICY "Users can view own learning events"
  ON learning_events FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access learning_events"
  ON learning_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get user's current MITs
CREATE OR REPLACE FUNCTION get_user_mits(p_tenant_id UUID)
RETURNS TABLE (
  rank INT,
  objective TEXT,
  score DECIMAL(4,2),
  importance INT,
  urgency INT,
  impact INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT rank, objective, score, importance, urgency, impact
  FROM user_mits
  WHERE tenant_id = p_tenant_id
  ORDER BY rank;
$$;

-- Get unprocessed conversations for highlight extraction
CREATE OR REPLACE FUNCTION get_unprocessed_conversations(
  p_limit INT DEFAULT 50,
  p_hours_back INT DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  context JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id, tenant_id, context, created_at
  FROM exo_conversations
  WHERE highlight_processed = FALSE
    AND created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
  ORDER BY created_at ASC
  LIMIT p_limit;
$$;

-- Mark conversation as processed
CREATE OR REPLACE FUNCTION mark_conversation_processed(
  p_conversation_id UUID,
  p_highlights_count INT DEFAULT 0
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE exo_conversations
  SET highlight_processed = TRUE,
      highlights_extracted = p_highlights_count,
      processed_at = NOW()
  WHERE id = p_conversation_id;
$$;

-- Log learning event
CREATE OR REPLACE FUNCTION log_learning_event(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_data JSONB DEFAULT '{}',
  p_agent_id TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO learning_events (tenant_id, event_type, data, agent_id, conversation_id)
  VALUES (p_tenant_id, p_event_type, p_data, p_agent_id, p_conversation_id)
  RETURNING id;
$$;

-- Get agent execution stats
CREATE OR REPLACE FUNCTION get_agent_stats(p_tenant_id UUID, p_days INT DEFAULT 7)
RETURNS TABLE (
  agent_id TEXT,
  total_runs INT,
  successful_runs INT,
  avg_duration_ms DECIMAL,
  total_tokens INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    agent_id,
    COUNT(*)::INT as total_runs,
    COUNT(*) FILTER (WHERE status = 'completed')::INT as successful_runs,
    AVG(duration_ms) as avg_duration_ms,
    SUM(tokens_used)::INT as total_tokens
  FROM agent_executions
  WHERE tenant_id = p_tenant_id
    AND started_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY agent_id;
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE agent_executions IS 'Log of all agent executions for debugging and analytics';
COMMENT ON TABLE user_mits IS 'User''s Most Important Things (top 3 objectives)';
COMMENT ON TABLE user_patterns IS 'Detected behavioral patterns for automation suggestions';
COMMENT ON TABLE learning_events IS 'Log of all learning/self-updating events';

COMMENT ON COLUMN user_mits.score IS 'Computed score: (importance * 0.4) + (urgency * 0.3) + (impact * 0.3)';
COMMENT ON COLUMN user_patterns.suggested_automation IS 'AI-suggested automation based on detected pattern';
