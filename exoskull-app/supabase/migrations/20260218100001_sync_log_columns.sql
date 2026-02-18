-- Add missing columns to exo_rig_sync_log that the sync route expects
-- The original schema had: status, error_message, sync_type, data_range
-- The route.ts inserts: connection_id, success, error, duration_ms, metadata

ALTER TABLE exo_rig_sync_log
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES exo_rig_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for connection_id lookups
CREATE INDEX IF NOT EXISTS idx_sync_log_connection ON exo_rig_sync_log(connection_id);
