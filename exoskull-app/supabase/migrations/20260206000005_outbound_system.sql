-- ============================================================================
-- AUTONOMOUS OUTBOUND SYSTEM — Layer 16
-- Emergency contacts + proactive outbound tracking
-- ============================================================================

-- Emergency contacts for crisis escalation
CREATE TABLE IF NOT EXISTS exo_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Contact info
  name TEXT NOT NULL,
  relationship TEXT,      -- 'partner', 'parent', 'friend', 'therapist'
  phone TEXT NOT NULL,
  email TEXT,

  -- When to notify
  notify_for TEXT[] DEFAULT ARRAY['suicide', 'panic', 'trauma'],
  notify_after_hours INT DEFAULT 48,

  -- Consent
  user_consented BOOLEAN DEFAULT FALSE,
  consented_at TIMESTAMPTZ,

  -- State
  is_active BOOLEAN DEFAULT TRUE,
  last_notified_at TIMESTAMPTZ,
  notification_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, phone)
);

-- Proactive outbound log (rate limiting + audit trail)
CREATE TABLE IF NOT EXISTS exo_proactive_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  intervention_id UUID,
  trigger_type TEXT NOT NULL,   -- 'crisis_followup', 'inactivity', 'emotion_trend', 'gap'
  channel TEXT NOT NULL,        -- 'sms', 'voice', 'emergency'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_proactive_log_tenant ON exo_proactive_log(tenant_id, created_at DESC);
CREATE INDEX idx_emergency_contacts_tenant ON exo_emergency_contacts(tenant_id)
  WHERE is_active = TRUE;

-- RLS
ALTER TABLE exo_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_proactive_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_emergency" ON exo_emergency_contacts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_proactive" ON exo_proactive_log
  FOR ALL USING (true) WITH CHECK (true);

-- Helper: count proactive outbound for a tenant today
CREATE OR REPLACE FUNCTION get_daily_proactive_count(p_tenant_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INT
  FROM exo_proactive_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= CURRENT_DATE
    AND trigger_type != 'crisis_followup';  -- crisis doesn't count toward limit
$$;
