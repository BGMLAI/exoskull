-- =====================================================
-- ANDROID & WORKSPACE RIGS
-- =====================================================
-- Google Fit (HealthConnect), Google Workspace, Microsoft 365
-- =====================================================

-- Google Fit / HealthConnect
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, config_schema) VALUES
('rig', 'google-fit', 'Google Fit / HealthConnect', 'Steps, sleep, heart rate, workouts from Android HealthConnect', '🏃', 'health', true,
 '{"type": "object", "properties": {"data_types": {"type": "array", "items": {"type": "string"}, "default": ["steps", "sleep", "heart_rate", "calories", "distance"]}}}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Google Workspace (unified)
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, config_schema) VALUES
('rig', 'google-workspace', 'Google Workspace', 'Gmail, Calendar, Drive, Meet - full Google integration', '🔷', 'productivity', true,
 '{"type": "object", "properties": {"services": {"type": "array", "items": {"type": "string"}, "default": ["gmail", "calendar", "drive"]}}}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Microsoft 365 (unified)
INSERT INTO exo_registry (type, slug, name, description, icon, category, is_builtin, config_schema) VALUES
('rig', 'microsoft-365', 'Microsoft 365', 'Outlook, Calendar, OneDrive, Teams - full Microsoft integration', '🟦', 'productivity', true,
 '{"type": "object", "properties": {"services": {"type": "array", "items": {"type": "string"}, "default": ["outlook", "calendar", "onedrive"]}}}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Update existing Google Calendar to note it's part of Workspace
UPDATE exo_registry
SET description = 'Events, free/busy, reminders (also available via Google Workspace)'
WHERE slug = 'google-calendar';
