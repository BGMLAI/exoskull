-- GHL Integration Schema
-- Supports full GoHighLevel integration for ExoSkull

-- ============================================
-- 1. GHL OAuth Connections
-- ============================================

-- OAuth state for security
CREATE TABLE IF NOT EXISTS exo_ghl_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick state lookup
CREATE INDEX idx_ghl_oauth_states_state ON exo_ghl_oauth_states(state);
CREATE INDEX idx_ghl_oauth_states_expires ON exo_ghl_oauth_states(expires_at);

-- Auto-cleanup expired states
CREATE OR REPLACE FUNCTION cleanup_expired_ghl_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM exo_ghl_oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- GHL connections (tokens per tenant)
CREATE TABLE IF NOT EXISTS exo_ghl_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  user_id TEXT,
  company_id TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, location_id)
);

-- Index for location lookup
CREATE INDEX idx_ghl_connections_location ON exo_ghl_connections(location_id);
CREATE INDEX idx_ghl_connections_tenant ON exo_ghl_connections(tenant_id);

-- RLS for connections
ALTER TABLE exo_ghl_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own GHL connections" ON exo_ghl_connections
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');

CREATE POLICY "Service role can manage all GHL connections" ON exo_ghl_connections
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 2. GHL Contact Mapping
-- ============================================

CREATE TABLE IF NOT EXISTS exo_ghl_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  ghl_contact_id TEXT NOT NULL,
  ghl_location_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(tenant_id, ghl_contact_id)
);

-- Indexes
CREATE INDEX idx_ghl_contacts_tenant ON exo_ghl_contacts(tenant_id);
CREATE INDEX idx_ghl_contacts_ghl_id ON exo_ghl_contacts(ghl_contact_id);

-- RLS
ALTER TABLE exo_ghl_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own GHL contacts" ON exo_ghl_contacts
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');

CREATE POLICY "Service role can manage all GHL contacts" ON exo_ghl_contacts
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 3. GHL Messages Log
-- ============================================

CREATE TABLE IF NOT EXISTS exo_ghl_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE SET NULL,
  ghl_message_id TEXT,
  ghl_conversation_id TEXT,
  ghl_contact_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp', 'facebook', 'instagram', 'live_chat', 'gmb')),
  content TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_ghl_messages_tenant ON exo_ghl_messages(tenant_id);
CREATE INDEX idx_ghl_messages_direction ON exo_ghl_messages(direction);
CREATE INDEX idx_ghl_messages_channel ON exo_ghl_messages(channel);
CREATE INDEX idx_ghl_messages_created ON exo_ghl_messages(created_at);
CREATE INDEX idx_ghl_messages_contact ON exo_ghl_messages(ghl_contact_id);

-- RLS
ALTER TABLE exo_ghl_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own GHL messages" ON exo_ghl_messages
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');

CREATE POLICY "Service role can manage all GHL messages" ON exo_ghl_messages
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. GHL Webhook Log
-- ============================================

CREATE TABLE IF NOT EXISTS exo_ghl_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  location_id TEXT,
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  processing_result JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ghl_webhook_log_webhook_id ON exo_ghl_webhook_log(webhook_id);
CREATE INDEX idx_ghl_webhook_log_event_type ON exo_ghl_webhook_log(event_type);
CREATE INDEX idx_ghl_webhook_log_processed ON exo_ghl_webhook_log(processed);
CREATE INDEX idx_ghl_webhook_log_created ON exo_ghl_webhook_log(created_at);

-- Auto-cleanup old webhook logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_ghl_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM exo_ghl_webhook_log WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. GHL Social Posts Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS exo_ghl_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  ghl_post_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'tiktok', 'twitter', 'google')),
  content TEXT,
  media_urls TEXT[],
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, ghl_post_id)
);

-- Indexes
CREATE INDEX idx_ghl_social_posts_tenant ON exo_ghl_social_posts(tenant_id);
CREATE INDEX idx_ghl_social_posts_platform ON exo_ghl_social_posts(platform);
CREATE INDEX idx_ghl_social_posts_status ON exo_ghl_social_posts(status);
CREATE INDEX idx_ghl_social_posts_scheduled ON exo_ghl_social_posts(scheduled_at);

