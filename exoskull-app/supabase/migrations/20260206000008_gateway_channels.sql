-- ============================================================================
-- Unified Message Gateway — Channel IDs + Preferred Channel
--
-- Adds Telegram, Slack, Discord channel identifiers to exo_tenants
-- and a preferred_channel column for multi-channel dispatch.
-- ============================================================================

-- Add channel-specific identifiers
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS preferred_channel TEXT DEFAULT 'whatsapp';

-- Create indexes for fast tenant lookup by channel ID
CREATE INDEX IF NOT EXISTS idx_tenants_telegram_chat_id ON exo_tenants (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_slack_user_id ON exo_tenants (slack_user_id) WHERE slack_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_discord_user_id ON exo_tenants (discord_user_id) WHERE discord_user_id IS NOT NULL;

-- Extend unified_messages channel check to include new channels
-- (Only if check constraint exists — some setups use enum, some use text)
DO $$
BEGIN
  -- Try to drop existing check constraint if it exists
  ALTER TABLE exo_unified_messages DROP CONSTRAINT IF EXISTS exo_unified_messages_channel_check;

  -- Add updated check constraint with new channels
  ALTER TABLE exo_unified_messages ADD CONSTRAINT exo_unified_messages_channel_check
    CHECK (channel IN ('voice', 'sms', 'whatsapp', 'email', 'messenger', 'instagram', 'web_chat', 'telegram', 'slack', 'discord'));
EXCEPTION
  WHEN others THEN
    -- Constraint might not exist or column might be plain text — that's fine
    RAISE NOTICE 'Channel check constraint update skipped: %', SQLERRM;
END;
$$;

-- Extend unified_threads last_channel to support new channels
DO $$
BEGIN
  ALTER TABLE exo_unified_threads DROP CONSTRAINT IF EXISTS exo_unified_threads_last_channel_check;
  ALTER TABLE exo_unified_threads ADD CONSTRAINT exo_unified_threads_last_channel_check
    CHECK (last_channel IN ('voice', 'sms', 'whatsapp', 'email', 'messenger', 'instagram', 'web_chat', 'telegram', 'slack', 'discord'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Thread channel check constraint update skipped: %', SQLERRM;
END;
$$;

-- Add comment for documentation
COMMENT ON COLUMN exo_tenants.telegram_chat_id IS 'Telegram chat ID for this tenant (from Telegram Bot API)';
COMMENT ON COLUMN exo_tenants.slack_user_id IS 'Slack user ID for this tenant (from Slack Events API)';
COMMENT ON COLUMN exo_tenants.discord_user_id IS 'Discord user ID for this tenant (from Discord Bot)';
COMMENT ON COLUMN exo_tenants.preferred_channel IS 'User preferred communication channel: whatsapp, telegram, slack, discord, sms, voice, email';
