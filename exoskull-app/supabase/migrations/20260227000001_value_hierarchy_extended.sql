-- ============================================================================
-- Extended Value Hierarchy
-- Adds user_missions table, loop_id FK on quests, mission_id FK on ops,
-- and auto-seeding RPCs for onboarding
-- ============================================================================

-- ============================================================================
-- 1. Add loop_id FK on user_quests (link quests to specific loops/areas)
-- Previously quests only had loop_slug (text). Now add a proper FK.
-- ============================================================================

ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS loop_id UUID REFERENCES user_loops(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quests_loop_id ON user_quests(tenant_id, loop_id);

-- Backfill loop_id from loop_slug where possible
UPDATE user_quests q
SET loop_id = l.id
FROM user_loops l
WHERE q.tenant_id = l.tenant_id
  AND q.loop_slug = l.slug
  AND q.loop_id IS NULL;

-- ============================================================================
-- 2. user_missions table (Projects within a Quest)
-- Sits between Quests and Ops in the hierarchy:
-- Values > Loops(Areas) > Quests > Missions > Ops(Challenges) > Notes
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

  -- Organization
  loop_slug TEXT,
  tags TEXT[],

  -- Progress (computed via trigger)
  total_ops INT DEFAULT 0,
  completed_ops INT DEFAULT 0,

  -- Dates
  start_date DATE,
  target_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_missions_tenant ON user_missions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_missions_quest ON user_missions(quest_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON user_missions(tenant_id, status);

-- RLS
ALTER TABLE user_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own missions" ON user_missions
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own missions" ON user_missions
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own missions" ON user_missions
  FOR UPDATE USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own missions" ON user_missions
  FOR DELETE USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access missions" ON user_missions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Add mission_id FK on user_ops (link ops/challenges to missions)
-- ============================================================================

ALTER TABLE user_ops ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES user_missions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ops_mission ON user_ops(mission_id);

-- ============================================================================
-- 4. Add mission_id FK on user_notes (link notes to missions)
-- ============================================================================

ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES user_missions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notes_mission ON user_notes(mission_id);

-- ============================================================================
-- 5. Trigger: Update mission progress when op status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_mission_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mission_id IS NOT NULL THEN
    UPDATE user_missions
    SET
      total_ops = (
        SELECT COUNT(*) FROM user_ops WHERE mission_id = NEW.mission_id
      ),
      completed_ops = (
        SELECT COUNT(*) FROM user_ops
        WHERE mission_id = NEW.mission_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE id = NEW.mission_id;
  END IF;

  -- Also update old mission if moved
  IF TG_OP = 'UPDATE' AND OLD.mission_id IS NOT NULL AND OLD.mission_id IS DISTINCT FROM NEW.mission_id THEN
    UPDATE user_missions
    SET
      total_ops = (
        SELECT COUNT(*) FROM user_ops WHERE mission_id = OLD.mission_id
      ),
      completed_ops = (
        SELECT COUNT(*) FROM user_ops
        WHERE mission_id = OLD.mission_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE id = OLD.mission_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_mission_progress
  AFTER INSERT OR UPDATE OF status, mission_id ON user_ops
  FOR EACH ROW
  EXECUTE FUNCTION update_mission_progress();

-- ============================================================================
-- 6. RPC: seed_value_hierarchy(p_tenant_id)
-- After birth: creates default areas (loops) linked to values,
-- and one starter quest per area.
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_value_hierarchy(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loop RECORD;
  v_quest_title TEXT;
BEGIN
  -- Ensure values + loops exist and are linked
  PERFORM create_default_values(p_tenant_id);
  PERFORM create_default_loops(p_tenant_id);
  PERFORM link_default_values_to_loops(p_tenant_id);

  -- Create one starter quest per active loop that doesn't have any quests yet
  FOR v_loop IN
    SELECT l.id, l.tenant_id, l.slug, l.name
    FROM user_loops l
    WHERE l.tenant_id = p_tenant_id
      AND l.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM user_quests q
        WHERE q.tenant_id = p_tenant_id AND q.loop_id = l.id
      )
  LOOP
    CASE v_loop.slug
      WHEN 'health'        THEN v_quest_title := 'Zadbaj o zdrowie';
      WHEN 'work'          THEN v_quest_title := 'Rozwoj kariery';
      WHEN 'relationships' THEN v_quest_title := 'Wzmocnij relacje';
      WHEN 'finance'       THEN v_quest_title := 'Porządek w finansach';
      WHEN 'growth'        THEN v_quest_title := 'Naucz sie czegos nowego';
      WHEN 'creativity'    THEN v_quest_title := 'Projekt kreatywny';
      WHEN 'fun'           THEN v_quest_title := 'Czas na odpoczynek';
      ELSE                      v_quest_title := 'Pierwszy quest: ' || v_loop.name;
    END CASE;

    INSERT INTO user_quests (tenant_id, loop_id, loop_slug, title, status)
    VALUES (p_tenant_id, v_loop.id, v_loop.slug, v_quest_title, 'active')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- 7. RPC: get_value_hierarchy(p_tenant_id)
-- Returns full hierarchy as JSON for the graph visualization
-- ============================================================================

CREATE OR REPLACE FUNCTION get_value_hierarchy(p_tenant_id UUID)
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
      'loops', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'slug', l.slug,
            'icon', l.icon,
            'color', l.color,
            'quests', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', q.id,
                  'title', q.title,
                  'status', q.status,
                  'missions', COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', m.id,
                        'title', m.title,
                        'status', m.status,
                        'total_ops', m.total_ops,
                        'completed_ops', m.completed_ops
                      )
                    )
                    FROM user_missions m
                    WHERE m.quest_id = q.id
                      AND m.status IN ('active', 'paused', 'draft')
                  ), '[]'::jsonb),
                  'ops_count', (
                    SELECT COUNT(*) FROM user_ops o
                    WHERE o.quest_id = q.id AND o.status IN ('pending', 'active')
                  )
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
