-- ================================================================
-- JOB CONSENT MODEL
-- Separates system jobs (auto) from user jobs (opt-in via conversation)
-- ================================================================

-- Add consent column to scheduled jobs
ALTER TABLE exo_scheduled_jobs
ADD COLUMN IF NOT EXISTS requires_user_consent BOOLEAN DEFAULT true;

-- Update existing user-facing jobs to require consent (inactive by default)
UPDATE exo_scheduled_jobs
SET requires_user_consent = true, is_active = false
WHERE job_name IN (
  'morning_checkin',
  'day_summary',
  'meal_reminder',
  'evening_reflection',
  'bedtime_reminder',
  'week_preview',
  'week_summary',
  'week_planning',
  'monthly_review',
  'goal_checkin'
);

-- ================================================================
-- SYSTEM JOBS (always active, no consent needed)
-- ================================================================

INSERT INTO exo_scheduled_jobs (
  job_name, display_name, description, cron_expression, job_type,
  handler_endpoint, time_window_start, time_window_end, default_channel,
  is_active, is_system, requires_user_consent
) VALUES

-- Data optimization (runs at 3am UTC daily)
('system_data_cleanup', 'Data Cleanup',
 'Remove expired sessions, compress old logs, optimize storage',
 '0 3 * * *', 'custom',
 '/api/cron/system/data-cleanup', '03:00', '04:00', 'sms',
 true, true, false),

-- Analytics aggregation (runs at 2am UTC daily)
('system_analytics', 'Analytics Aggregation',
 'Aggregate daily metrics, update user insights, refresh patterns',
 '0 2 * * *', 'custom',
 '/api/cron/system/analytics', '02:00', '03:00', 'sms',
 true, true, false),

-- Gap detection (runs weekly on Sunday at 4am UTC)
('system_gap_detection', 'Gap Detection',
 'Analyze user data for blind spots and missing areas',
 '0 4 * * 0', 'custom',
 '/api/cron/system/gap-detection', '04:00', '05:00', 'sms',
 true, true, false),

-- Pattern learning (runs daily at 5am UTC)
('system_pattern_learning', 'Pattern Learning',
 'Update ML models with new user behavior patterns',
 '0 5 * * *', 'custom',
 '/api/cron/system/pattern-learning', '05:00', '06:00', 'sms',
 true, true, false),

-- Retry processor (runs every 15 minutes)
('system_retry_processor', 'Retry Failed Jobs',
 'Retry failed job executions',
 '*/15 * * * *', 'custom',
 '/api/cron/system/retry-processor', '00:00', '23:59', 'sms',
 true, true, false)

ON CONFLICT (job_name) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system,
  requires_user_consent = EXCLUDED.requires_user_consent,
  updated_at = NOW();

-- ================================================================
-- USER JOB CONSENT TABLE
-- Tracks when user agreed to specific jobs via conversation
-- ================================================================

CREATE TABLE IF NOT EXISTS exo_user_job_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES exo_scheduled_jobs(id) ON DELETE CASCADE,

  -- Consent tracking
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_method VARCHAR(50) DEFAULT 'conversation', -- conversation, settings_ui, onboarding
  consent_context TEXT, -- What the user said when agreeing

  -- Customization agreed during consent
  preferred_time TIME,
  preferred_channel VARCHAR(20),

  -- Status
  is_active BOOLEAN DEFAULT true,
  paused_until TIMESTAMPTZ, -- Temporary pause

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, job_id)
);

-- Indexes
CREATE INDEX idx_user_job_consents_tenant ON exo_user_job_consents(tenant_id);
CREATE INDEX idx_user_job_consents_active ON exo_user_job_consents(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE exo_user_job_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their job consents"
  ON exo_user_job_consents FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access to consents"
  ON exo_user_job_consents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- UPDATED HELPER FUNCTION
-- Only returns users who have consented to user-facing jobs
-- ================================================================

CREATE OR REPLACE FUNCTION get_users_for_scheduled_job(
  p_job_name TEXT,
  p_current_utc_hour INTEGER
)
RETURNS TABLE (
  tenant_id UUID,
  phone TEXT,
  timezone TEXT,
  language TEXT,
  preferred_channel TEXT,
  custom_time TIME,
  tenant_name TEXT,
  schedule_settings JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as tenant_id,
    t.phone,
    t.timezone,
    t.language,
    COALESCE(ujc.preferred_channel, ujp.preferred_channel, sj.default_channel) as preferred_channel,
    COALESCE(ujc.preferred_time, ujp.custom_time) as custom_time,
    t.name as tenant_name,
    t.schedule_settings
  FROM exo_tenants t
  JOIN exo_scheduled_jobs sj ON sj.job_name = p_job_name
  LEFT JOIN exo_user_job_preferences ujp ON ujp.tenant_id = t.id AND ujp.job_id = sj.id
  LEFT JOIN exo_user_job_consents ujc ON ujc.tenant_id = t.id AND ujc.job_id = sj.id
  WHERE
    t.phone IS NOT NULL
    AND t.phone != ''
    AND sj.is_active = true
    -- System jobs: no consent needed
    -- User jobs: require active consent
    AND (
      sj.requires_user_consent = false
      OR (ujc.id IS NOT NULL AND ujc.is_active = true AND (ujc.paused_until IS NULL OR ujc.paused_until < NOW()))
    )
    AND COALESCE(ujp.is_enabled, true) = true;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION TO RECORD USER CONSENT (called from conversation)
-- ================================================================

CREATE OR REPLACE FUNCTION record_job_consent(
  p_tenant_id UUID,
  p_job_name TEXT,
  p_consent_context TEXT DEFAULT NULL,
  p_preferred_time TIME DEFAULT NULL,
  p_preferred_channel VARCHAR(20) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_consent_id UUID;
BEGIN
  -- Get job ID
  SELECT id INTO v_job_id FROM exo_scheduled_jobs WHERE job_name = p_job_name;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_name;
  END IF;

  -- Insert or update consent
  INSERT INTO exo_user_job_consents (
    tenant_id, job_id, consent_context, preferred_time, preferred_channel
  ) VALUES (
    p_tenant_id, v_job_id, p_consent_context, p_preferred_time, p_preferred_channel
  )
  ON CONFLICT (tenant_id, job_id) DO UPDATE SET
    is_active = true,
    paused_until = NULL,
    consent_context = COALESCE(EXCLUDED.consent_context, exo_user_job_consents.consent_context),
    preferred_time = COALESCE(EXCLUDED.preferred_time, exo_user_job_consents.preferred_time),
    preferred_channel = COALESCE(EXCLUDED.preferred_channel, exo_user_job_consents.preferred_channel),
    updated_at = NOW()
  RETURNING id INTO v_consent_id;

  RETURN v_consent_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCTION TO REVOKE/PAUSE CONSENT
-- ================================================================

CREATE OR REPLACE FUNCTION revoke_job_consent(
  p_tenant_id UUID,
  p_job_name TEXT,
  p_pause_days INTEGER DEFAULT NULL -- NULL = permanent revoke, number = pause for N days
) RETURNS BOOLEAN AS $$
DECLARE
  v_job_id UUID;
BEGIN
  SELECT id INTO v_job_id FROM exo_scheduled_jobs WHERE job_name = p_job_name;

  IF v_job_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE exo_user_job_consents
  SET
    is_active = CASE WHEN p_pause_days IS NULL THEN false ELSE true END,
    paused_until = CASE WHEN p_pause_days IS NOT NULL THEN NOW() + (p_pause_days || ' days')::INTERVAL ELSE NULL END,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id AND job_id = v_job_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;
