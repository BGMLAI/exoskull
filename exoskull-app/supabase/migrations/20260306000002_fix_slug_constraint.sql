-- Fix: Convert partial unique index on slug to proper UNIQUE constraint
-- (Partial indexes don't support ON CONFLICT for upsert operations)

-- Drop the partial index
DROP INDEX IF EXISTS idx_exo_agents_slug;

-- Add proper UNIQUE constraint (allows ON CONFLICT)
ALTER TABLE exo_agents ADD CONSTRAINT exo_agents_slug_unique UNIQUE (slug);

-- Also add name unique constraint if not exists (for upsert safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exo_agents_name_key' AND conrelid = 'exo_agents'::regclass
  ) THEN
    ALTER TABLE exo_agents ADD CONSTRAINT exo_agents_name_key UNIQUE (name);
  END IF;
END $$;
