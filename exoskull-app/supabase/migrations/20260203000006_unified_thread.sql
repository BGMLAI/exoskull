-- ============================================================================
-- UNIFIED CONVERSATION THREAD
-- Single source of truth for all IORS conversations across all channels
-- ============================================================================

-- Unified thread: 1 thread per tenant (all channels merge here)
CREATE TABLE IF NOT EXISTS exo_unified_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) UNIQUE NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_channel TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unified messages: all channels write here
CREATE TABLE IF NOT EXISTS exo_unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES exo_unified_threads(id) NOT NULL,
  tenant_id UUID REFERENCES exo_tenants(id) NOT NULL,

  -- Message content
  role TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Channel info
  channel TEXT NOT NULL,
  direction TEXT,

  -- Source tracking
  source_type TEXT,
  source_id TEXT,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_unified_messages_thread ON exo_unified_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_messages_tenant ON exo_unified_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_threads_tenant ON exo_unified_threads(tenant_id);

-- RLS
ALTER TABLE exo_unified_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_unified_messages ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access threads"
  ON exo_unified_threads FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access messages"
  ON exo_unified_messages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read own thread
CREATE POLICY "Users can view own thread"
  ON exo_unified_threads FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can view own messages"
  ON exo_unified_messages FOR SELECT
  USING (tenant_id = auth.uid());

-- ============================================================================
-- HELPER: Get or create thread for tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION get_or_create_unified_thread(p_tenant_id UUID)
RETURNS UUID AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  SELECT id INTO v_thread_id
  FROM exo_unified_threads
  WHERE tenant_id = p_tenant_id;

  IF v_thread_id IS NULL THEN
    INSERT INTO exo_unified_threads (tenant_id)
    VALUES (p_tenant_id)
    RETURNING id INTO v_thread_id;
  END IF;

  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE exo_unified_threads IS 'One conversation thread per user, merging all channels (voice, SMS, WhatsApp, email, etc.)';
COMMENT ON TABLE exo_unified_messages IS 'All messages across all channels in chronological order';
COMMENT ON COLUMN exo_unified_messages.channel IS 'voice, sms, whatsapp, email, messenger, instagram, web_chat';
COMMENT ON COLUMN exo_unified_messages.source_type IS 'voice_session, ghl_message, web_chat, intervention';
COMMENT ON COLUMN exo_unified_messages.source_id IS 'Original record ID from source system';
