-- ============================================================================
-- Challenges & Notes Hierarchy Extension
-- Completes the full path: Values > Areas > Quests > Missions > Challenges > Notes
--
-- Adds:
--  1. user_challenges table (tasks/challenges within missions)
--  2. Hierarchy FKs on user_notes (value_id, loop_id, quest_id, challenge_id)
--  3. Updated get_value_hierarchy RPC with challenges + notes counts
-- ============================================================================

-- ============================================================================
-- 1. user_challenges table
-- Sits between Missions and Notes in the hierarchy.
-- Represents concrete tasks/challenges the user works on.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES user_missions(id) ON DELETE SET NULL,
  quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

  -- Organization
  loop_slug TEXT,
  tags TEXT[],
  difficulty INT DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),

  -- Progress
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT, -- 'daily', 'weekly', 'monthly', cron-like

  -- Dates
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_challenges_tenant ON user_challenges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_challenges_mission ON user_challenges(mission_id);
CREATE INDEX IF NOT EXISTS idx_challenges_quest ON user_challenges(quest_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON user_challenges(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_due ON user_challenges(tenant_id, due_date) WHERE status = 'active';

-- RLS
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenges" ON user_challenges
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own challenges" ON user_challenges
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own challenges" ON user_challenges
  FOR UPDATE USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own challenges" ON user_challenges
  FOR DELETE USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access challenges" ON user_challenges
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. Extend user_notes with full hierarchy FKs
-- Notes can be linked at any level of the hierarchy
-- ============================================================================

ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS value_id UUID REFERENCES exo_values(id) ON DELETE SET NULL;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS loop_id UUID REFERENCES user_loops(id) ON DELETE SET NULL;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL;
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES user_challenges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_value ON user_notes(tenant_id, value_id);
CREATE INDEX IF NOT EXISTS idx_notes_loop ON user_notes(tenant_id, loop_id);
CREATE INDEX IF NOT EXISTS idx_notes_quest ON user_notes(tenant_id, quest_id);
CREATE INDEX IF NOT EXISTS idx_notes_challenge ON user_notes(tenant_id, challenge_id);

-- ============================================================================
-- 3. Add challenge_id FK on user_ops (link ops to challenges)
-- ============================================================================

ALTER TABLE user_ops ADD COLUMN IF NOT EXISTS challenge_id UUID REFERENCES user_challenges(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ops_challenge ON user_ops(challenge_id);

-- ============================================================================
-- 4. Trigger: Update challenge completion stats
-- ============================================================================

CREATE OR REPLACE FUNCTION update_challenge_on_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.challenge_id IS NOT NULL THEN
    -- Check if all ops for this challenge are completed
    IF NOT EXISTS (
      SELECT 1 FROM user_ops
      WHERE challenge_id = NEW.challenge_id AND status != 'completed'
    ) THEN
      UPDATE user_challenges
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = NEW.challenge_id AND status = 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_challenge_auto_complete ON user_ops;
CREATE TRIGGER trg_challenge_auto_complete
  AFTER UPDATE OF status ON user_ops
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_challenge_on_complete();

-- ============================================================================
-- 5. Updated RPC: get_value_hierarchy_full(p_tenant_id)
-- Returns full hierarchy with challenges and notes counts
-- Values > Loops > Quests > Missions > Challenges (with notes_count)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_value_hierarchy_full(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'name', v.name,
      'icon', v.icon,
      'color', v.color,
      'priority', v.priority,
      'description', v.description,
      'is_default', v.is_default,
      'notes_count', (
        SELECT COUNT(*) FROM user_notes n
        WHERE n.value_id = v.id AND n.tenant_id = p_tenant_id
      ),
      'loops', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'slug', l.slug,
            'icon', l.icon,
            'color', l.color,
            'notes_count', (
              SELECT COUNT(*) FROM user_notes n
              WHERE n.loop_id = l.id AND n.tenant_id = p_tenant_id
            ),
            'quests', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', q.id,
                  'title', q.title,
                  'status', q.status,
                  'ops_count', (
                    SELECT COUNT(*) FROM user_ops o
                    WHERE o.quest_id = q.id AND o.status IN ('pending', 'active')
                  ),
                  'notes_count', (
                    SELECT COUNT(*) FROM user_notes n
                    WHERE n.quest_id = q.id AND n.tenant_id = p_tenant_id
                  ),
                  'missions', COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', m.id,
                        'title', m.title,
                        'status', m.status,
                        'total_ops', m.total_ops,
                        'completed_ops', m.completed_ops,
                        'challenges', COALESCE((
                          SELECT jsonb_agg(
                            jsonb_build_object(
                              'id', c.id,
                              'title', c.title,
                              'status', c.status,
                              'difficulty', c.difficulty,
                              'due_date', c.due_date,
                              'notes_count', (
                                SELECT COUNT(*) FROM user_notes n
                                WHERE n.challenge_id = c.id AND n.tenant_id = p_tenant_id
                              )
                            )
                          )
                          FROM user_challenges c
                          WHERE c.mission_id = m.id
                            AND c.tenant_id = p_tenant_id
                            AND c.status IN ('active', 'paused', 'draft')
                        ), '[]'::jsonb)
                      )
                    )
                    FROM user_missions m
                    WHERE m.quest_id = q.id
                      AND m.tenant_id = p_tenant_id
                      AND m.status IN ('active', 'paused', 'draft')
                  ), '[]'::jsonb)
                )
              )
              FROM user_quests q
              WHERE q.loop_id = l.id
                AND q.tenant_id = p_tenant_id
                AND q.status IN ('active', 'paused', 'draft')
            ), '[]'::jsonb)
          )
        )
        FROM user_loops l
        WHERE l.value_id = v.id
          AND l.tenant_id = p_tenant_id
          AND l.is_active = TRUE
      ), '[]'::jsonb)
    )
    ORDER BY v.priority DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM exo_values v
  WHERE v.tenant_id = p_tenant_id
    AND v.is_active = TRUE;

  RETURN v_result;
END;
$$;
