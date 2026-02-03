-- ============================================================================
-- MOD SYSTEM - IORS App Builder
--
-- Mods are micro-applications that IORS creates/installs as its own tools
-- to better serve the user. Users interact with Mods through IORS.
-- ============================================================================

-- Registry of all available Mods (templates + custom)
CREATE TABLE IF NOT EXISTS exo_mod_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Which Mods are installed for each tenant
CREATE TABLE IF NOT EXISTS exo_tenant_mods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  mod_id UUID NOT NULL REFERENCES exo_mod_registry(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  config_overrides JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, mod_id)
);

-- Generic data storage for all Mods
CREATE TABLE IF NOT EXISTS exo_mod_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  mod_slug TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE exo_mod_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_tenant_mods ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_mod_data ENABLE ROW LEVEL SECURITY;

-- Registry is readable by all authenticated users
CREATE POLICY "Anyone can view mod registry" ON exo_mod_registry
  FOR SELECT USING (true);

-- Tenant mods are per-user
CREATE POLICY "Users manage their own mods" ON exo_tenant_mods
  FOR ALL USING (auth.uid() = tenant_id);

-- Mod data is per-user
CREATE POLICY "Users manage their own mod data" ON exo_mod_data
  FOR ALL USING (auth.uid() = tenant_id);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_mod_data_tenant_slug ON exo_mod_data(tenant_id, mod_slug);
CREATE INDEX IF NOT EXISTS idx_mod_data_created ON exo_mod_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_mods_tenant ON exo_tenant_mods(tenant_id);

-- ============================================================================
-- INSERT 12 TEMPLATE MODS
-- ============================================================================

INSERT INTO exo_mod_registry (slug, name, description, icon, category, config, is_template) VALUES
  ('sleep-tracker', 'Sleep Tracker', 'Monitoruj sen i jakość odpoczynku', '😴', 'health', '{"fields": [{"name": "hours", "type": "number", "label": "Godziny snu"}, {"name": "quality", "type": "number", "label": "Jakość 1-10", "min": 1, "max": 10}, {"name": "notes", "type": "text", "label": "Notatki"}], "widget": "chart", "chart_type": "line"}', true),

  ('exercise-logger', 'Exercise Logger', 'Zapisuj treningi i aktywność fizyczną', '💪', 'health', '{"fields": [{"name": "activity", "type": "text", "label": "Aktywność"}, {"name": "duration_min", "type": "number", "label": "Czas (min)"}, {"name": "intensity", "type": "number", "label": "Intensywność 1-10", "min": 1, "max": 10}], "widget": "log"}', true),

  ('mood-tracker', 'Mood Tracker', 'Śledź nastrój i emocje', '🎭', 'health', '{"fields": [{"name": "mood", "type": "number", "label": "Nastrój 1-10", "min": 1, "max": 10}, {"name": "energy", "type": "number", "label": "Energia 1-10", "min": 1, "max": 10}, {"name": "notes", "type": "text", "label": "Co wpłynęło?"}], "widget": "chart", "chart_type": "line"}', true),

  ('habit-tracker', 'Habit Tracker', 'Buduj i śledź nawyki', '✅', 'productivity', '{"fields": [{"name": "habit", "type": "text", "label": "Nawyk"}, {"name": "done", "type": "boolean", "label": "Wykonane"}], "widget": "checklist"}', true),

  ('food-logger', 'Food Logger', 'Zapisuj posiłki i nawodnienie', '🍎', 'health', '{"fields": [{"name": "meal", "type": "text", "label": "Posiłek"}, {"name": "type", "type": "select", "label": "Typ", "options": ["śniadanie", "obiad", "kolacja", "przekąska"]}, {"name": "calories", "type": "number", "label": "Kalorie (opcja)"}], "widget": "log"}', true),

  ('water-tracker', 'Water Tracker', 'Śledź nawodnienie', '💧', 'health', '{"fields": [{"name": "ml", "type": "number", "label": "ml wody", "default": 250}], "widget": "counter", "daily_goal": 2000}', true),

  ('reading-log', 'Reading Log', 'Zapisuj przeczytane książki i artykuły', '📚', 'growth', '{"fields": [{"name": "title", "type": "text", "label": "Tytuł"}, {"name": "pages", "type": "number", "label": "Strony"}, {"name": "notes", "type": "text", "label": "Notatki"}], "widget": "log"}', true),

  ('finance-monitor', 'Finance Monitor', 'Śledź wydatki i przychody', '💰', 'finance', '{"fields": [{"name": "amount", "type": "number", "label": "Kwota"}, {"name": "category", "type": "text", "label": "Kategoria"}, {"name": "type", "type": "select", "label": "Typ", "options": ["wydatek", "przychód"]}], "widget": "chart", "chart_type": "bar"}', true),

  ('social-tracker', 'Social Tracker', 'Śledź kontakty społeczne', '👥', 'relationships', '{"fields": [{"name": "person", "type": "text", "label": "Osoba"}, {"name": "type", "type": "select", "label": "Typ", "options": ["spotkanie", "rozmowa", "wiadomość"]}, {"name": "notes", "type": "text", "label": "Notatki"}], "widget": "log"}', true),

  ('journal', 'Journal', 'Dziennik myśli i refleksji', '📝', 'growth', '{"fields": [{"name": "entry", "type": "textarea", "label": "Wpis"}, {"name": "mood", "type": "number", "label": "Nastrój 1-10", "min": 1, "max": 10}], "widget": "log"}', true),

  ('goal-setter', 'Goal Setter', 'Ustaw i śledź cele', '🎯', 'productivity', '{"fields": [{"name": "goal", "type": "text", "label": "Cel"}, {"name": "deadline", "type": "text", "label": "Deadline"}, {"name": "progress", "type": "number", "label": "Postęp %", "min": 0, "max": 100}], "widget": "progress"}', true),

  ('weekly-review', 'Weekly Review', 'Cotygodniowy przegląd postępów', '📊', 'productivity', '{"fields": [{"name": "wins", "type": "textarea", "label": "Sukcesy"}, {"name": "challenges", "type": "textarea", "label": "Wyzwania"}, {"name": "next_week", "type": "textarea", "label": "Plan na przyszły tydzień"}, {"name": "score", "type": "number", "label": "Ocena tygodnia 1-10", "min": 1, "max": 10}], "widget": "log"}', true)

ON CONFLICT (slug) DO NOTHING;
