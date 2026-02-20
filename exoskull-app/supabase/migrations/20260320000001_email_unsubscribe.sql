-- Email Unsubscribe Support
-- Adds List-Unsubscribe header tracking and sender opt-out management

-- ================================================================
-- 1. Add unsubscribe columns to analyzed emails
-- ================================================================
ALTER TABLE exo_analyzed_emails
  ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT,
  ADD COLUMN IF NOT EXISTS list_unsubscribe_post TEXT,
  ADD COLUMN IF NOT EXISTS is_newsletter BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_analyzed_emails_newsletter
  ON exo_analyzed_emails(tenant_id, from_email)
  WHERE is_newsletter = true;

-- ================================================================
-- 2. Add unsubscribe tracking to sender profiles
-- ================================================================
ALTER TABLE exo_email_sender_profiles
  ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribe_url TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_newsletter BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sender_profiles_newsletter
  ON exo_email_sender_profiles(tenant_id)
  WHERE is_newsletter = true;

CREATE INDEX IF NOT EXISTS idx_sender_profiles_unsubscribed
  ON exo_email_sender_profiles(tenant_id)
  WHERE is_unsubscribed = true;
