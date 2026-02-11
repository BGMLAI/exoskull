-- =============================================================================
-- Email Data Lake Integration
-- Silver table + Gold materialized view for email analytics
-- =============================================================================

-- Silver Emails Table (cleaned, validated data from exo_analyzed_emails)
CREATE TABLE IF NOT EXISTS exo_silver_emails (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id),
  account_id UUID,
  provider_message_id TEXT,
  subject TEXT,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  to_emails JSONB DEFAULT '[]'::jsonb,
  cc_emails JSONB DEFAULT '[]'::jsonb,
  date_received TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT DEFAULT 'uncategorized',
  subcategory TEXT,
  priority_score INTEGER DEFAULT 0,
  sentiment TEXT DEFAULT 'neutral',
  analysis_status TEXT DEFAULT 'pending',
  action_items JSONB DEFAULT '[]'::jsonb,
  key_facts JSONB DEFAULT '[]'::jsonb,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_by TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT false,
  has_attachments BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ DEFAULT now(),
  bronze_source TEXT
);

-- Indexes for Silver emails
CREATE INDEX IF NOT EXISTS idx_silver_emails_tenant
  ON exo_silver_emails(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_emails_date
  ON exo_silver_emails(tenant_id, date_received DESC);
CREATE INDEX IF NOT EXISTS idx_silver_emails_category
  ON exo_silver_emails(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_silver_emails_priority
  ON exo_silver_emails(tenant_id, priority_score DESC);

-- RLS
ALTER TABLE exo_silver_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on silver emails"
  ON exo_silver_emails FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users read own silver emails"
  ON exo_silver_emails FOR SELECT
  USING (auth.uid() = tenant_id);

-- =============================================================================
-- Gold Email Daily Materialized View
-- Aggregates: emails per day, by category, priority distribution, response rates
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS exo_gold_email_daily AS
SELECT
  tenant_id,
  date_trunc('day', date_received)::date AS day,
  COUNT(*) AS total_emails,
  COUNT(*) FILTER (WHERE is_read = false) AS unread_count,
  COUNT(*) FILTER (WHERE priority_score >= 70) AS high_priority_count,
  COUNT(*) FILTER (WHERE follow_up_needed = true) AS follow_up_count,
  COUNT(*) FILTER (WHERE follow_up_needed = true AND follow_up_by < now()) AS overdue_follow_ups,
  COUNT(*) FILTER (WHERE has_attachments = true) AS with_attachments,
  ROUND(AVG(priority_score)::numeric, 1) AS avg_priority_score,
  -- Category breakdown
  COUNT(*) FILTER (WHERE category = 'work') AS cat_work,
  COUNT(*) FILTER (WHERE category = 'personal') AS cat_personal,
  COUNT(*) FILTER (WHERE category = 'newsletter') AS cat_newsletter,
  COUNT(*) FILTER (WHERE category = 'notification') AS cat_notification,
  COUNT(*) FILTER (WHERE category = 'finance') AS cat_finance,
  COUNT(*) FILTER (WHERE category = 'health') AS cat_health,
  COUNT(*) FILTER (WHERE category = 'social') AS cat_social,
  COUNT(*) FILTER (WHERE category = 'spam') AS cat_spam,
  -- Sentiment breakdown
  COUNT(*) FILTER (WHERE sentiment = 'positive') AS sentiment_positive,
  COUNT(*) FILTER (WHERE sentiment = 'neutral') AS sentiment_neutral,
  COUNT(*) FILTER (WHERE sentiment = 'negative') AS sentiment_negative,
  -- Action items
  COALESCE(SUM(jsonb_array_length(action_items)), 0) AS total_action_items,
  COALESCE(SUM(jsonb_array_length(key_facts)), 0) AS total_key_facts
FROM exo_silver_emails
WHERE analysis_status = 'completed'
GROUP BY tenant_id, date_trunc('day', date_received)::date;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_email_daily_unique
  ON exo_gold_email_daily(tenant_id, day);
