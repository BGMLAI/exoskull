-- Gold Layer Schema
-- Pre-aggregated summaries as materialized views for sub-second dashboard queries
-- Refreshed daily at 02:00 UTC

-- =============================================================================
-- DAILY SUMMARY
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS exo_gold_daily_summary AS
SELECT
  tenant_id,
  DATE(started_at) as date,
  COUNT(*) as conversation_count,
  COALESCE(ROUND(AVG(duration_seconds)::NUMERIC, 2), 0) as avg_duration_seconds,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
  COUNT(*) FILTER (WHERE channel = 'voice') as voice_count,
  COUNT(*) FILTER (WHERE channel = 'sms') as sms_count,
  COUNT(*) FILTER (WHERE channel = 'web') as web_count,
  COUNT(*) FILTER (WHERE channel = 'api') as api_count,
  NOW() as computed_at
FROM exo_silver_conversations
GROUP BY tenant_id, DATE(started_at);

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_daily_tenant_date
  ON exo_gold_daily_summary(tenant_id, date);

-- Query index
CREATE INDEX IF NOT EXISTS idx_gold_daily_date
  ON exo_gold_daily_summary(date DESC);

-- =============================================================================
-- WEEKLY SUMMARY
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS exo_gold_weekly_summary AS
SELECT
  tenant_id,
  DATE_TRUNC('week', started_at)::DATE as week_start,
  COUNT(*) as conversation_count,
  COUNT(DISTINCT DATE(started_at)) as active_days,
  COALESCE(ROUND(AVG(duration_seconds)::NUMERIC, 2), 0) as avg_duration_seconds,
  COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
  COUNT(*) FILTER (WHERE channel = 'voice') as voice_count,
  COUNT(*) FILTER (WHERE channel = 'sms') as sms_count,
  COUNT(*) FILTER (WHERE channel = 'web') as web_count,
  NOW() as computed_at
FROM exo_silver_conversations
GROUP BY tenant_id, DATE_TRUNC('week', started_at);

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_weekly_tenant_week
  ON exo_gold_weekly_summary(tenant_id, week_start);

-- Query index
CREATE INDEX IF NOT EXISTS idx_gold_weekly_week
  ON exo_gold_weekly_summary(week_start DESC);

-- =============================================================================
-- MONTHLY SUMMARY
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS exo_gold_monthly_summary AS
SELECT
  c.tenant_id,
  DATE_TRUNC('month', c.started_at)::DATE as month_start,
  COUNT(*) as conversation_count,
  COUNT(DISTINCT DATE(c.started_at)) as active_days,
  COALESCE(ROUND(AVG(c.duration_seconds)::NUMERIC, 2), 0) as avg_duration_seconds,
  COALESCE(SUM(c.duration_seconds), 0) as total_duration_seconds,
  COUNT(*) FILTER (WHERE c.channel = 'voice') as voice_count,
  COUNT(*) FILTER (WHERE c.channel = 'sms') as sms_count,
  COUNT(*) FILTER (WHERE c.channel = 'web') as web_count,
  NOW() as computed_at
FROM exo_silver_conversations c
GROUP BY c.tenant_id, DATE_TRUNC('month', c.started_at);

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_monthly_tenant_month
  ON exo_gold_monthly_summary(tenant_id, month_start);

-- Query index
CREATE INDEX IF NOT EXISTS idx_gold_monthly_month
  ON exo_gold_monthly_summary(month_start DESC);

-- =============================================================================
-- MESSAGES DAILY SUMMARY
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS exo_gold_messages_daily AS
SELECT
  tenant_id,
  DATE(timestamp) as date,
  COUNT(*) as message_count,
  COUNT(*) FILTER (WHERE role = 'user') as user_messages,
  COUNT(*) FILTER (WHERE role = 'assistant') as assistant_messages,
  COUNT(*) FILTER (WHERE role = 'system') as system_messages,
  COALESCE(ROUND(AVG(duration_ms)::NUMERIC, 2), 0) as avg_duration_ms,
  COUNT(DISTINCT conversation_id) as unique_conversations,
  NOW() as computed_at
FROM exo_silver_messages
GROUP BY tenant_id, DATE(timestamp);

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_msg_daily_tenant_date
  ON exo_gold_messages_daily(tenant_id, date);

-- =============================================================================
-- SYNC LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS exo_gold_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_name TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  rows_count INTEGER,
  status TEXT DEFAULT 'success',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_gold_sync_view
  ON exo_gold_sync_log(view_name, refreshed_at DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW exo_gold_daily_summary IS 'Gold layer: Daily conversation aggregations per tenant';
COMMENT ON MATERIALIZED VIEW exo_gold_weekly_summary IS 'Gold layer: Weekly conversation aggregations per tenant';
COMMENT ON MATERIALIZED VIEW exo_gold_monthly_summary IS 'Gold layer: Monthly conversation aggregations per tenant';
COMMENT ON MATERIALIZED VIEW exo_gold_messages_daily IS 'Gold layer: Daily message aggregations per tenant';
COMMENT ON TABLE exo_gold_sync_log IS 'Gold ETL: Tracks materialized view refresh history';
