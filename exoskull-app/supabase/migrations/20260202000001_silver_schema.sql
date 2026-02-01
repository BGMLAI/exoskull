-- Silver Layer Schema
-- Cleaned, validated, enriched data from Bronze layer
-- Updated hourly via Edge Function

-- =============================================================================
-- SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS silver;

-- =============================================================================
-- CONVERSATIONS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS silver.conversations_clean (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  summary TEXT,
  context JSONB DEFAULT '{}',
  insights JSONB DEFAULT '[]',

  -- Silver layer metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  bronze_source TEXT,  -- R2 path reference

  -- Constraints
  CONSTRAINT valid_channel CHECK (channel IN ('voice', 'sms', 'web', 'api'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_silver_conv_tenant ON silver.conversations_clean(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_conv_started ON silver.conversations_clean(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_silver_conv_channel ON silver.conversations_clean(channel);
CREATE INDEX IF NOT EXISTS idx_silver_conv_tenant_started ON silver.conversations_clean(tenant_id, started_at DESC);

-- =============================================================================
-- MESSAGES (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS silver.messages_clean (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  audio_url TEXT,
  transcription_confidence REAL,
  context JSONB DEFAULT '{}',

  -- Silver layer metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_silver_msg_conv ON silver.messages_clean(conversation_id);
CREATE INDEX IF NOT EXISTS idx_silver_msg_tenant ON silver.messages_clean(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_msg_timestamp ON silver.messages_clean(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_silver_msg_conv_timestamp ON silver.messages_clean(conversation_id, timestamp);

-- =============================================================================
-- VOICE CALLS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS silver.voice_calls_clean (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  vapi_call_id TEXT,
  phone_number TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT,
  audio_url TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',

  -- Silver layer metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_silver_calls_tenant ON silver.voice_calls_clean(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_calls_started ON silver.voice_calls_clean(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_silver_calls_phone ON silver.voice_calls_clean(phone_number);

-- =============================================================================
-- SMS LOGS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS silver.sms_logs_clean (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  twilio_message_sid TEXT,
  direction TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- Silver layer metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_sms_direction CHECK (direction IN ('inbound', 'outbound'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_silver_sms_tenant ON silver.sms_logs_clean(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_sms_sent ON silver.sms_logs_clean(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_silver_sms_from ON silver.sms_logs_clean(from_number);
CREATE INDEX IF NOT EXISTS idx_silver_sms_to ON silver.sms_logs_clean(to_number);

-- =============================================================================
-- SYNC LOG (ETL TRACKING)
-- =============================================================================

CREATE TABLE IF NOT EXISTS silver.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  bronze_files_processed TEXT[] DEFAULT '{}',
  errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per tenant + data type
  CONSTRAINT unique_silver_tenant_data_type UNIQUE(tenant_id, data_type)
);

-- Index for sync queries
CREATE INDEX IF NOT EXISTS idx_silver_sync_tenant ON silver.sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_silver_sync_type ON silver.sync_log(data_type);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE silver.conversations_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.messages_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.voice_calls_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.sms_logs_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.sync_log ENABLE ROW LEVEL SECURITY;

-- Service role can access all data (for ETL)
CREATE POLICY "Service role full access to silver.conversations_clean" ON silver.conversations_clean
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to silver.messages_clean" ON silver.messages_clean
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to silver.voice_calls_clean" ON silver.voice_calls_clean
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to silver.sms_logs_clean" ON silver.sms_logs_clean
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to silver.sync_log" ON silver.sync_log
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON SCHEMA silver IS 'Cleaned, validated data from Bronze layer. Updated hourly.';
COMMENT ON TABLE silver.conversations_clean IS 'Cleaned conversation records with validated timestamps and JSONB context';
COMMENT ON TABLE silver.messages_clean IS 'Cleaned message records with proper role constraints';
COMMENT ON TABLE silver.voice_calls_clean IS 'Cleaned voice call records with metadata as JSONB';
COMMENT ON TABLE silver.sms_logs_clean IS 'Cleaned SMS log records';
COMMENT ON TABLE silver.sync_log IS 'Tracks ETL progress per tenant and data type';
