-- Email Analysis System
-- 3 tables: email accounts, analyzed emails, sender profiles

-- ================================================================
-- 1. EMAIL ACCOUNTS — per-tenant mailbox connections
-- ================================================================
CREATE TABLE IF NOT EXISTS exo_email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,

  -- Provider info
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  email_address TEXT NOT NULL,
  display_name TEXT,

  -- For gmail/outlook: link to exo_rig_connections
  rig_connection_id UUID,

  -- For IMAP: stored credentials (encrypted via AES-256-GCM)
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_user TEXT,
  imap_password_encrypted TEXT,
  imap_use_tls BOOLEAN DEFAULT true,

  -- Sync state
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_message_id TEXT,
  sync_error TEXT,
  emails_synced INTEGER DEFAULT 0,

  -- Settings
  sync_frequency TEXT DEFAULT '15min' CHECK (sync_frequency IN ('5min', '15min', '30min', '1hour')),
  analyze_sent BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_tenant_email
  ON exo_email_accounts(tenant_id, email_address);
CREATE INDEX IF NOT EXISTS idx_email_accounts_sync
  ON exo_email_accounts(sync_enabled, last_sync_at);

-- ================================================================
-- 2. ANALYZED EMAILS — core: one row per email with AI analysis
-- ================================================================
CREATE TABLE IF NOT EXISTS exo_analyzed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  account_id UUID REFERENCES exo_email_accounts(id) NOT NULL,

  -- Email identity (dedup key)
  provider_message_id TEXT NOT NULL,
  thread_id TEXT,

  -- Email content
  subject TEXT,
  from_name TEXT,
  from_email TEXT NOT NULL,
  to_emails TEXT[],
  cc_emails TEXT[],
  date_received TIMESTAMPTZ NOT NULL,
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  has_attachments BOOLEAN DEFAULT false,
  attachment_names TEXT[],

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'self')),
  is_read BOOLEAN DEFAULT false,
  is_replied BOOLEAN DEFAULT false,

  -- AI Analysis
  analysis_status TEXT DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  analyzed_at TIMESTAMPTZ,

  -- Classification
  category TEXT,
  subcategory TEXT,
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low', 'ignore')),
  priority_score INTEGER DEFAULT 50 CHECK (priority_score BETWEEN 0 AND 100),

  -- Extracted data
  action_items JSONB DEFAULT '[]',
  key_facts JSONB DEFAULT '[]',
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_by TIMESTAMPTZ,
  sentiment TEXT,

  -- Knowledge extraction
  knowledge_extracted BOOLEAN DEFAULT false,
  knowledge_chunk_ids UUID[],

  -- Task generation
  tasks_generated UUID[],

  -- Metadata
  labels TEXT[],
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analyzed_emails_dedup
  ON exo_analyzed_emails(account_id, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_analyzed_emails_tenant_date
  ON exo_analyzed_emails(tenant_id, date_received DESC);
CREATE INDEX IF NOT EXISTS idx_analyzed_emails_pending
  ON exo_analyzed_emails(analysis_status) WHERE analysis_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_analyzed_emails_priority
  ON exo_analyzed_emails(tenant_id, priority_score DESC) WHERE analysis_status = 'completed';
CREATE INDEX IF NOT EXISTS idx_analyzed_emails_follow_up
  ON exo_analyzed_emails(tenant_id, follow_up_by)
  WHERE follow_up_needed = true AND follow_up_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analyzed_emails_from
  ON exo_analyzed_emails(tenant_id, from_email);

-- ================================================================
-- 3. EMAIL SENDER PROFILES — sender patterns for prioritization
-- ================================================================
CREATE TABLE IF NOT EXISTS exo_email_sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,

  -- Relationship
  relationship TEXT DEFAULT 'unknown',
  domain TEXT,
  importance_score INTEGER DEFAULT 50 CHECK (importance_score BETWEEN 0 AND 100),

  -- Statistics
  emails_received INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  avg_response_time_hours FLOAT,
  last_email_at TIMESTAMPTZ,
  first_email_at TIMESTAMPTZ,

  -- Learned from user behavior
  user_always_reads BOOLEAN,
  user_usually_ignores BOOLEAN,
  user_replies_quickly BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email_address)
);

-- ================================================================
-- RLS Policies
-- ================================================================
ALTER TABLE exo_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_analyzed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_email_sender_profiles ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_email_accounts" ON exo_email_accounts FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_analyzed_emails" ON exo_analyzed_emails FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sender_profiles" ON exo_email_sender_profiles FOR ALL
  USING (true) WITH CHECK (true);

-- Users read own data
CREATE POLICY "users_view_own_email_accounts" ON exo_email_accounts FOR SELECT
  USING (tenant_id = auth.uid());
CREATE POLICY "users_view_own_analyzed_emails" ON exo_analyzed_emails FOR SELECT
  USING (tenant_id = auth.uid());
CREATE POLICY "users_view_own_sender_profiles" ON exo_email_sender_profiles FOR SELECT
  USING (tenant_id = auth.uid());
