-- v4 Autonomy Sprint: Add missing columns for full autonomy score
-- Safe: all use IF NOT EXISTS / IF EXISTS patterns

-- user_ops.metadata — needed for E2E S2 (task creation with metadata)
DO $$ BEGIN
  ALTER TABLE user_ops ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- exo_user_documents.metadata — needed for knowledge retrieval enrichment
DO $$ BEGIN
  ALTER TABLE exo_user_documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- exo_tenants.metadata — ensure tau_matrix and budget can be stored
-- (metadata column likely exists, but ensure it's JSONB with default)
DO $$ BEGIN
  ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
