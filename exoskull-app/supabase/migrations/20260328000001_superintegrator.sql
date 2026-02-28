-- ============================================================================
-- AI Superintegrator — Dynamic Service Connections
-- ============================================================================
-- Stores credentials (encrypted) for ANY service connected via the agent.
-- Supports OAuth2, API key, and webhook auth methods.

CREATE TABLE IF NOT EXISTS exo_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,           -- Human-readable name (e.g. "Stripe")
  service_slug TEXT NOT NULL,           -- snake_case identifier (e.g. "stripe")
  auth_method TEXT NOT NULL CHECK (auth_method IN ('oauth2', 'api_key', 'webhook')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'expired')),
  credentials_encrypted TEXT,           -- AES-256 encrypted JSON (tokens, keys)
  oauth_config JSONB,                   -- OAuth2 flow config (authorization_url, token_url, state, etc.)
  api_base_url TEXT,                    -- Base URL for API calls
  webhook_url TEXT,                     -- Generated webhook URL (for webhook auth)
  metadata JSONB NOT NULL DEFAULT '{}', -- Extra data (webhook_id, error details, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, service_slug)
);

CREATE INDEX idx_integrations_tenant ON exo_integrations(tenant_id);
CREATE INDEX idx_integrations_status ON exo_integrations(tenant_id, status);
CREATE INDEX idx_integrations_slug ON exo_integrations(tenant_id, service_slug);

ALTER TABLE exo_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations" ON exo_integrations
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service can manage integrations" ON exo_integrations
  FOR ALL USING (true) WITH CHECK (true);

-- Also add 'self_build' to exo_dev_journal entry_type CHECK constraint
-- (it was added in code but not in the migration)
ALTER TABLE exo_dev_journal DROP CONSTRAINT IF EXISTS exo_dev_journal_entry_type_check;
ALTER TABLE exo_dev_journal ADD CONSTRAINT exo_dev_journal_entry_type_check
  CHECK (entry_type IN ('build', 'fix', 'learning', 'plan', 'observation', 'self_build'));
