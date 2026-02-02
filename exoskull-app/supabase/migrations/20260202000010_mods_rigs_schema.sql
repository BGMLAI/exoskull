-- =====================================================
-- MODS & RIGS SYSTEM - Exoskulleton Marketplace
-- =====================================================
-- Mods = User-facing abilities (Sleep Tracker, Focus Mode)
-- Rigs = Backend integrations (Oura API, Google Calendar)
-- Quests = Weekly development programs
-- =====================================================

-- Registry of all available Mods, Rigs, and Quests
CREATE TABLE IF NOT EXISTS exo_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('mod', 'rig', 'quest')),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- emoji or icon name
  category TEXT NOT NULL, -- health, productivity, finance, smart_home, wellbeing
  version TEXT DEFAULT '1.0.0',

  -- Configuration schema (JSON Schema format)
  config_schema JSONB DEFAULT '{}',

  -- Dependencies: which Rigs does this Mod require?
  requires_rigs TEXT[] DEFAULT '{}',

  -- Metadata
  is_builtin BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  author TEXT DEFAULT 'ExoSkull',

  -- For Quests: duration in days
  duration_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User installations (which Mods/Rigs user has installed)
CREATE TABLE IF NOT EXISTS exo_user_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  registry_id UUID NOT NULL REFERENCES exo_registry(id) ON DELETE CASCADE,

  -- User-specific configuration
  config JSONB DEFAULT '{}',

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- For Quests: progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress JSONB DEFAULT '{}', -- day-by-day progress

  installed_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, registry_id)
);

-- OAuth connections for Rigs (Oura, Google, etc.)
CREATE TABLE IF NOT EXISTS exo_rig_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  rig_slug TEXT NOT NULL,

  -- OAuth tokens (encrypted at rest by Supabase)
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,

  -- Scopes granted
  scopes TEXT[] DEFAULT '{}',

  -- Provider-specific metadata (user_id, account info, etc.)
  metadata JSONB DEFAULT '{}',

  -- Sync status
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending', -- pending, syncing, success, error
  sync_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, rig_slug)
);

-- Sync history for Rigs
CREATE TABLE IF NOT EXISTS exo_rig_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  rig_slug TEXT NOT NULL,

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  status TEXT DEFAULT 'running', -- running, success, error
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,

  -- What was synced
  sync_type TEXT, -- full, incremental, manual
  data_range JSONB -- {from: date, to: date}
);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE exo_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_user_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_rig_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_rig_sync_log ENABLE ROW LEVEL SECURITY;

-- Registry is public read (anyone can browse marketplace)
DROP POLICY IF EXISTS "Registry is publicly readable" ON exo_registry;
CREATE POLICY "Registry is publicly readable" ON exo_registry
  FOR SELECT USING (true);

-- Only system can modify registry
DROP POLICY IF EXISTS "Only service role can modify registry" ON exo_registry;
CREATE POLICY "Only service role can modify registry" ON exo_registry
  FOR ALL USING (auth.role() = 'service_role');

-- Installations: users see their own
DROP POLICY IF EXISTS "Users can view own installations" ON exo_user_installations;
CREATE POLICY "Users can view own installations" ON exo_user_installations
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own installations" ON exo_user_installations;
CREATE POLICY "Users can manage own installations" ON exo_user_installations
  FOR ALL USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Connections: users see their own (sensitive data!)
DROP POLICY IF EXISTS "Users can view own connections" ON exo_rig_connections;
CREATE POLICY "Users can view own connections" ON exo_rig_connections
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own connections" ON exo_rig_connections;
CREATE POLICY "Users can manage own connections" ON exo_rig_connections
  FOR ALL USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Sync log: users see their own
DROP POLICY IF EXISTS "Users can view own sync logs" ON exo_rig_sync_log;
CREATE POLICY "Users can view own sync logs" ON exo_rig_sync_log
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage sync logs" ON exo_rig_sync_log;
CREATE POLICY "Service role can manage sync logs" ON exo_rig_sync_log
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_registry_type ON exo_registry(type);
CREATE INDEX IF NOT EXISTS idx_registry_category ON exo_registry(category);
CREATE INDEX IF NOT EXISTS idx_registry_slug ON exo_registry(slug);

CREATE INDEX IF NOT EXISTS idx_installations_tenant ON exo_user_installations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installations_registry ON exo_user_installations(registry_id);

CREATE INDEX IF NOT EXISTS idx_connections_tenant ON exo_rig_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_rig ON exo_rig_connections(rig_slug);

CREATE INDEX IF NOT EXISTS idx_sync_log_tenant ON exo_rig_sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_rig ON exo_rig_sync_log(rig_slug);

-- =====================================================
-- SEED DATA: Built-in Mods & Rigs
-- =====================================================

