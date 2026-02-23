-- Prevent duplicate email ingestion into unified messages.
-- The application-level dedup (isEmailAlreadyIngested) silently fails on query errors,
-- causing the same emails to be re-inserted every 30-minute rig-sync cycle.
-- This unique index provides DB-level protection as a safety net.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_messages_email_dedup
  ON exo_unified_messages (tenant_id, channel, source_id)
  WHERE source_id IS NOT NULL AND channel = 'email';

-- Also add a general index on source_id for faster dedup lookups
CREATE INDEX IF NOT EXISTS idx_unified_messages_source_id
  ON exo_unified_messages (source_id)
  WHERE source_id IS NOT NULL;

-- Clean up existing duplicates before constraint takes effect.
-- Keep the oldest row per (tenant_id, channel, source_id), delete the rest.
DELETE FROM exo_unified_messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY tenant_id, channel, source_id
             ORDER BY created_at ASC
           ) AS rn
    FROM exo_unified_messages
    WHERE source_id IS NOT NULL AND channel = 'email'
  ) sub
  WHERE rn > 1
);
