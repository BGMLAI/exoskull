-- Move Silver Layer tables from silver schema to public schema
-- Using exo_silver_ prefix for consistency with existing exo_ tables
-- This is needed because Supabase PostgREST doesn't expose custom schemas by default

-- =============================================================================
-- DROP SILVER SCHEMA TABLES (if exist)
-- =============================================================================

DROP TABLE IF EXISTS silver.sync_log CASCADE;
DROP TABLE IF EXISTS silver.conversations_clean CASCADE;
DROP TABLE IF EXISTS silver.messages_clean CASCADE;
DROP TABLE IF EXISTS silver.voice_calls_clean CASCADE;
DROP TABLE IF EXISTS silver.sms_logs_clean CASCADE;
DROP SCHEMA IF EXISTS silver CASCADE;

-- =============================================================================
-- CONVERSATIONS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exo_silver_conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  summary TEXT,
  context JSONB DEFAULT '{}',
  insights JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  bronze_source TEXT,
  CONSTRAINT valid_silver_channel CHECK (channel IN ('voice', 'sms', 'web', 'api'))
);

CREATE INDEX IF NOT EXISTS idx_exo_silver_conv_tenant ON public.exo_silver_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_conv_started ON public.exo_silver_conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exo_silver_conv_channel ON public.exo_silver_conversations(channel);

-- =============================================================================
-- MESSAGES (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exo_silver_messages (
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
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_silver_role CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_exo_silver_msg_conv ON public.exo_silver_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_msg_tenant ON public.exo_silver_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_msg_timestamp ON public.exo_silver_messages(timestamp DESC);

-- =============================================================================
-- VOICE CALLS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exo_silver_voice_calls (
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
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_silver_call_direction CHECK (direction IN ('inbound', 'outbound'))
);

CREATE INDEX IF NOT EXISTS idx_exo_silver_calls_tenant ON public.exo_silver_voice_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_calls_started ON public.exo_silver_voice_calls(started_at DESC);

-- =============================================================================
-- SMS LOGS (CLEANED)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exo_silver_sms_logs (
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
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_silver_sms_direction CHECK (direction IN ('inbound', 'outbound'))
);

CREATE INDEX IF NOT EXISTS idx_exo_silver_sms_tenant ON public.exo_silver_sms_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_sms_sent ON public.exo_silver_sms_logs(sent_at DESC);

-- =============================================================================
-- SYNC LOG (ETL TRACKING)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.exo_silver_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  bronze_files_processed TEXT[] DEFAULT '{}',
  errors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_exo_silver_tenant_data_type UNIQUE(tenant_id, data_type)
);

CREATE INDEX IF NOT EXISTS idx_exo_silver_sync_tenant ON public.exo_silver_sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_silver_sync_type ON public.exo_silver_sync_log(data_type);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.exo_silver_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exo_silver_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exo_silver_voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exo_silver_sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exo_silver_sync_log ENABLE ROW LEVEL SECURITY;

-- Service role full access (RLS bypass via service_role)
DROP POLICY IF EXISTS "Service role access exo_silver_conversations" ON public.exo_silver_conversations;
CREATE POLICY "Service role access exo_silver_conversations" ON public.exo_silver_conversations
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access exo_silver_messages" ON public.exo_silver_messages;
CREATE POLICY "Service role access exo_silver_messages" ON public.exo_silver_messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access exo_silver_voice_calls" ON public.exo_silver_voice_calls;
CREATE POLICY "Service role access exo_silver_voice_calls" ON public.exo_silver_voice_calls
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access exo_silver_sms_logs" ON public.exo_silver_sms_logs;
CREATE POLICY "Service role access exo_silver_sms_logs" ON public.exo_silver_sms_logs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access exo_silver_sync_log" ON public.exo_silver_sync_log;
CREATE POLICY "Service role access exo_silver_sync_log" ON public.exo_silver_sync_log
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.exo_silver_conversations IS 'Silver layer: cleaned conversation records with validated timestamps and JSONB context';
COMMENT ON TABLE public.exo_silver_messages IS 'Silver layer: cleaned message records with proper role constraints';
COMMENT ON TABLE public.exo_silver_voice_calls IS 'Silver layer: cleaned voice call records with metadata as JSONB';
COMMENT ON TABLE public.exo_silver_sms_logs IS 'Silver layer: cleaned SMS log records';
COMMENT ON TABLE public.exo_silver_sync_log IS 'Silver ETL: tracks sync progress per tenant and data type';
