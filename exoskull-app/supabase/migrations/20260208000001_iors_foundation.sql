-- ============================================================================
-- IORS FOUNDATION TABLES — Phase 0 + Phase 1 Sprint 1
-- Migration: 20260208000001
-- Description: Core IORS tables for birth flow, leads, emergency contacts,
--              Tau emotion matrix, and autonomy permissions.
-- ============================================================================

-- 1. Extend exo_tenants with IORS personality & birth fields
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_name TEXT DEFAULT 'IORS';
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_personality JSONB DEFAULT '{
  "name": "IORS",
  "voice_id": null,
  "language": "auto",
  "style": {
    "formality": 30,
    "humor": 40,
    "directness": 70,
    "empathy": 60,
    "detail_level": 40
  },
  "proactivity": 50,
  "communication_hours": {"start": "07:00", "end": "23:00"}
}'::jsonb;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_birth_date TIMESTAMPTZ;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_birth_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS iors_birth_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN exo_tenants.iors_name IS 'Custom name for this IORS instance';
COMMENT ON COLUMN exo_tenants.iors_personality IS 'IORS personality parameters (IORSPersonality JSON)';
COMMENT ON COLUMN exo_tenants.iors_birth_date IS 'When this IORS instance was born (first interaction)';
COMMENT ON COLUMN exo_tenants.iors_birth_completed IS 'Whether IORS birth flow has reached stable state';
COMMENT ON COLUMN exo_tenants.iors_birth_enabled IS 'Feature flag: use new IORS birth flow vs legacy onboarding';

-- Set existing tenants to legacy mode (don't break their onboarding)
UPDATE exo_tenants SET iors_birth_enabled = FALSE WHERE onboarding_status = 'completed';

-- ============================================================================
-- 2. Lead Management — pre-registration conversations
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  phone TEXT,
  name TEXT,
  channel TEXT,
  conversations JSONB DEFAULT '[]'::jsonb,
  referral_source TEXT,
  lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'engaged', 'qualified', 'converted', 'lost')),
  converted_tenant_id UUID REFERENCES exo_tenants(id),
  converted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON exo_leads(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone ON exo_leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status ON exo_leads(lead_status) WHERE lead_status != 'converted';

ALTER TABLE exo_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access leads" ON exo_leads
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE exo_leads IS 'Pre-registration leads — IORS talks to them before they sign up';

-- ============================================================================
-- 3. Emergency Contacts — crisis escalation
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  relationship TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verification_code TEXT,
  verification_sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist (table may have been created by earlier migration without these)
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS relationship TEXT;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE exo_emergency_contacts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tenant ON exo_emergency_contacts(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_primary ON exo_emergency_contacts(tenant_id) WHERE is_primary = TRUE;

ALTER TABLE exo_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own emergency contacts" ON exo_emergency_contacts
  FOR ALL USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access emergency" ON exo_emergency_contacts
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE exo_emergency_contacts IS 'Emergency contacts with phone verification for crisis escalation';

-- ============================================================================
-- 4. Emotion Signals — Tau Matrix (4-quadrant emotional intelligence)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_emotion_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  session_id TEXT,
  message_id UUID,
  quadrant TEXT NOT NULL CHECK (quadrant IN ('known_want', 'known_unwant', 'unknown_want', 'unknown_unwant')),
  subcriticality FLOAT NOT NULL DEFAULT 0.5 CHECK (subcriticality >= 0 AND subcriticality <= 1),
  valence FLOAT NOT NULL CHECK (valence >= -1 AND valence <= 1),
  arousal FLOAT NOT NULL CHECK (arousal >= 0 AND arousal <= 1),
  label TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT DEFAULT 'text' CHECK (source IN ('text', 'voice', 'fusion', 'wearable')),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotion_signals_tenant_time ON exo_emotion_signals(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emotion_signals_quadrant ON exo_emotion_signals(tenant_id, quadrant);

ALTER TABLE exo_emotion_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own emotion signals" ON exo_emotion_signals
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service role manages emotion signals" ON exo_emotion_signals
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE exo_emotion_signals IS 'Tau Matrix emotion signals — 4-quadrant emotional intelligence';

-- ============================================================================
-- 5. Autonomy Permissions — granular IORS consent model
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_autonomy_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '*',
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  threshold_amount NUMERIC,
  threshold_frequency INTEGER,
  requires_confirmation BOOLEAN DEFAULT TRUE,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  granted_via TEXT DEFAULT 'manual' CHECK (granted_via IN ('manual', 'conversation', 'settings', 'birth')),
  uses_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, action_type, domain)
);

CREATE INDEX IF NOT EXISTS idx_autonomy_perms_tenant ON exo_autonomy_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_autonomy_perms_granted ON exo_autonomy_permissions(tenant_id, granted) WHERE granted = TRUE;

ALTER TABLE exo_autonomy_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own autonomy permissions" ON exo_autonomy_permissions
  FOR ALL USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access autonomy" ON exo_autonomy_permissions
  FOR ALL USING (auth.role() = 'service_role');

-- Helper: check if IORS has permission for a specific action+domain
CREATE OR REPLACE FUNCTION check_iors_autonomy(
  p_tenant_id UUID,
  p_action_type TEXT,
  p_domain TEXT DEFAULT '*'
) RETURNS BOOLEAN AS $$
DECLARE
  v_granted BOOLEAN;
BEGIN
  SELECT granted INTO v_granted
  FROM exo_autonomy_permissions
  WHERE tenant_id = p_tenant_id
    AND action_type = p_action_type
    AND granted = TRUE
    AND revoked_at IS NULL
    AND (domain = p_domain OR domain = '*')
  ORDER BY
    CASE WHEN domain = p_domain THEN 0 ELSE 1 END
  LIMIT 1;

  RETURN COALESCE(v_granted, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Default permission: IORS can log data for all new tenants
INSERT INTO exo_autonomy_permissions (tenant_id, action_type, domain, granted, granted_at, granted_via)
SELECT id, 'log', '*', TRUE, NOW(), 'birth'
FROM exo_tenants
WHERE id NOT IN (
  SELECT tenant_id FROM exo_autonomy_permissions WHERE action_type = 'log' AND domain = '*'
);

COMMENT ON TABLE exo_autonomy_permissions IS 'Granular IORS autonomy permissions per tenant, action, and domain';