-- RLS
ALTER TABLE exo_ghl_social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own GHL social posts" ON exo_ghl_social_posts
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');

CREATE POLICY "Service role can manage all GHL social posts" ON exo_ghl_social_posts
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 6. GHL Appointments Sync
-- ============================================

CREATE TABLE IF NOT EXISTS exo_ghl_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  ghl_appointment_id TEXT NOT NULL,
  ghl_calendar_id TEXT NOT NULL,
  ghl_contact_id TEXT,
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'confirmed', 'cancelled', 'showed', 'noshow')),
  notes TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, ghl_appointment_id)
);

-- Indexes
CREATE INDEX idx_ghl_appointments_tenant ON exo_ghl_appointments(tenant_id);
CREATE INDEX idx_ghl_appointments_start ON exo_ghl_appointments(start_time);
CREATE INDEX idx_ghl_appointments_status ON exo_ghl_appointments(status);

-- RLS
ALTER TABLE exo_ghl_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own GHL appointments" ON exo_ghl_appointments
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');

CREATE POLICY "Service role can manage all GHL appointments" ON exo_ghl_appointments
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 7. Helper Functions
-- ============================================

-- Get GHL client for tenant
CREATE OR REPLACE FUNCTION get_ghl_connection(p_tenant_id UUID)
RETURNS TABLE (
  location_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.location_id,
    c.access_token,
    c.refresh_token,
    c.token_expires_at
  FROM exo_ghl_connections c
  WHERE c.tenant_id = p_tenant_id
  ORDER BY c.connected_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update GHL tokens after refresh
CREATE OR REPLACE FUNCTION update_ghl_tokens(
  p_tenant_id UUID,
  p_location_id TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_expires_in INTEGER
)
RETURNS void AS $$
BEGIN
  UPDATE exo_ghl_connections
  SET
    access_token = p_access_token,
    refresh_token = p_refresh_token,
    token_expires_at = NOW() + (p_expires_in * INTERVAL '1 second'),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND location_id = p_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get GHL message stats for tenant
CREATE OR REPLACE FUNCTION get_ghl_message_stats(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_messages BIGINT,
  inbound_count BIGINT,
  outbound_count BIGINT,
  ai_generated_count BIGINT,
  by_channel JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_messages,
    COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound_count,
    COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound_count,
    COUNT(*) FILTER (WHERE ai_generated = true) AS ai_generated_count,
    jsonb_object_agg(channel, channel_count) AS by_channel
  FROM (
    SELECT
      direction,
      ai_generated,
      channel,
      COUNT(*) AS channel_count
    FROM exo_ghl_messages
    WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - (p_days * INTERVAL '1 day')
    GROUP BY direction, ai_generated, channel
  ) sub
  GROUP BY ();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. Scheduled Cleanup Jobs
-- ============================================

-- Schedule cleanup of expired OAuth states (every hour)
-- Note: Requires pg_cron extension
SELECT cron.schedule(
  'cleanup-ghl-oauth-states',
  '0 * * * *',
  $$SELECT cleanup_expired_ghl_oauth_states()$$
);

-- Schedule cleanup of old webhook logs (daily at 3 AM)
SELECT cron.schedule(
  'cleanup-ghl-webhook-logs',
  '0 3 * * *',
  $$SELECT cleanup_old_ghl_webhook_logs()$$
);

-- ============================================
-- Grants
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON exo_ghl_oauth_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exo_ghl_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exo_ghl_contacts TO authenticated;
GRANT SELECT, INSERT ON exo_ghl_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON exo_ghl_webhook_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exo_ghl_social_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exo_ghl_appointments TO authenticated;

GRANT EXECUTE ON FUNCTION get_ghl_connection TO authenticated;
GRANT EXECUTE ON FUNCTION update_ghl_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION get_ghl_message_stats TO authenticated;
