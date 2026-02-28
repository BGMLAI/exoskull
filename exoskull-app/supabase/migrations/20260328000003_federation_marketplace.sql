-- ============================================================================
-- FEDERATION TABLES
-- ============================================================================

-- Federation peers (opt-in directory of ExoSkull instances)
CREATE TABLE IF NOT EXISTS exo_federation_peers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  shared_skills TEXT[] NOT NULL DEFAULT '{}',
  location GEOGRAPHY(POINT, 4326),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_peers_status ON exo_federation_peers(status);
CREATE INDEX IF NOT EXISTS idx_federation_peers_capabilities ON exo_federation_peers USING GIN(capabilities);

ALTER TABLE exo_federation_peers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_federation_peers" ON exo_federation_peers FOR ALL USING (tenant_id = auth.uid());

-- Federation connections (handshakes between peers)
CREATE TABLE IF NOT EXISTS exo_federation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  to_peer_id UUID NOT NULL REFERENCES exo_federation_peers(id) ON DELETE CASCADE,
  shared_secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'expired', 'revoked')),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_tenant_id, to_peer_id)
);

CREATE INDEX IF NOT EXISTS idx_federation_connections_status ON exo_federation_connections(status);

ALTER TABLE exo_federation_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_federation_connections" ON exo_federation_connections
  FOR ALL USING (from_tenant_id = auth.uid());

-- Federation delegated tasks
CREATE TABLE IF NOT EXISTS exo_federation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES exo_federation_connections(id) ON DELETE CASCADE,
  from_tenant_id UUID NOT NULL,
  to_peer_id UUID NOT NULL,
  description TEXT NOT NULL,
  required_capabilities TEXT[] NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}',
  max_time_ms INTEGER NOT NULL DEFAULT 60000,
  reward JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'running', 'completed', 'failed', 'timeout')),
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE exo_federation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_federation_tasks" ON exo_federation_tasks
  FOR ALL USING (from_tenant_id = auth.uid());

-- ============================================================================
-- MARKETPLACE TABLES
-- ============================================================================

-- Marketplace listings (published skills)
CREATE TABLE IF NOT EXISTS exo_marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  creator_name TEXT NOT NULL DEFAULT 'Anonymous',
  skill_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  pricing_model TEXT NOT NULL DEFAULT 'free' CHECK (pricing_model IN ('free', 'premium', 'subscription')),
  price_amount_pln NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected', 'archived')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  downloads INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(2, 1) NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON exo_marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON exo_marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_creator ON exo_marketplace_listings(creator_tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_downloads ON exo_marketplace_listings(downloads DESC);

ALTER TABLE exo_marketplace_listings ENABLE ROW LEVEL SECURITY;
-- Published listings are publicly readable
CREATE POLICY "marketplace_public_read" ON exo_marketplace_listings
  FOR SELECT USING (status = 'published');
CREATE POLICY "marketplace_creator_all" ON exo_marketplace_listings
  FOR ALL USING (creator_tenant_id = auth.uid());

-- Marketplace downloads
CREATE TABLE IF NOT EXISTS exo_marketplace_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES exo_marketplace_listings(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  skill_id UUID,
  price_paid_pln NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_downloads_tenant ON exo_marketplace_downloads(tenant_id);

ALTER TABLE exo_marketplace_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_marketplace_downloads" ON exo_marketplace_downloads
  FOR ALL USING (tenant_id = auth.uid());

-- Marketplace reviews
CREATE TABLE IF NOT EXISTS exo_marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES exo_marketplace_listings(id) ON DELETE CASCADE,
  reviewer_tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL DEFAULT 'Anonymous',
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, reviewer_tenant_id)
);

ALTER TABLE exo_marketplace_reviews ENABLE ROW LEVEL SECURITY;
-- Reviews are publicly readable
CREATE POLICY "marketplace_reviews_public_read" ON exo_marketplace_reviews
  FOR SELECT USING (true);
CREATE POLICY "marketplace_reviews_own" ON exo_marketplace_reviews
  FOR ALL USING (reviewer_tenant_id = auth.uid());

-- ============================================================================
-- MARKETPLACE CREATORS (Stripe Connect)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_marketplace_creators (
  tenant_id UUID PRIMARY KEY REFERENCES exo_tenants(id) ON DELETE CASCADE,
  stripe_connect_id TEXT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  total_earned_pln NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_paid_out_pln NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pending_payout_pln NUMERIC(10, 2) NOT NULL DEFAULT 0,
  last_payout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE exo_marketplace_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_marketplace_creators" ON exo_marketplace_creators
  FOR ALL USING (tenant_id = auth.uid());

-- Royalty payments
CREATE TABLE IF NOT EXISTS exo_marketplace_royalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES exo_marketplace_listings(id) ON DELETE CASCADE,
  download_id UUID NOT NULL,
  gross_amount_pln NUMERIC(10, 2) NOT NULL,
  creator_share_pln NUMERIC(10, 2) NOT NULL,
  platform_share_pln NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_transfer_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_royalties_creator ON exo_marketplace_royalties(creator_tenant_id, status);

ALTER TABLE exo_marketplace_royalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_marketplace_royalties" ON exo_marketplace_royalties
  FOR ALL USING (creator_tenant_id = auth.uid());

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Increment download counter atomically
CREATE OR REPLACE FUNCTION increment_marketplace_downloads(p_listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE exo_marketplace_listings
  SET downloads = downloads + 1, updated_at = now()
  WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment creator pending payout atomically
CREATE OR REPLACE FUNCTION increment_creator_pending(p_tenant_id UUID, p_amount NUMERIC)
RETURNS void AS $$
BEGIN
  UPDATE exo_marketplace_creators
  SET
    pending_payout_pln = pending_payout_pln + p_amount,
    total_earned_pln = total_earned_pln + p_amount
  WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
