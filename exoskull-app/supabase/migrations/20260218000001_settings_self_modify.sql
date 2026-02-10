-- Settings overhaul: custom instructions, behavior presets, AI config, self-modification permissions
-- Adds user-level control over IORS behavior + two-tier permission system for autonomous changes

-- Custom instructions (free-text user instructions for IORS)
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_custom_instructions TEXT DEFAULT NULL;

-- Behavior presets (active preset keys like ["motivator", "plan_day", "monitor_health"])
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_behavior_presets JSONB DEFAULT '[]'::jsonb;

-- System prompt override (replaces PSYCODE + STATIC_SYSTEM_PROMPT when set)
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_system_prompt_override TEXT DEFAULT NULL;

-- AI config per-user: temperature, TTS speed, model preferences, two-tier permissions
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_ai_config JSONB DEFAULT '{
  "temperature": 0.7,
  "tts_speed": 1.0,
  "tts_voice_id": null,
  "model_preferences": {
    "chat": "auto",
    "analysis": "auto",
    "coding": "auto",
    "creative": "auto",
    "crisis": "auto"
  },
  "permissions": {
    "style_formality":    { "with_approval": true,  "autonomous": false },
    "style_humor":        { "with_approval": true,  "autonomous": false },
    "style_directness":   { "with_approval": true,  "autonomous": false },
    "style_empathy":      { "with_approval": true,  "autonomous": false },
    "style_detail":       { "with_approval": true,  "autonomous": false },
    "proactivity":        { "with_approval": true,  "autonomous": false },
    "loop_frequency":     { "with_approval": true,  "autonomous": false },
    "ai_budget":          { "with_approval": false, "autonomous": false },
    "temperature":        { "with_approval": true,  "autonomous": false },
    "tts_speed":          { "with_approval": true,  "autonomous": false },
    "model_chat":         { "with_approval": true,  "autonomous": false },
    "model_analysis":     { "with_approval": true,  "autonomous": false },
    "model_coding":       { "with_approval": false, "autonomous": false },
    "model_creative":     { "with_approval": true,  "autonomous": false },
    "model_crisis":       { "with_approval": false, "autonomous": false },
    "prompt_add":         { "with_approval": true,  "autonomous": false },
    "prompt_remove":      { "with_approval": false, "autonomous": false },
    "preset_toggle":      { "with_approval": true,  "autonomous": false },
    "prompt_override":    { "with_approval": false, "autonomous": false },
    "skill_propose":      { "with_approval": true,  "autonomous": false },
    "app_build":          { "with_approval": true,  "autonomous": false }
  }
}'::jsonb;

-- User override for loop evaluation interval (NULL = system decides based on activity_class)
ALTER TABLE exo_tenant_loop_config ADD COLUMN IF NOT EXISTS user_eval_interval_minutes SMALLINT DEFAULT NULL;

-- Add status + permission_key columns to system_optimizations (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_optimizations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'system_optimizations' AND column_name = 'status'
    ) THEN
      ALTER TABLE system_optimizations ADD COLUMN status TEXT DEFAULT 'applied'
        CHECK (status IN ('proposed', 'applied', 'rolled_back', 'rejected'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'system_optimizations' AND column_name = 'permission_key'
    ) THEN
      ALTER TABLE system_optimizations ADD COLUMN permission_key TEXT DEFAULT NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_system_optimizations_proposed
      ON system_optimizations (tenant_id, status) WHERE status = 'proposed';
  END IF;
END $$;
