-- =====================================================
-- HEALTH METRICS TABLE
-- Time-series storage for Health Connect data
-- =====================================================

-- Create health metrics table
CREATE TABLE IF NOT EXISTS exo_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Metric data
  metric_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'health-connect',

  -- Additional data
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_metric_per_time UNIQUE (tenant_id, metric_type, recorded_at, source)
);

-- Optimized indexes for common queries
CREATE INDEX IF NOT EXISTS idx_health_metrics_tenant_type_time
  ON exo_health_metrics(tenant_id, metric_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_metrics_tenant_time
  ON exo_health_metrics(tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_metrics_source
  ON exo_health_metrics(source);

-- Enable RLS
ALTER TABLE exo_health_metrics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own metrics
CREATE POLICY "Users see own health metrics"
  ON exo_health_metrics FOR SELECT
  USING (tenant_id = auth.uid());

-- Users can insert their own metrics
CREATE POLICY "Users insert own health metrics"
  ON exo_health_metrics FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

-- Service role can do everything
CREATE POLICY "Service role full access to health metrics"
  ON exo_health_metrics FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- ADD HEALTH-CONNECT TO REGISTRY
-- =====================================================

INSERT INTO exo_registry (slug, type, name, description, icon, category, is_builtin, config_schema)
VALUES (
  'health-connect',
  'rig',
  'Health Connect',
  'Android Health Connect - sen, kroki, puls, HRV z urządzeń Android',
  '❤️',
  'health',
  true,
  '{
    "type": "object",
    "properties": {
      "sync_frequency": {
        "type": "string",
        "enum": ["15min", "hourly", "daily"],
        "default": "hourly"
      },
      "enabled_metrics": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["steps", "sleep", "heart_rate", "hrv", "calories", "distance"]
        },
        "default": ["steps", "sleep", "heart_rate"]
      }
    }
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  config_schema = EXCLUDED.config_schema;

-- =====================================================
-- MATERIALIZED VIEW: Daily Health Summary (Gold layer)
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS gold_daily_health_summary AS
SELECT
  tenant_id,
  date_trunc('day', recorded_at)::date AS date,

  -- Steps
  MAX(CASE WHEN metric_type = 'steps' THEN value END) AS steps_total,

  -- Sleep (sum of sleep sessions in minutes)
  SUM(CASE WHEN metric_type = 'sleep' THEN value END) AS sleep_minutes,

  -- Heart rate (average)
  AVG(CASE WHEN metric_type = 'heart_rate' THEN value END) AS heart_rate_avg,
  MIN(CASE WHEN metric_type = 'heart_rate' THEN value END) AS heart_rate_min,
  MAX(CASE WHEN metric_type = 'heart_rate' THEN value END) AS heart_rate_max,

  -- HRV (average)
  AVG(CASE WHEN metric_type = 'hrv' THEN value END) AS hrv_avg,

  -- Calories
  SUM(CASE WHEN metric_type = 'calories' THEN value END) AS calories_total,

  -- Distance (meters)
  SUM(CASE WHEN metric_type = 'distance' THEN value END) AS distance_meters,

  -- Active minutes
  SUM(CASE WHEN metric_type = 'active_minutes' THEN value END) AS active_minutes,

  -- Weight (latest)
  (ARRAY_AGG(value ORDER BY recorded_at DESC) FILTER (WHERE metric_type = 'weight'))[1] AS weight_latest,

  -- Data quality
  COUNT(*) AS total_records,
  COUNT(DISTINCT metric_type) AS metric_types_count,

  -- Timestamp
  now() AS refreshed_at

FROM exo_health_metrics
WHERE recorded_at >= now() - INTERVAL '90 days'
GROUP BY tenant_id, date_trunc('day', recorded_at)::date;

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_daily_health_summary_pk
  ON gold_daily_health_summary(tenant_id, date);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_gold_daily_health_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY gold_daily_health_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT SELECT ON gold_daily_health_summary TO authenticated;

COMMENT ON TABLE exo_health_metrics IS 'Time-series health data from Health Connect and other sources';
COMMENT ON MATERIALIZED VIEW gold_daily_health_summary IS 'Pre-aggregated daily health summaries for fast dashboard queries';
