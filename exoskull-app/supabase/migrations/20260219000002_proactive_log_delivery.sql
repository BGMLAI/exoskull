-- Add delivery tracking columns to exo_proactive_log
-- Enables feedback loop: know if proactive messages were actually delivered

ALTER TABLE exo_proactive_log
  ADD COLUMN IF NOT EXISTS message_sid TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT;

-- Index for Twilio status webhook lookups
CREATE INDEX IF NOT EXISTS idx_proactive_log_sid
  ON exo_proactive_log(message_sid)
  WHERE message_sid IS NOT NULL;
