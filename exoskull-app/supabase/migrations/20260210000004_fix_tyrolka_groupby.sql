-- Fix: user_mits.rank must appear in GROUP BY (wrap in subquery)

CREATE OR REPLACE FUNCTION get_tyrolka_context(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_experience JSONB;
  v_research JSONB;
  v_objectives JSONB;
  v_active_ops JSONB;
  v_active_quests JSONB;
BEGIN
  -- Experience (Ja) - recent highlights about self
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'content', content,
    'category', category,
    'importance', importance
  )), '[]'::JSONB)
  INTO v_experience
  FROM (
    SELECT content, category, importance
    FROM user_memory_highlights
    WHERE user_id = p_tenant_id
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY importance DESC, created_at DESC
    LIMIT 10
  ) t;

  -- Research (Nie-Ja) - recent world knowledge notes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'summary', ai_summary,
    'source', source_url
  )), '[]'::JSONB)
  INTO v_research
  FROM (
    SELECT title, ai_summary, source_url
    FROM user_notes
    WHERE tenant_id = p_tenant_id
      AND is_research = TRUE
    ORDER BY captured_at DESC
    LIMIT 5
  ) t;

  -- Objectives (MITs)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'objective', objective,
    'score', score
  )), '[]'::JSONB)
  INTO v_objectives
  FROM (
    SELECT rank, objective, score
    FROM user_mits
    WHERE tenant_id = p_tenant_id
    ORDER BY rank
  ) t;

  -- Active Ops (current tasks)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'priority', priority,
    'due_date', due_date
  )), '[]'::JSONB)
  INTO v_active_ops
  FROM (
    SELECT title, priority, due_date
    FROM user_ops
    WHERE tenant_id = p_tenant_id
      AND status IN ('pending', 'active')
    ORDER BY
      CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END,
      priority DESC
    LIMIT 5
  ) t;

  -- Active Quests
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'progress', ROUND(completed_ops::DECIMAL / NULLIF(target_ops, 0) * 100)
  )), '[]'::JSONB)
  INTO v_active_quests
  FROM (
    SELECT title, completed_ops, target_ops
    FROM user_quests
    WHERE tenant_id = p_tenant_id
      AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 3
  ) t;

  RETURN jsonb_build_object(
    'ja', v_experience,
    'nieJa', v_research,
    'objectives', v_objectives,
    'activeOps', v_active_ops,
    'activeQuests', v_active_quests
  );
END;
$$ LANGUAGE plpgsql;
