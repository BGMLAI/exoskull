-- Migration Support Infrastructure for Tyrolka Framework Migration
-- Creates tables and feature flags needed for backward-compatible migration
-- from legacy task/goal system to Tyrolka Framework (user_loops → user_campaigns → user_quests → user_ops)

-- =========================================
-- 1. Migration Mapping Table
-- =========================================
-- Tracks legacy_id → new_id mappings for bidirectional lookup
-- Enables rollback and dual-read fallback logic

CREATE TABLE IF NOT EXISTS exo_migration_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  legacy_type TEXT NOT NULL, -- 'exo_tasks', 'exo_user_goals', 'exo_goal_checkpoints'
  legacy_id UUID NOT NULL,
  new_type TEXT NOT NULL, -- 'user_ops', 'user_quests', 'user_campaigns'
  new_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  migration_notes JSONB DEFAULT '{}', -- Additional context (e.g., field mappings, conflicts resolved)
  UNIQUE(legacy_type, legacy_id)
);

-- Index for fast lookup: legacy_id → new_id
CREATE INDEX idx_migration_map_legacy ON exo_migration_map(tenant_id, legacy_type, legacy_id);

-- Index for reverse lookup: new_id → legacy_id (for rollback)
CREATE INDEX idx_migration_map_new ON exo_migration_map(tenant_id, new_type, new_id);

-- =========================================
-- 2. Feature Flags for Gradual Rollout
-- =========================================
-- Add feature flags to exo_tenants.iors_behavior_presets JSONB column
-- These control the migration rollout phases

-- Note: Using JSONB_SET instead of ALTER COLUMN to avoid breaking existing data
-- Feature flags:
--   quest_system_enabled: Master switch (default: false)
--   quest_system_dual_write: Write to both legacy + Tyrolka (default: false)
--   quest_system_dual_read: Read Tyrolka first, fallback to legacy (default: false)
--   quest_system_ui_enabled: Show Tyrolka UI widgets (default: false)

-- Add default feature flags to all existing tenants (all disabled by default)
UPDATE exo_tenants
SET iors_behavior_presets = COALESCE(iors_behavior_presets, '{}'::jsonb) ||
  jsonb_build_object(
    'quest_system_enabled', false,
    'quest_system_dual_write', false,
    'quest_system_dual_read', false,
    'quest_system_ui_enabled', false
  )
WHERE iors_behavior_presets IS NULL OR NOT (iors_behavior_presets ? 'quest_system_enabled');

-- =========================================
-- 3. Migration Status Tracking
-- =========================================
-- Track migration progress per tenant

CREATE TABLE IF NOT EXISTS exo_migration_status (
  tenant_id UUID PRIMARY KEY REFERENCES exo_tenants(id) ON DELETE CASCADE,
  migration_started_at TIMESTAMPTZ,
  migration_completed_at TIMESTAMPTZ,
  migration_phase TEXT, -- 'not_started', 'dry_run', 'in_progress', 'completed', 'rolled_back'
  tasks_migrated INTEGER DEFAULT 0,
  goals_migrated INTEGER DEFAULT 0,
  checkpoints_migrated INTEGER DEFAULT 0,
  errors_encountered INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  migration_metadata JSONB DEFAULT '{}'
);

-- =========================================
-- 4. RLS Policies
-- =========================================

ALTER TABLE exo_migration_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_migration_status ENABLE ROW LEVEL SECURITY;

-- Migration map: Users can only see their own mappings
CREATE POLICY migration_map_tenant_isolation ON exo_migration_map
  FOR ALL
  USING (tenant_id = auth.uid());

-- Migration status: Users can only see their own status
CREATE POLICY migration_status_tenant_isolation ON exo_migration_status
  FOR ALL
  USING (tenant_id = auth.uid());

-- =========================================
-- 5. Helper Functions
-- =========================================

-- Get legacy ID from new ID (for rollback)
CREATE OR REPLACE FUNCTION get_legacy_id(p_new_type TEXT, p_new_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_legacy_id UUID;
BEGIN
  SELECT legacy_id INTO v_legacy_id
  FROM exo_migration_map
  WHERE new_type = p_new_type AND new_id = p_new_id;

  RETURN v_legacy_id;
END;
$$;

-- Get new ID from legacy ID (for dual-read)
CREATE OR REPLACE FUNCTION get_new_id(p_legacy_type TEXT, p_legacy_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  SELECT new_id INTO v_new_id
  FROM exo_migration_map
  WHERE legacy_type = p_legacy_type AND legacy_id = p_legacy_id;

  RETURN v_new_id;
END;
$$;

-- Check if tenant has quest system enabled
CREATE OR REPLACE FUNCTION is_quest_system_enabled(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT COALESCE((iors_behavior_presets->>'quest_system_enabled')::boolean, false)
  INTO v_enabled
  FROM exo_tenants
  WHERE id = p_tenant_id;

  RETURN COALESCE(v_enabled, false);
END;
$$;

-- =========================================
-- NOTES FOR FUTURE AGENTS
-- =========================================
-- 1. DO NOT drop legacy tables (exo_tasks, exo_user_goals, exo_goal_checkpoints) until 90 days after migration
-- 2. Dual-write pattern ensures zero data loss during transition
-- 3. exo_migration_map enables instant rollback if issues discovered
-- 4. Feature flags allow gradual rollout: 10% → 50% → 100%
-- 5. After 90 days, run deprecation migration to clean up legacy tables
