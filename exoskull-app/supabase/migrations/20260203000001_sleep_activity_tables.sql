-- =====================================================
-- SLEEP & ACTIVITY TABLES
-- For manual tracking when rigs (Oura, Google Fit) not connected
-- =====================================================

-- =====================================================
-- SLEEP ENTRIES
-- =====================================================

CREATE TABLE IF NOT EXISTS exo_sleep_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'oura', 'health-connect', 'apple-health'
  external_id TEXT, -- ID from external source for deduplication

  -- Sleep timing
  sleep_start TIMESTAMPTZ NOT NULL,
  sleep_end TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (sleep_end - sleep_start)) / 60
  ) STORED,

  -- Quality metrics
  quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 10),
  efficiency INTEGER CHECK (efficiency >= 0 AND efficiency <= 100), -- percentage

  -- Sleep stages (in minutes)
  deep_sleep_minutes INTEGER,
  rem_sleep_minutes INTEGER,
  light_sleep_minutes INTEGER,
  awake_minutes INTEGER,

  -- Physiological data
  hrv_average NUMERIC,
  resting_hr INTEGER,
  breath_average NUMERIC,

  -- User input
  notes TEXT,
  tags TEXT[], -- ['restless', 'dreams', 'snoring', etc.]

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates from same source
  UNIQUE (tenant_id, source, external_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_sleep_entries_tenant_date
  ON exo_sleep_entries(tenant_id, sleep_start DESC);

CREATE INDEX IF NOT EXISTS idx_sleep_entries_source
  ON exo_sleep_entries(tenant_id, source);

-- =====================================================
-- ACTIVITY ENTRIES
-- =====================================================

CREATE TABLE IF NOT EXISTS exo_activity_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'oura', 'google-fit', 'health-connect', 'strava'
  external_id TEXT, -- ID from external source for deduplication

  -- Activity type
  activity_type TEXT NOT NULL, -- 'walking', 'running', 'cycling', 'workout', 'swimming', 'yoga', etc.
  activity_subtype TEXT, -- 'strength', 'cardio', 'flexibility', etc.

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,

  -- Metrics
  calories_burned INTEGER,
  distance_meters NUMERIC,
  steps INTEGER,
  elevation_gain_meters NUMERIC,

  -- Intensity
  intensity TEXT CHECK (intensity IN ('easy', 'moderate', 'hard', 'very_hard')),
  average_hr INTEGER,
  max_hr INTEGER,

  -- Location
  location_name TEXT, -- 'gym', 'park', 'home', etc.
  latitude NUMERIC,
  longitude NUMERIC,

  -- User input
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5), -- How did it feel?

  -- Raw data storage
  metadata JSONB DEFAULT '{}', -- Store any additional data from source

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates from same source
  UNIQUE (tenant_id, source, external_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_activity_entries_tenant_date
  ON exo_activity_entries(tenant_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_activity_entries_type
  ON exo_activity_entries(tenant_id, activity_type);

CREATE INDEX IF NOT EXISTS idx_activity_entries_source
  ON exo_activity_entries(tenant_id, source);

-- =====================================================
-- USER GOALS
-- =====================================================

CREATE TABLE IF NOT EXISTS exo_health_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Goal type
  goal_type TEXT NOT NULL, -- 'sleep_duration', 'sleep_quality', 'steps', 'active_minutes', 'workouts_per_week'

  -- Target values
  target_value NUMERIC NOT NULL,
  target_unit TEXT NOT NULL, -- 'minutes', 'hours', 'steps', 'count', 'score'

  -- Time frame
  frequency TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, goal_type)
);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Sleep entries
ALTER TABLE exo_sleep_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sleep entries"
  ON exo_sleep_entries FOR SELECT
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own sleep entries"
  ON exo_sleep_entries FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own sleep entries"
  ON exo_sleep_entries FOR UPDATE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own sleep entries"
  ON exo_sleep_entries FOR DELETE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

-- Activity entries
ALTER TABLE exo_activity_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity entries"
  ON exo_activity_entries FOR SELECT
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own activity entries"
  ON exo_activity_entries FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own activity entries"
  ON exo_activity_entries FOR UPDATE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own activity entries"
  ON exo_activity_entries FOR DELETE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

-- Health goals
ALTER TABLE exo_health_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health goals"
  ON exo_health_goals FOR SELECT
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own health goals"
  ON exo_health_goals FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own health goals"
  ON exo_health_goals FOR UPDATE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE id = auth.uid()
  ));

-- =====================================================
-- TRIGGER: Update updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sleep_entries_updated_at
  BEFORE UPDATE ON exo_sleep_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_entries_updated_at
  BEFORE UPDATE ON exo_activity_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_goals_updated_at
  BEFORE UPDATE ON exo_health_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
