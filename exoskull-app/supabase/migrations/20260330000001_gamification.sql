-- Gamification System: XP, Levels, Streaks, Badges
-- Hooked methodology: dopaminergic engagement through progress visualization

-- ============================================================================
-- USER GAMIFICATION PROFILE
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_gamification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- XP & Level
  xp_total INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp_to_next_level INTEGER NOT NULL DEFAULT 100,

  -- Streaks
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,

  -- Stats
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  goals_achieved INTEGER NOT NULL DEFAULT 0,
  apps_built INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  tools_used INTEGER NOT NULL DEFAULT 0,
  days_active INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_tenant_gamification UNIQUE (tenant_id)
);

-- ============================================================================
-- XP EVENT LOG (Bronze — never deleted)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL, -- 'task_completed', 'goal_achieved', 'streak_maintained', 'app_built', 'first_call', etc.
  xp_amount INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- BADGES / ACHIEVEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  badge_id TEXT NOT NULL, -- 'first_goal', 'streak_7', 'streak_30', 'app_builder', 'night_owl', etc.
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- emoji or icon name
  rarity TEXT NOT NULL DEFAULT 'common', -- common, rare, epic, legendary

  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_tenant_badge UNIQUE (tenant_id, badge_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gamification_tenant ON exo_gamification(tenant_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_tenant ON exo_xp_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_xp_events_created ON exo_xp_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_badges_tenant ON exo_badges(tenant_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE exo_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_badges ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_gamification" ON exo_gamification FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_xp_events" ON exo_xp_events FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_badges" ON exo_badges FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- LEVEL CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_level(xp INTEGER)
RETURNS TABLE(level INTEGER, xp_to_next INTEGER) AS $$
DECLARE
  current_level INTEGER := 1;
  xp_needed INTEGER := 100;
  xp_remaining INTEGER := xp;
BEGIN
  -- Each level requires progressively more XP (100, 150, 225, 337, ...)
  WHILE xp_remaining >= xp_needed LOOP
    xp_remaining := xp_remaining - xp_needed;
    current_level := current_level + 1;
    xp_needed := CEIL(xp_needed * 1.5);
  END LOOP;

  RETURN QUERY SELECT current_level, xp_needed;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- AWARD XP RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION award_xp(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_xp_amount INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_profile exo_gamification%ROWTYPE;
  v_new_xp INTEGER;
  v_level_info RECORD;
  v_today DATE := CURRENT_DATE;
  v_streak INTEGER;
  v_leveled_up BOOLEAN := false;
BEGIN
  -- Ensure gamification profile exists
  INSERT INTO exo_gamification (tenant_id)
  VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Get current profile
  SELECT * INTO v_profile FROM exo_gamification WHERE tenant_id = p_tenant_id;

  -- Calculate new XP
  v_new_xp := v_profile.xp_total + p_xp_amount;

  -- Calculate new level
  SELECT * INTO v_level_info FROM calculate_level(v_new_xp);
  v_leveled_up := v_level_info.level > v_profile.level;

  -- Calculate streak
  v_streak := v_profile.current_streak;
  IF v_profile.last_activity_date IS NULL OR v_profile.last_activity_date < v_today - 1 THEN
    v_streak := 1; -- reset
  ELSIF v_profile.last_activity_date < v_today THEN
    v_streak := v_streak + 1; -- increment
  END IF;
  -- else: same day, keep current streak

  -- Update profile
  UPDATE exo_gamification SET
    xp_total = v_new_xp,
    level = v_level_info.level,
    xp_to_next_level = v_level_info.xp_to_next,
    current_streak = v_streak,
    longest_streak = GREATEST(v_profile.longest_streak, v_streak),
    last_activity_date = v_today,
    tasks_completed = tasks_completed + CASE WHEN p_event_type = 'task_completed' THEN 1 ELSE 0 END,
    goals_achieved = goals_achieved + CASE WHEN p_event_type = 'goal_achieved' THEN 1 ELSE 0 END,
    apps_built = apps_built + CASE WHEN p_event_type = 'app_built' THEN 1 ELSE 0 END,
    messages_sent = messages_sent + CASE WHEN p_event_type = 'message_sent' THEN 1 ELSE 0 END,
    tools_used = tools_used + CASE WHEN p_event_type = 'tool_used' THEN 1 ELSE 0 END,
    days_active = CASE WHEN v_profile.last_activity_date < v_today THEN days_active + 1 ELSE days_active END,
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  -- Log XP event
  INSERT INTO exo_xp_events (tenant_id, event_type, xp_amount, description, metadata)
  VALUES (p_tenant_id, p_event_type, p_xp_amount, p_description, p_metadata);

  RETURN jsonb_build_object(
    'xp_total', v_new_xp,
    'xp_gained', p_xp_amount,
    'level', v_level_info.level,
    'xp_to_next', v_level_info.xp_to_next,
    'streak', v_streak,
    'leveled_up', v_leveled_up
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
