-- Device tokens for push notifications (FCM for Android)
CREATE TABLE IF NOT EXISTS exo_device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, token)
);

-- Index for fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant_id
  ON exo_device_tokens(tenant_id);

-- RLS policies
ALTER TABLE exo_device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens
CREATE POLICY "Users can view own device tokens"
  ON exo_device_tokens
  FOR SELECT
  USING (auth.uid() = tenant_id);

-- Users can insert their own tokens
CREATE POLICY "Users can register device tokens"
  ON exo_device_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = tenant_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own device tokens"
  ON exo_device_tokens
  FOR DELETE
  USING (auth.uid() = tenant_id);

-- Service role can do everything (for CRON push, cleanup)
CREATE POLICY "Service role full access to device tokens"
  ON exo_device_tokens
  FOR ALL
  USING (auth.role() = 'service_role');
