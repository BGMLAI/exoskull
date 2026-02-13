-- ============================================================================
-- THREAD BRANCHING: Add reply_to_id to unified messages
-- Enables message replies / quoted messages in the unified stream
-- ============================================================================

-- Add reply_to_id column (self-referencing FK)
ALTER TABLE exo_unified_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES exo_unified_messages(id);

-- Index for fast lookup of replies to a message
CREATE INDEX IF NOT EXISTS idx_unified_messages_reply_to
  ON exo_unified_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

COMMENT ON COLUMN exo_unified_messages.reply_to_id IS 'Self-referencing FK for thread branching — the message this is replying to';