-- RIGS (Integrations)
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, config_schema) VALUES
-- Health Rigs
('rig', 'oura', 'Oura Ring', 'Sleep, HRV, readiness, and activity data from Oura Ring', '💍', 'health', true,
 '{"type": "object", "properties": {"sync_frequency": {"type": "string", "enum": ["hourly", "daily"], "default": "hourly"}}}'),

('rig', 'fitbit', 'Fitbit', 'Steps, sleep, heart rate from Fitbit devices', '⌚', 'health', true,
 '{"type": "object", "properties": {"sync_frequency": {"type": "string", "enum": ["hourly", "daily"], "default": "daily"}}}'),

('rig', 'apple-health', 'Apple Health', 'Unified health data from Apple Health (via HealthConnect)', '🍎', 'health', true,
 '{"type": "object", "properties": {"metrics": {"type": "array", "items": {"type": "string"}, "default": ["steps", "sleep", "heart_rate"]}}}'),

-- Productivity Rigs
('rig', 'google-calendar', 'Google Calendar', 'Events, free/busy, and reminders from Google Calendar', '📅', 'productivity', true,
 '{"type": "object", "properties": {"calendars": {"type": "array", "items": {"type": "string"}, "description": "Calendar IDs to sync"}}}'),

('rig', 'notion', 'Notion', 'Databases, pages, and notes from Notion workspace', '📓', 'productivity', true,
 '{"type": "object", "properties": {"databases": {"type": "array", "items": {"type": "string"}, "description": "Database IDs to sync"}}}'),

('rig', 'todoist', 'Todoist', 'Tasks and projects from Todoist', '✅', 'productivity', true,
 '{"type": "object", "properties": {"projects": {"type": "array", "items": {"type": "string"}, "description": "Project IDs to sync"}}}'),

-- Smart Home Rigs
('rig', 'philips-hue', 'Philips Hue', 'Control lights and scenes for sleep optimization', '💡', 'smart_home', true,
 '{"type": "object", "properties": {"bridge_ip": {"type": "string"}, "rooms": {"type": "array", "items": {"type": "string"}}}}'),

('rig', 'home-assistant', 'Home Assistant', 'Universal smart home integration', '🏠', 'smart_home', true,
 '{"type": "object", "properties": {"url": {"type": "string"}, "token": {"type": "string"}}}'),

-- Finance Rigs
('rig', 'plaid', 'Plaid', 'Bank transactions and balances (read-only)', '🏦', 'finance', true,
 '{"type": "object", "properties": {"accounts": {"type": "array", "items": {"type": "string"}}}}'),

('rig', 'stripe', 'Stripe', 'Payments and subscriptions tracking', '💳', 'finance', true,
 '{"type": "object", "properties": {}}')

ON CONFLICT (slug) DO NOTHING;

-- MODS (Abilities)
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, requires_rigs, config_schema) VALUES
-- Health Mods
('mod', 'sleep-tracker', 'Sleep Tracker', 'Track and analyze your sleep patterns with insights', '😴', 'health', true,
 ARRAY['oura', 'fitbit', 'apple-health'],
 '{"type": "object", "properties": {"goal_hours": {"type": "number", "default": 8}, "bedtime_reminder": {"type": "boolean", "default": true}}}'),

('mod', 'energy-monitor', 'Energy Monitor', 'Track your energy levels throughout the day', '⚡', 'health', true,
 ARRAY['oura', 'fitbit'],
 '{"type": "object", "properties": {"check_in_times": {"type": "array", "items": {"type": "string"}, "default": ["09:00", "14:00", "19:00"]}}}'),

('mod', 'hrv-tracker', 'HRV Tracker', 'Monitor heart rate variability for stress and recovery', '❤️', 'health', true,
 ARRAY['oura', 'fitbit', 'apple-health'],
 '{"type": "object", "properties": {"alert_threshold": {"type": "number", "default": 20}}}'),

-- Productivity Mods
('mod', 'focus-mode', 'Focus Mode', 'Block distractions and optimize your environment for deep work', '🎯', 'productivity', true,
 ARRAY['google-calendar', 'philips-hue'],
 '{"type": "object", "properties": {"duration_minutes": {"type": "number", "default": 90}, "block_calendar": {"type": "boolean", "default": true}}}'),

('mod', 'task-manager', 'Task Manager', 'Unified task management synced with your tools', '📋', 'productivity', true,
 ARRAY['todoist', 'notion'],
 '{"type": "object", "properties": {"default_project": {"type": "string"}, "auto_prioritize": {"type": "boolean", "default": true}}}'),

('mod', 'calendar-assistant', 'Calendar Assistant', 'Smart scheduling and meeting preparation', '📆', 'productivity', true,
 ARRAY['google-calendar'],
 '{"type": "object", "properties": {"prep_time_minutes": {"type": "number", "default": 10}, "buffer_between_meetings": {"type": "number", "default": 15}}}'),

