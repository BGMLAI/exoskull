-- ============================================================================
-- LOOP ASPECTS - Add aspects column to user_loops
-- ============================================================================
-- Allows users to define 3 specific aspects per loop during onboarding
-- e.g. Health loop → ["sleep quality", "exercise", "diet"]
-- ============================================================================

ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS aspects JSONB DEFAULT '[]';
COMMENT ON COLUMN user_loops.aspects IS 'Array of user-defined aspects for this loop, e.g. ["sleep quality", "exercise", "diet"]';
