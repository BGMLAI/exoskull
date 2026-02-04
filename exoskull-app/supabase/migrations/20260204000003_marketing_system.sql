-- ============================================================================
-- MARKETING SYSTEM
-- ============================================================================
-- Referral program, engagement scoring, campaign tracking.
-- Part of GAP 2: Marketing Functionalities
-- ============================================================================

-- ============================================================================
-- 1. EXTEND exo_tenants WITH REFERRAL COLUMNS
-- ============================================================================

ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES exo_tenants(id);

-- ============================================================================
-- 2. REFERRAL TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  referred_email TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'signed_up', 'activated', 'converted', 'rewarded'
  )),
  referred_tenant_id UUID REFERENCES exo_tenants(id),
  reward_type TEXT CHECK (reward_type IN ('credits', 'month_free', 'feature_unlock')),
  reward_amount DECIMAL(10,2),
  reward_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_referrer ON exo_referrals(referrer_id);
CREATE INDEX idx_referrals_code ON exo_referrals(referral_code);
CREATE INDEX idx_referrals_status ON exo_referrals(status);

-- ============================================================================
-- 3. ENGAGEMENT SCORING (daily per-tenant)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_engagement_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Component scores (0-100)
  conversation_score INT DEFAULT 0,
  task_score INT DEFAULT 0,
  health_score INT DEFAULT 0,
  mod_usage_score INT DEFAULT 0,
  voice_score INT DEFAULT 0,

  -- Aggregate
  total_score INT DEFAULT 0,
  engagement_level TEXT CHECK (engagement_level IN (
    'dormant', 'low', 'medium', 'high', 'power_user'
  )),

  -- Churn risk
  churn_risk DECIMAL(3,2) DEFAULT 0 CHECK (churn_risk >= 0 AND churn_risk <= 1),
  days_since_last_interaction INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX idx_engagement_tenant ON exo_engagement_scores(tenant_id, date DESC);
CREATE INDEX idx_engagement_churn ON exo_engagement_scores(churn_risk DESC)
  WHERE churn_risk > 0.5;

-- ============================================================================
-- 4. CAMPAIGN TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN (
    'onboarding_drip', 'reengagement', 'feature_announcement',
    'referral_invite', 'churn_prevention', 'upsell'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  template_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  unsubscribed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_campaign_sends_tenant ON exo_campaign_sends(tenant_id);
CREATE INDEX idx_campaign_sends_type ON exo_campaign_sends(campaign_type, sent_at DESC);

-- ============================================================================
-- 5. DRIP SEQUENCE STATE
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_drip_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  sequence_name TEXT NOT NULL,
  current_step INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  paused BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, sequence_name)
);

CREATE INDEX idx_drip_state_next ON exo_drip_state(next_send_at)
  WHERE completed = FALSE AND paused = FALSE;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE exo_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_engagement_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_drip_state ENABLE ROW LEVEL SECURITY;

-- Referrals
CREATE POLICY "Users can view own referrals"
  ON exo_referrals FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Service role full access referrals"
  ON exo_referrals FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Engagement scores
CREATE POLICY "Users can view own engagement"
  ON exo_engagement_scores FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access engagement"
  ON exo_engagement_scores FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Campaign sends
CREATE POLICY "Users can view own campaigns"
  ON exo_campaign_sends FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access campaigns"
  ON exo_campaign_sends FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Drip state
CREATE POLICY "Service role full access drip"
  ON exo_drip_state FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if tenant already has a code
  SELECT referral_code INTO v_code FROM exo_tenants WHERE id = p_tenant_id;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate unique 8-char code
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    SELECT EXISTS(SELECT 1 FROM exo_tenants WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  UPDATE exo_tenants SET referral_code = v_code WHERE id = p_tenant_id;
  RETURN v_code;
END;
$$;

-- Get referral stats for tenant
CREATE OR REPLACE FUNCTION get_referral_stats(p_tenant_id UUID)
RETURNS TABLE (
  total_referrals INT,
  signed_up INT,
  converted INT,
  total_rewards DECIMAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE status IN ('signed_up', 'activated', 'converted', 'rewarded'))::INT,
    COUNT(*) FILTER (WHERE status IN ('converted', 'rewarded'))::INT,
    COALESCE(SUM(reward_amount) FILTER (WHERE reward_granted_at IS NOT NULL), 0)
  FROM exo_referrals
  WHERE referrer_id = p_tenant_id;
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_referrals IS 'Referral tracking: who referred whom, status, and rewards';
COMMENT ON TABLE exo_engagement_scores IS 'Daily engagement scoring per tenant with churn risk prediction';
COMMENT ON TABLE exo_campaign_sends IS 'Email/SMS/push campaign send tracking with open/click/convert metrics';
COMMENT ON TABLE exo_drip_state IS 'State tracking for drip sequences (onboarding, reengagement, etc.)';
