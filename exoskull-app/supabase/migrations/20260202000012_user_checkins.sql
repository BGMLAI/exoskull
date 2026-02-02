-- User Custom Check-ins
-- Voice-created reminders and scheduled check-ins

CREATE TABLE IF NOT EXISTS exo_user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  time TIME NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'weekends', 'weekly', 'custom')),
  channel TEXT NOT NULL DEFAULT 'voice' CHECK (channel IN ('voice', 'sms')),
  message TEXT,
  custom_days INTEGER[], -- For custom frequency: 0=Sunday, 1=Monday, etc.
  is_active BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_checkins_tenant ON exo_user_checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_checkins_active ON exo_user_checkins(is_active, time);

-- RLS
ALTER TABLE exo_user_checkins ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own checkins
DROP POLICY IF EXISTS "users_own_checkins" ON exo_user_checkins;
CREATE POLICY "users_own_checkins" ON exo_user_checkins
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Policy: Service role full access
DROP POLICY IF EXISTS "service_role_checkins" ON exo_user_checkins;
CREATE POLICY "service_role_checkins" ON exo_user_checkins
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update system prompt tools reference
COMMENT ON TABLE exo_user_checkins IS 'User-created scheduled check-ins and reminders via voice';
