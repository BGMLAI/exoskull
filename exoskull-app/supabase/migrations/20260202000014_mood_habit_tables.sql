-- =====================================================
-- MOOD TRACKER TABLES
-- =====================================================

-- Mood entries table
CREATE TABLE IF NOT EXISTS exo_mood_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
    mood_value INTEGER NOT NULL CHECK (mood_value >= 1 AND mood_value <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    notes TEXT,
    emotions TEXT[] DEFAULT '{}',
    context TEXT CHECK (context IN ('morning', 'afternoon', 'evening', 'night')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_mood_entries_tenant_logged
    ON exo_mood_entries(tenant_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_mood_entries_logged_at
    ON exo_mood_entries(logged_at DESC);

-- Enable RLS
ALTER TABLE exo_mood_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for mood entries
CREATE POLICY "mood_entries_tenant_isolation" ON exo_mood_entries
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "mood_entries_service_role" ON exo_mood_entries
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- HABIT TRACKER TABLES
-- =====================================================

-- Habits definition table
CREATE TABLE IF NOT EXISTS exo_habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
    target_days INTEGER[] DEFAULT NULL, -- 0=Sunday, 1=Monday, etc.
    reminder_time TEXT, -- HH:MM format
    icon TEXT,
    color TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_habits_tenant_active
    ON exo_habits(tenant_id, active);

-- Enable RLS
ALTER TABLE exo_habits ENABLE ROW LEVEL SECURITY;

-- RLS policies for habits
CREATE POLICY "habits_tenant_isolation" ON exo_habits
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "habits_service_role" ON exo_habits
    FOR ALL
    USING (auth.role() = 'service_role');

-- Habit completions table
CREATE TABLE IF NOT EXISTS exo_habit_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES exo_habits(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_completed
    ON exo_habit_completions(habit_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_habit_completions_tenant_completed
    ON exo_habit_completions(tenant_id, completed_at DESC);

-- Enable RLS
ALTER TABLE exo_habit_completions ENABLE ROW LEVEL SECURITY;

-- RLS policies for habit completions
CREATE POLICY "habit_completions_tenant_isolation" ON exo_habit_completions
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "habit_completions_service_role" ON exo_habit_completions
    FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================

-- Update trigger for mood entries
CREATE OR REPLACE FUNCTION update_mood_entry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mood_entries_update_timestamp
    BEFORE UPDATE ON exo_mood_entries
    FOR EACH ROW EXECUTE FUNCTION update_mood_entry_timestamp();

-- Update trigger for habits
CREATE OR REPLACE FUNCTION update_habit_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER habits_update_timestamp
    BEFORE UPDATE ON exo_habits
    FOR EACH ROW EXECUTE FUNCTION update_habit_timestamp();

-- =====================================================
-- SILVER LAYER VIEWS (for analytics)
-- =====================================================

-- Daily mood summary view
CREATE OR REPLACE VIEW silver_mood_daily AS
SELECT
    tenant_id,
    DATE(logged_at) as date,
    COUNT(*) as entries_count,
    ROUND(AVG(mood_value)::numeric, 2) as avg_mood,
    ROUND(AVG(energy_level)::numeric, 2) as avg_energy,
    MIN(mood_value) as min_mood,
    MAX(mood_value) as max_mood,
    array_agg(DISTINCT unnest) FILTER (WHERE unnest IS NOT NULL) as all_emotions
FROM exo_mood_entries,
LATERAL unnest(emotions) WITH ORDINALITY
GROUP BY tenant_id, DATE(logged_at);

-- Weekly habit completion summary
CREATE OR REPLACE VIEW silver_habits_weekly AS
SELECT
    h.tenant_id,
    h.id as habit_id,
    h.name as habit_name,
    DATE_TRUNC('week', hc.completed_at) as week_start,
    COUNT(hc.id) as completions_count,
    CASE
        WHEN h.frequency = 'daily' THEN ROUND((COUNT(hc.id)::numeric / 7) * 100, 1)
        ELSE ROUND((COUNT(hc.id)::numeric / COALESCE(array_length(h.target_days, 1), 1)) * 100, 1)
    END as completion_rate
FROM exo_habits h
LEFT JOIN exo_habit_completions hc ON h.id = hc.habit_id
WHERE h.active = true
GROUP BY h.tenant_id, h.id, h.name, h.frequency, h.target_days, DATE_TRUNC('week', hc.completed_at);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE exo_mood_entries IS 'Mood check-in entries for mood tracking mod';
COMMENT ON TABLE exo_habits IS 'Habit definitions for habit tracker mod';
COMMENT ON TABLE exo_habit_completions IS 'Habit completion log entries';
COMMENT ON VIEW silver_mood_daily IS 'Daily aggregated mood data for analytics';
COMMENT ON VIEW silver_habits_weekly IS 'Weekly habit completion rates for analytics';
