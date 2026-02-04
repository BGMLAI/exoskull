-- ============================================================================
-- UNIFIED VIEW TABLES
-- System activities, notifications, and emotion log extensions
-- ============================================================================

-- System activities (what the system is doing in the background)
CREATE TABLE IF NOT EXISTS exo_system_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- mod_build, data_analysis, health_check, intervention_plan, sync
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  result JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

ALTER TABLE exo_system_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own system activities" ON exo_system_activities
  FOR SELECT USING (auth.uid() = tenant_id);

CREATE POLICY "Service role manages system activities" ON exo_system_activities
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_system_activities_tenant_status
  ON exo_system_activities(tenant_id, status, started_at DESC);

-- Notifications and insights
CREATE TABLE IF NOT EXISTS exo_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- insight, alert, completion, suggestion, system
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'normal',  -- low, normal, high, urgent
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exo_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notifications" ON exo_notifications
  FOR ALL USING (auth.uid() = tenant_id);

CREATE POLICY "Service role manages notifications" ON exo_notifications
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_notifications_tenant_unread
  ON exo_notifications(tenant_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_tenant_recent
  ON exo_notifications(tenant_id, created_at DESC);

-- Extend emotion log with richer data
ALTER TABLE exo_emotion_log
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS emotions JSONB,
  ADD COLUMN IF NOT EXISTS stress_level FLOAT,
  ADD COLUMN IF NOT EXISTS energy_level FLOAT;

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE exo_system_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE exo_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE exo_interventions;
