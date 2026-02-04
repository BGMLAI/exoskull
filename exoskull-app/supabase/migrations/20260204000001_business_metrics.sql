-- ============================================================================
-- BUSINESS METRICS & REVENUE TRACKING
-- ============================================================================
-- Tracks business events, daily metrics, and dunning management.
-- Part of GAP 3: Hard Business Functionalities
-- ============================================================================

-- ============================================================================
-- 1. BUSINESS EVENTS (source of truth for all revenue events)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'subscription_started', 'subscription_renewed', 'subscription_cancelled',
    'subscription_upgraded', 'subscription_downgraded',
    'payment_succeeded', 'payment_failed', 'payment_refunded',
    'trial_started', 'trial_ended', 'trial_converted',
    'credit_purchased', 'credit_used', 'credit_expired'
  )),
  amount_pln DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PLN',
  metadata JSONB DEFAULT '{}',

  -- Stripe references
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_subscription_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_business_events_tenant ON exo_business_events(tenant_id, created_at DESC);
CREATE INDEX idx_business_events_type ON exo_business_events(event_type, created_at DESC);

-- ============================================================================
-- 2. DAILY BUSINESS METRICS (calculated by cron)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_business_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  -- Revenue
  mrr_pln DECIMAL(10,2) DEFAULT 0,
  arr_pln DECIMAL(10,2) DEFAULT 0,
  revenue_today_pln DECIMAL(10,2) DEFAULT 0,

  -- Users
  total_users INT DEFAULT 0,
  active_users_30d INT DEFAULT 0,
  paying_users INT DEFAULT 0,
  trial_users INT DEFAULT 0,

  -- Churn
  churned_users_30d INT DEFAULT 0,
  churn_rate_30d DECIMAL(5,4) DEFAULT 0,

  -- Conversion
  trial_to_paid_rate DECIMAL(5,4) DEFAULT 0,

  -- Average revenue
  arpu_pln DECIMAL(10,2) DEFAULT 0,
  ltv_estimated_pln DECIMAL(10,2) DEFAULT 0,

  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_business_daily_date ON exo_business_daily_metrics(date DESC);

-- ============================================================================
-- 3. EXTEND exo_tenants WITH BILLING COLUMNS
-- ============================================================================

ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS total_paid_pln DECIMAL(10,2) DEFAULT 0;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS failed_payments INT DEFAULT 0;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS acquisition_channel TEXT;

-- ============================================================================
-- 4. DUNNING MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_dunning_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'retrying', 'recovered', 'failed_permanently'
  )),
  next_retry_at TIMESTAMPTZ,
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_channel TEXT,
  amount_pln DECIMAL(10,2),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dunning_tenant ON exo_dunning_attempts(tenant_id);
CREATE INDEX idx_dunning_next_retry ON exo_dunning_attempts(next_retry_at)
  WHERE status = 'retrying';

-- ============================================================================
-- 5. USAGE TRACKING (per-tier rate limiting)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage counters
  conversations_count INT DEFAULT 0,
  ai_requests_count INT DEFAULT 0,
  voice_minutes DECIMAL(8,2) DEFAULT 0,
  tokens_used BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX idx_usage_daily_tenant ON exo_usage_daily(tenant_id, date DESC);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE exo_business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_business_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_dunning_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_usage_daily ENABLE ROW LEVEL SECURITY;

-- Business events: users see own, service role sees all
CREATE POLICY "Users can view own business events"
  ON exo_business_events FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access business events"
  ON exo_business_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Daily metrics: admin only (via service role)
CREATE POLICY "Service role full access daily metrics"
  ON exo_business_daily_metrics FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Dunning: service role only
CREATE POLICY "Service role full access dunning"
  ON exo_dunning_attempts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Usage: users see own, service role manages
CREATE POLICY "Users can view own usage"
  ON exo_usage_daily FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access usage"
  ON exo_usage_daily FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Increment usage counter atomically
CREATE OR REPLACE FUNCTION increment_usage(
  p_tenant_id UUID,
  p_field TEXT,
  p_amount DECIMAL DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO exo_usage_daily (tenant_id, date)
  VALUES (p_tenant_id, CURRENT_DATE)
  ON CONFLICT (tenant_id, date) DO NOTHING;

  EXECUTE format(
    'UPDATE exo_usage_daily SET %I = %I + $1, updated_at = NOW() WHERE tenant_id = $2 AND date = CURRENT_DATE',
    p_field, p_field
  ) USING p_amount, p_tenant_id;
END;
$$;

-- Get current usage for tenant
CREATE OR REPLACE FUNCTION get_current_usage(p_tenant_id UUID)
RETURNS TABLE (
  conversations_count INT,
  ai_requests_count INT,
  voice_minutes DECIMAL,
  tokens_used BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT conversations_count, ai_requests_count, voice_minutes, tokens_used
  FROM exo_usage_daily
  WHERE tenant_id = p_tenant_id AND date = CURRENT_DATE;
$$;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_business_events IS 'Source of truth for all revenue-related events (Stripe webhooks, credit purchases, etc.)';
COMMENT ON TABLE exo_business_daily_metrics IS 'Pre-calculated daily business metrics (MRR, churn, LTV, etc.)';
COMMENT ON TABLE exo_dunning_attempts IS 'Failed payment retry management with escalating notifications';
COMMENT ON TABLE exo_usage_daily IS 'Daily usage counters per tenant for rate limiting enforcement';
COMMENT ON FUNCTION increment_usage IS 'Atomically increment a usage counter for the current day';
