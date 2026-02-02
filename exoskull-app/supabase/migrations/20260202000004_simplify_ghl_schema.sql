-- Simplify GHL Schema for Private Integration Token
--
-- With Private Integration Token, we don't need per-tenant OAuth.
-- Token is stored in env vars, not in database.

-- ============================================
-- 1. Drop OAuth States Table (not needed)
-- ============================================

-- First, unschedule the cleanup job
SELECT cron.unschedule('cleanup-ghl-oauth-states');

-- Drop the table
DROP TABLE IF EXISTS exo_ghl_oauth_states CASCADE;

-- Drop the cleanup function
DROP FUNCTION IF EXISTS cleanup_expired_ghl_oauth_states();

-- ============================================
-- 2. Simplify GHL Connections Table
-- ============================================

-- Remove OAuth token columns (no longer needed)
-- Keep location_id for tenant-location mapping

ALTER TABLE exo_ghl_connections
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  DROP COLUMN IF EXISTS token_expires_at,
  DROP COLUMN IF EXISTS scopes,
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS company_id;

-- Add comment explaining the new purpose
COMMENT ON TABLE exo_ghl_connections IS
  'Maps ExoSkull tenants to GHL locations. Auth via Private Integration Token (env vars).';

-- Drop unused helper functions
DROP FUNCTION IF EXISTS get_ghl_connection(UUID);
DROP FUNCTION IF EXISTS update_ghl_tokens(UUID, TEXT, TEXT, TEXT, INTEGER);
