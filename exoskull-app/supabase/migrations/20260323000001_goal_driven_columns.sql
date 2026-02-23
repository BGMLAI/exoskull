-- Goal-Driven Architecture: Add trajectory + last_checkpoint_at to goals
-- Phase 1: Goal Feedback Loops

-- Add trajectory column to exo_user_goals (mirrors checkpoint trajectory for quick access)
ALTER TABLE exo_user_goals ADD COLUMN IF NOT EXISTS trajectory TEXT DEFAULT 'unknown';

-- Add last_checkpoint_at for quick "stale goal" detection
ALTER TABLE exo_user_goals ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

-- Allow 'unknown' trajectory in checkpoints (null data collection)
-- The existing constraint on exo_goal_checkpoints.trajectory already allows free text,
-- so no constraint change needed. Just ensuring the value is recognized in code.

-- Index for quick "off-track goals" queries
CREATE INDEX IF NOT EXISTS idx_user_goals_trajectory ON exo_user_goals(tenant_id, trajectory) WHERE is_active = true;
