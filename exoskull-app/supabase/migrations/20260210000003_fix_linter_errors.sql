-- =====================================================
-- FIX DATABASE LINTER ERRORS
-- =====================================================
-- 1. get_tyrolka_context: is_active column doesn't exist → use expires_at
-- 2. get_ai_usage_summary: estimated_cost may be missing → ensure column + fix function
-- =====================================================

-- =====================================================
-- 1. FIX get_tyrolka_context
-- =====================================================
-- Replace is_active = TRUE with expires_at check

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

-- =====================================================
-- 2. FIX get_ai_usage_summary
-- =====================================================
-- Ensure estimated_cost column exists, then recreate function

ALTER TABLE IF EXISTS exo_ai_usage
  ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10, 6) DEFAULT 0;

CREATE OR REPLACE FUNCTION get_ai_usage_summary(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 30
) RETURNS TABLE (
  total_requests BIGINT,
  total_cost DECIMAL,
  total_tokens BIGINT,
  avg_latency INTEGER,
  requests_by_tier JSONB,
  cost_by_model JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    COALESCE(SUM(subq.estimated_cost), 0)::DECIMAL as total_cost,
    COALESCE(SUM(subq.input_tokens + subq.output_tokens), 0)::BIGINT as total_tokens,
    COALESCE(AVG(subq.latency_ms)::INTEGER, 0) as avg_latency,
    COALESCE(jsonb_object_agg(
      'tier_' || subq.tier::TEXT,
      subq.tier_count
    ), '{}'::JSONB) as requests_by_tier,
    COALESCE(jsonb_object_agg(
      subq.model,
      subq.model_cost
    ), '{}'::JSONB) as cost_by_model
  FROM (
    SELECT
      e.tier,
      e.model,
      e.input_tokens,
      e.output_tokens,
      e.latency_ms,
      e.estimated_cost,
      COUNT(*) OVER (PARTITION BY e.tier) as tier_count,
      SUM(e.estimated_cost) OVER (PARTITION BY e.model) as model_cost
    FROM exo_ai_usage e
    WHERE e.tenant_id = p_tenant_id
      AND e.created_at > NOW() - (p_days || ' days')::INTERVAL
  ) subq;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
