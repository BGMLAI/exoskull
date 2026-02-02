-- ExoSkull Onboarding System
-- Adds profile fields, onboarding status, and discovery data tracking

-- ============================================================================
-- 1. EXTEND exo_tenants WITH ONBOARDING FIELDS
-- ============================================================================

-- Onboarding status tracking
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS onboarding_status TEXT
  DEFAULT 'pending' CHECK (onboarding_status IN ('pending', 'in_progress', 'completed'));
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Profile basics
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS age_range TEXT;

-- Goals & conditions
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS primary_goal TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS secondary_goals TEXT[] DEFAULT '{}';
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS conditions TEXT[] DEFAULT '{}';

-- Communication preferences
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS communication_style TEXT DEFAULT 'direct'
  CHECK (communication_style IN ('direct', 'warm', 'coaching'));
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS preferred_channel TEXT DEFAULT 'voice'
  CHECK (preferred_channel IN ('voice', 'sms', 'email'));
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS morning_checkin_time TIME DEFAULT '07:00';
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS evening_checkin_time TIME DEFAULT '21:00';
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS checkin_enabled BOOLEAN DEFAULT true;

-- Voice PIN for phone authentication (hashed)
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS voice_pin_hash TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS voice_pin_set_at TIMESTAMPTZ;

-- Discovery data (raw JSON from conversation)
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS discovery_data JSONB DEFAULT '{}';

-- ============================================================================
-- 2. ONBOARDING SESSIONS TABLE (tracks progress through steps)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}',
  conversation_id UUID REFERENCES exo_conversations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_tenant ON exo_onboarding_sessions(tenant_id);

-- RLS
ALTER TABLE exo_onboarding_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_onboarding_sessions" ON exo_onboarding_sessions;
CREATE POLICY "users_own_onboarding_sessions" ON exo_onboarding_sessions
  FOR ALL USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- ============================================================================
-- 3. DISCOVERY EXTRACTIONS TABLE (individual insights from conversation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_discovery_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES exo_conversations(id),
  extraction_type TEXT NOT NULL CHECK (extraction_type IN ('goal', 'condition', 'preference', 'device', 'insight', 'schedule')),
  value TEXT NOT NULL,
  confidence DECIMAL DEFAULT 0.8,
  context TEXT, -- The original quote from conversation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_extractions_tenant ON exo_discovery_extractions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovery_extractions_type ON exo_discovery_extractions(extraction_type);

-- RLS
ALTER TABLE exo_discovery_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_extractions" ON exo_discovery_extractions;
CREATE POLICY "users_own_extractions" ON exo_discovery_extractions
  FOR ALL USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_onboarding_status ON exo_tenants(onboarding_status)
  WHERE onboarding_status != 'completed';

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON COLUMN exo_tenants.onboarding_status IS 'Onboarding state: pending (not started), in_progress (started), completed';
COMMENT ON COLUMN exo_tenants.onboarding_step IS 'Current step in onboarding (0-5)';
COMMENT ON COLUMN exo_tenants.discovery_data IS 'Raw data extracted from discovery conversation (JSON)';
COMMENT ON COLUMN exo_tenants.primary_goal IS 'Main goal: sleep, productivity, health, finance, relationships, etc.';
COMMENT ON COLUMN exo_tenants.conditions IS 'Array of conditions: ADHD, anxiety, depression, burnout, insomnia, etc.';
COMMENT ON COLUMN exo_tenants.communication_style IS 'Preferred tone: direct (konkretny), warm (ciepły), coaching (refleksyjny)';
COMMENT ON TABLE exo_onboarding_sessions IS 'Tracks progress through onboarding steps';
COMMENT ON TABLE exo_discovery_extractions IS 'Individual insights extracted from discovery conversation';
