-- =============================================================================
-- Audit Fixes Migration
-- Fixes: gold views ordering, event_triggers RLS, GHL JWT claim, missing indexes
-- =============================================================================

-- =============================================================================
-- D1: Recreate Gold Views (originally created before source tables existed)
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS exo_gold_messages_daily;
DROP MATERIALIZED VIEW IF EXISTS exo_gold_monthly_summary;
DROP MATERIALIZED VIEW IF EXISTS exo_gold_weekly_summary;
DROP MATERIALIZED VIEW IF EXISTS exo_gold_daily_summary;

-- Daily summary
CREATE MATERIALIZED VIEW exo_gold_daily_summary AS
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

CREATE UNIQUE INDEX idx_gold_daily_tenant_date
  ON exo_gold_daily_summary(tenant_id, date);
CREATE INDEX idx_gold_daily_date
  ON exo_gold_daily_summary(date DESC);

-- Weekly summary
CREATE MATERIALIZED VIEW exo_gold_weekly_summary AS
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

CREATE UNIQUE INDEX idx_gold_weekly_tenant_week
  ON exo_gold_weekly_summary(tenant_id, week_start);
CREATE INDEX idx_gold_weekly_week
  ON exo_gold_weekly_summary(week_start DESC);

-- Monthly summary
CREATE MATERIALIZED VIEW exo_gold_monthly_summary AS
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

CREATE UNIQUE INDEX idx_gold_monthly_tenant_month
  ON exo_gold_monthly_summary(tenant_id, month_start);
CREATE INDEX idx_gold_monthly_month
  ON exo_gold_monthly_summary(month_start DESC);

-- Messages daily summary
CREATE MATERIALIZED VIEW exo_gold_messages_daily AS
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

CREATE UNIQUE INDEX idx_gold_msg_daily_tenant_date
  ON exo_gold_messages_daily(tenant_id, date);

-- =============================================================================
-- D2: Add RLS policies for exo_event_triggers (RLS enabled but no policies)
-- =============================================================================

-- Service role full access (for CRON/system operations)
CREATE POLICY "Service role full access event_triggers"
  ON exo_event_triggers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view their own triggers
CREATE POLICY "Users can view own event_triggers"
  ON exo_event_triggers FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());

-- Authenticated users can manage their own triggers
CREATE POLICY "Users can manage own event_triggers"
  ON exo_event_triggers FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- =============================================================================
-- D4: Fix GHL RLS policies (auth.jwt()->>'tenant_id' doesn't exist in Supabase)
-- =============================================================================

-- Drop broken policies
DROP POLICY IF EXISTS "Users can view own GHL connections" ON exo_ghl_connections;
DROP POLICY IF EXISTS "Users can view own GHL contacts" ON exo_ghl_contacts;

-- Recreate with auth.uid()
CREATE POLICY "Users can view own GHL connections" ON exo_ghl_connections
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users can view own GHL contacts" ON exo_ghl_contacts
  FOR SELECT USING (tenant_id = auth.uid());

-- Fix remaining GHL tables if they have the same pattern
DO $$
BEGIN
  -- exo_ghl_messages
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own GHL messages' AND tablename = 'exo_ghl_messages') THEN
    DROP POLICY "Users can view own GHL messages" ON exo_ghl_messages;
    CREATE POLICY "Users can view own GHL messages" ON exo_ghl_messages
      FOR SELECT USING (tenant_id = auth.uid());
  END IF;

  -- exo_ghl_appointments
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own GHL appointments' AND tablename = 'exo_ghl_appointments') THEN
    DROP POLICY "Users can view own GHL appointments" ON exo_ghl_appointments;
    CREATE POLICY "Users can view own GHL appointments" ON exo_ghl_appointments
      FOR SELECT USING (tenant_id = auth.uid());
  END IF;

  -- exo_ghl_oauth_states
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own GHL oauth states' AND tablename = 'exo_ghl_oauth_states') THEN
    DROP POLICY "Users can view own GHL oauth states" ON exo_ghl_oauth_states;
    CREATE POLICY "Users can view own GHL oauth states" ON exo_ghl_oauth_states
      FOR SELECT USING (tenant_id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- P1: Add missing tenant_id indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ghl_oauth_states_tenant
  ON exo_ghl_oauth_states(tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_installations_tenant
  ON exo_user_installations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_rig_connections_tenant
  ON exo_rig_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_rig_sync_log_tenant
  ON exo_rig_sync_log(tenant_id);
