-- =====================================================
-- META PAGES: Multi-page support for Messenger + WhatsApp
-- =====================================================
-- Allows multiple tenants to connect their Facebook Pages
-- and WhatsApp Business accounts. Webhook handlers look up
-- page tokens from this table instead of env vars.

CREATE TABLE IF NOT EXISTS exo_meta_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Page type: 'messenger' or 'whatsapp'
  page_type TEXT NOT NULL CHECK (page_type IN ('messenger', 'whatsapp')),

  -- Identifiers
  page_id TEXT NOT NULL,
  page_name TEXT,

  -- Access token (page-scoped for Messenger, system user for WhatsApp)
  page_access_token TEXT NOT NULL,

  -- WhatsApp-specific
  phone_number_id TEXT,
  phone_number TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Extra metadata (category, fan_count, profile_pic, etc.)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One page_id per type (a page can only be connected once across all tenants)
  UNIQUE(page_type, page_id)
);

-- RLS
ALTER TABLE exo_meta_pages ENABLE ROW LEVEL SECURITY;

-- Tenants can manage their own pages via authenticated client
CREATE POLICY "Tenants manage own pages"
  ON exo_meta_pages
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Indexes for webhook lookups (hot path: page_id -> tenant + token)
CREATE INDEX idx_meta_pages_lookup
  ON exo_meta_pages(page_type, page_id)
  WHERE is_active = true;

CREATE INDEX idx_meta_pages_whatsapp_phone
  ON exo_meta_pages(phone_number_id)
  WHERE page_type = 'whatsapp' AND is_active = true;

CREATE INDEX idx_meta_pages_tenant
  ON exo_meta_pages(tenant_id);