-- Wellbeing Mods
('mod', 'mood-tracker', 'Mood Tracker', 'Daily mood check-ins and pattern analysis', '🎭', 'wellbeing', true,
 ARRAY[]::TEXT[],
 '{"type": "object", "properties": {"check_in_times": {"type": "array", "items": {"type": "string"}, "default": ["08:00", "20:00"]}}}'),

('mod', 'habit-tracker', 'Habit Tracker', 'Build and maintain positive habits with streak tracking', '🔥', 'wellbeing', true,
 ARRAY[]::TEXT[],
 '{"type": "object", "properties": {"habits": {"type": "array", "items": {"type": "object"}}}}'),

-- Finance Mods
('mod', 'spending-tracker', 'Spending Tracker', 'Track and categorize your expenses automatically', '💰', 'finance', true,
 ARRAY['plaid'],
 '{"type": "object", "properties": {"budget_alerts": {"type": "boolean", "default": true}, "categories": {"type": "array", "items": {"type": "string"}}}}')

ON CONFLICT (slug) DO NOTHING;

-- QUESTS (Weekly Programs)
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, duration_days, requires_rigs, config_schema) VALUES
('quest', '7-day-sleep', '7-Day Sleep Reset', 'Transform your sleep in one week with daily challenges', '🌙', 'health', true, 7,
 ARRAY['oura', 'fitbit'],
 '{"type": "object", "properties": {"target_bedtime": {"type": "string", "default": "22:30"}, "target_wake": {"type": "string", "default": "06:30"}}}'),

('quest', 'digital-detox', 'Digital Detox Week', 'Reduce screen time and reclaim your attention', '📵', 'wellbeing', true, 7,
 ARRAY[]::TEXT[],
 '{"type": "object", "properties": {"phone_free_hours": {"type": "array", "items": {"type": "string"}, "default": ["20:00-08:00"]}}}'),

('quest', 'morning-routine', 'Morning Routine Builder', 'Create and stick to an optimal morning routine', '🌅', 'productivity', true, 7,
 ARRAY[]::TEXT[],
 '{"type": "object", "properties": {"wake_time": {"type": "string", "default": "06:00"}, "routine_items": {"type": "array", "items": {"type": "string"}}}}'),

('quest', 'mindfulness-week', 'Mindfulness Week', 'Daily meditation and mindfulness practices', '🧘', 'wellbeing', true, 7,
 ARRAY[]::TEXT[],
 '{"type": "object", "properties": {"session_minutes": {"type": "number", "default": 10}}}'),

('quest', 'fitness-kickstart', 'Fitness Kickstart', '7 days to build a consistent exercise habit', '💪', 'health', true, 7,
 ARRAY['apple-health', 'fitbit'],
 '{"type": "object", "properties": {"workout_type": {"type": "string", "enum": ["cardio", "strength", "mixed"], "default": "mixed"}}}')

ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has required Rigs for a Mod
CREATE OR REPLACE FUNCTION check_mod_requirements(p_tenant_id UUID, p_mod_slug TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_required_rigs TEXT[];
  v_connected_rigs TEXT[];
BEGIN
  -- Get required rigs for the mod
  SELECT requires_rigs INTO v_required_rigs
  FROM exo_registry
  WHERE slug = p_mod_slug AND type = 'mod';

  -- If no requirements, return true
  IF v_required_rigs IS NULL OR array_length(v_required_rigs, 1) IS NULL THEN
    RETURN true;
  END IF;

  -- Get user's connected rigs
  SELECT array_agg(rig_slug) INTO v_connected_rigs
  FROM exo_rig_connections
  WHERE tenant_id = p_tenant_id
    AND access_token IS NOT NULL;

  -- Check if any required rig is connected
  RETURN v_required_rigs && v_connected_rigs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's installed items with connection status
CREATE OR REPLACE FUNCTION get_user_inventory(p_tenant_id UUID)
RETURNS TABLE (
  installation_id UUID,
  type TEXT,
  slug TEXT,
  name TEXT,
  icon TEXT,
  enabled BOOLEAN,
  is_connected BOOLEAN,
  config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id as installation_id,
    r.type,
    r.slug,
    r.name,
    r.icon,
    i.enabled,
    CASE
      WHEN r.type = 'rig' THEN (c.access_token IS NOT NULL)
      ELSE true
    END as is_connected,
    i.config
  FROM exo_user_installations i
  JOIN exo_registry r ON r.id = i.registry_id
  LEFT JOIN exo_rig_connections c ON c.tenant_id = i.tenant_id AND c.rig_slug = r.slug
  WHERE i.tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
