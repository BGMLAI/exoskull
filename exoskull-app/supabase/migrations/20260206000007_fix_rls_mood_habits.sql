-- =====================================================
-- FIX RLS: Standardize mood/habit tables to auth.uid()
--
-- These 3 tables used current_setting('app.tenant_id')
-- which is non-standard and requires manual GUC setup.
-- All other tables use auth.uid() — standardize here.
-- =====================================================

-- 1. exo_mood_entries
DROP POLICY IF EXISTS "mood_entries_tenant_isolation" ON exo_mood_entries;
CREATE POLICY "mood_entries_tenant_isolation" ON exo_mood_entries
    FOR ALL
    USING (tenant_id = auth.uid());

-- 2. exo_habits
DROP POLICY IF EXISTS "habits_tenant_isolation" ON exo_habits;
CREATE POLICY "habits_tenant_isolation" ON exo_habits
    FOR ALL
    USING (tenant_id = auth.uid());

-- 3. exo_habit_completions
DROP POLICY IF EXISTS "habit_completions_tenant_isolation" ON exo_habit_completions;
CREATE POLICY "habit_completions_tenant_isolation" ON exo_habit_completions
    FOR ALL
    USING (tenant_id = auth.uid());
