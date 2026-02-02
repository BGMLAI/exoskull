-- ============================================================================
-- Multi-Model AI Router - Usage Tracking
-- ============================================================================
-- Tracks AI model usage for cost analysis and optimization.
-- Used by lib/ai/model-router.ts to log all AI requests.
-- ============================================================================

-- AI Usage Table
CREATE TABLE IF NOT EXISTS exo_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Model info
  model TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  provider TEXT NOT NULL,

  -- Task classification
  task_category TEXT,

  -- Token usage
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking (USD)
  estimated_cost DECIMAL(10, 6) DEFAULT 0,

  -- Performance
  latency_ms INTEGER DEFAULT 0,

  -- Status
  success BOOLEAN DEFAULT true,
  error_message TEXT,

  -- Metadata
  request_metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_date
  ON exo_ai_usage(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_model_date
  ON exo_ai_usage(model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tier
  ON exo_ai_usage(tier);

CREATE INDEX IF NOT EXISTS idx_ai_usage_category
  ON exo_ai_usage(task_category)
  WHERE task_category IS NOT NULL;

-- RLS
ALTER TABLE exo_ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can see their own usage
DROP POLICY IF EXISTS "Users can view their AI usage" ON exo_ai_usage;
CREATE POLICY "Users can view their AI usage"
  ON exo_ai_usage FOR SELECT
  USING (tenant_id = auth.uid());

-- Service role can insert (for router)
DROP POLICY IF EXISTS "Service can insert AI usage" ON exo_ai_usage;
CREATE POLICY "Service can insert AI usage"
  ON exo_ai_usage FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Materialized View: Daily AI Costs
-- ============================================================================
-- Pre-aggregated daily costs for dashboard display.
-- Refreshed via CRON (gold-etl).
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ai_daily_costs AS
SELECT
  tenant_id,
  DATE(created_at) as date,
  model,
  tier,
  provider,
  task_category,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(estimated_cost) as total_cost,
  AVG(latency_ms)::INTEGER as avg_latency_ms,
  COUNT(*) FILTER (WHERE success = true) as successful_requests,
  COUNT(*) FILTER (WHERE success = false) as failed_requests
FROM exo_ai_usage
GROUP BY
  tenant_id,
  DATE(created_at),
  model,
  tier,
  provider,
  task_category;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ai_daily_costs_unique
  ON mv_ai_daily_costs(tenant_id, date, model, COALESCE(task_category, ''));

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Log AI usage (called from Edge Function or API)
CREATE OR REPLACE FUNCTION log_ai_usage(
  p_tenant_id UUID,
  p_model TEXT,
  p_tier INTEGER,
  p_provider TEXT,
  p_task_category TEXT DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_estimated_cost DECIMAL DEFAULT 0,
  p_latency_ms INTEGER DEFAULT 0,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO exo_ai_usage (
    tenant_id,
    model,
    tier,
    provider,
    task_category,
    input_tokens,
    output_tokens,
    estimated_cost,
    latency_ms,
    success,
    error_message,
    request_metadata
  ) VALUES (
    p_tenant_id,
    p_model,
    p_tier,
    p_provider,
    p_task_category,
    p_input_tokens,
    p_output_tokens,
    p_estimated_cost,
    p_latency_ms,
    p_success,
    p_error_message,
    p_metadata
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get AI usage summary for a tenant
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
    COALESCE(SUM(estimated_cost), 0)::DECIMAL as total_cost,
    COALESCE(SUM(input_tokens + output_tokens), 0)::BIGINT as total_tokens,
    COALESCE(AVG(latency_ms)::INTEGER, 0) as avg_latency,
    jsonb_object_agg(
      'tier_' || tier::TEXT,
      tier_count
    ) as requests_by_tier,
    jsonb_object_agg(
      model,
      model_cost
    ) as cost_by_model
  FROM (
    SELECT
      tier,
      model,
      COUNT(*) as tier_count,
      SUM(estimated_cost) as model_cost
    FROM exo_ai_usage
    WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY tier, model
  ) subq;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE exo_ai_usage IS 'Multi-Model AI Router usage tracking for cost optimization';
COMMENT ON MATERIALIZED VIEW mv_ai_daily_costs IS 'Daily aggregated AI costs per tenant/model';
