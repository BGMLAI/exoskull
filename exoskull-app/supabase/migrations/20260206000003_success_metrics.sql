-- =====================================================
-- Layer 9: Self-Defining Success Metrics
-- User-defined goals with automatic progress tracking
-- =====================================================

-- Goal definitions
CREATE TABLE IF NOT EXISTS exo_user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('health', 'productivity', 'finance', 'mental', 'social', 'learning', 'creativity')),
  description TEXT,
  target_type TEXT NOT NULL DEFAULT 'numeric' CHECK (target_type IN ('numeric', 'boolean', 'frequency')),
  target_value NUMERIC,
  target_unit TEXT,
  baseline_value NUMERIC,
  current_value NUMERIC,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  direction TEXT NOT NULL DEFAULT 'increase' CHECK (direction IN ('increase', 'decrease')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  measurable_proxies JSONB NOT NULL DEFAULT '[]',
  wellbeing_weight NUMERIC NOT NULL DEFAULT 1.0 CHECK (wellbeing_weight >= 0.1 AND wellbeing_weight <= 5.0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily progress snapshots (immutable log)
CREATE TABLE IF NOT EXISTS exo_goal_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES exo_user_goals(id) ON DELETE CASCADE,
  checkpoint_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  data_source TEXT NOT NULL,
  progress_percent NUMERIC,
  momentum TEXT NOT NULL DEFAULT 'stable' CHECK (momentum IN ('up', 'down', 'stable')),
  trajectory TEXT NOT NULL DEFAULT 'on_track' CHECK (trajectory IN ('on_track', 'at_risk', 'off_track', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, checkpoint_date)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_user_goals_tenant_active ON exo_user_goals(tenant_id, is_active);
CREATE INDEX idx_user_goals_category ON exo_user_goals(tenant_id, category);
CREATE INDEX idx_goal_checkpoints_goal_date ON exo_goal_checkpoints(goal_id, checkpoint_date DESC);
CREATE INDEX idx_goal_checkpoints_tenant_date ON exo_goal_checkpoints(tenant_id, checkpoint_date DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_user_goal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_goal_updated
  BEFORE UPDATE ON exo_user_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_user_goal_timestamp();

-- Auto-update current_value when checkpoint is inserted
CREATE OR REPLACE FUNCTION update_goal_current_value()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE exo_user_goals
  SET current_value = NEW.value,
      updated_at = now()
  WHERE id = NEW.goal_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_checkpoint_updates_goal
  AFTER INSERT ON exo_goal_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_goal_current_value();

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE exo_user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_goal_checkpoints ENABLE ROW LEVEL SECURITY;

-- User goals
CREATE POLICY "Users can view own goals"
  ON exo_user_goals FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can insert own goals"
  ON exo_user_goals FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own goals"
  ON exo_user_goals FOR UPDATE
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access goals"
  ON exo_user_goals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Goal checkpoints
CREATE POLICY "Users can view own checkpoints"
  ON exo_goal_checkpoints FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can insert own checkpoints"
  ON exo_goal_checkpoints FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access checkpoints"
  ON exo_goal_checkpoints FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get active goals with latest checkpoint
CREATE OR REPLACE FUNCTION get_active_goals_with_status(p_tenant_id UUID)
RETURNS TABLE (
  goal_id UUID,
  goal_name TEXT,
  category TEXT,
  target_value NUMERIC,
  target_unit TEXT,
  current_value NUMERIC,
  direction TEXT,
  frequency TEXT,
  target_date DATE,
  start_date DATE,
  progress_percent NUMERIC,
  momentum TEXT,
  trajectory TEXT,
  last_checkpoint_date DATE,
  days_remaining INTEGER,
  wellbeing_weight NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    g.id AS goal_id,
    g.name AS goal_name,
    g.category,
    g.target_value,
    g.target_unit,
    g.current_value,
    g.direction,
    g.frequency,
    g.target_date,
    g.start_date,
    COALESCE(c.progress_percent, 0) AS progress_percent,
    COALESCE(c.momentum, 'stable') AS momentum,
    COALESCE(c.trajectory, 'on_track') AS trajectory,
    c.checkpoint_date AS last_checkpoint_date,
    CASE
      WHEN g.target_date IS NOT NULL THEN (g.target_date - CURRENT_DATE)
      ELSE NULL
    END AS days_remaining,
    g.wellbeing_weight
  FROM exo_user_goals g
  LEFT JOIN LATERAL (
    SELECT cp.progress_percent, cp.momentum, cp.trajectory, cp.checkpoint_date
    FROM exo_goal_checkpoints cp
    WHERE cp.goal_id = g.id
    ORDER BY cp.checkpoint_date DESC
    LIMIT 1
  ) c ON true
  WHERE g.tenant_id = p_tenant_id
    AND g.is_active = true
  ORDER BY g.wellbeing_weight DESC, g.created_at;
$$;

-- Get checkpoint history for a goal (last N days)
CREATE OR REPLACE FUNCTION get_goal_checkpoint_history(p_goal_id UUID, p_days INTEGER DEFAULT 30)
RETURNS SETOF exo_goal_checkpoints
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM exo_goal_checkpoints
  WHERE goal_id = p_goal_id
    AND checkpoint_date >= CURRENT_DATE - p_days
  ORDER BY checkpoint_date;
$$;
