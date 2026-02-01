-- ================================================================
-- EXOSKULL CRON/SCHEDULED JOBS SYSTEM
-- Migration: 20260201000002_scheduled_jobs_system.sql
-- ================================================================

-- ================================================================
-- 1. SCHEDULED JOBS TABLE (Job Definitions)
-- ================================================================

CREATE TABLE IF NOT EXISTS exo_scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job Identity
  job_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Schedule Configuration
  cron_expression VARCHAR(100) NOT NULL,
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN (
    'morning_checkin', 'evening_checkin', 'midday_reminder',
    'bedtime_reminder', 'weekly_preview', 'weekly_summary',
    'monthly_review', 'day_summary', 'custom'
  )),

  -- Handler Configuration
  handler_type VARCHAR(20) NOT NULL DEFAULT 'edge_function'
    CHECK (handler_type IN ('edge_function', 'api_route', 'webhook')),
  handler_endpoint VARCHAR(255) NOT NULL,
  handler_payload JSONB DEFAULT '{}',

  -- Timing (user's local time)
  time_window_start TIME NOT NULL,
  time_window_end TIME NOT NULL,

  -- Channel Configuration
  default_channel VARCHAR(20) DEFAULT 'voice'
    CHECK (default_channel IN ('voice', 'sms', 'both')),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active jobs lookup
CREATE INDEX idx_scheduled_jobs_active ON exo_scheduled_jobs(is_active) WHERE is_active = true;

-- ================================================================
-- 2. USER JOB PREFERENCES TABLE (Per-User Settings)
-- ================================================================

CREATE TABLE IF NOT EXISTS exo_user_job_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES exo_scheduled_jobs(id) ON DELETE CASCADE,

  -- Enablement
  is_enabled BOOLEAN DEFAULT true,

  -- Override Schedule
  custom_time TIME,

  -- Channel Override
  preferred_channel VARCHAR(20) CHECK (preferred_channel IN ('voice', 'sms', 'both', 'none')),

  -- Additional Settings
  skip_weekends BOOLEAN DEFAULT false,
  skip_holidays BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, job_id)
);

-- Indexes
CREATE INDEX idx_user_job_prefs_tenant ON exo_user_job_preferences(tenant_id);
CREATE INDEX idx_user_job_prefs_job ON exo_user_job_preferences(job_id);
CREATE INDEX idx_user_job_prefs_enabled ON exo_user_job_preferences(is_enabled) WHERE is_enabled = true;

-- ================================================================
-- 3. SCHEDULED JOB LOGS TABLE (Execution History)
-- ================================================================

CREATE TABLE IF NOT EXISTS exo_scheduled_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job Reference
  job_id UUID REFERENCES exo_scheduled_jobs(id) ON DELETE SET NULL,
  job_name VARCHAR(100) NOT NULL,

  -- Tenant Reference
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE SET NULL,

  -- Execution Details
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped', 'rate_limited'
  )),

  -- Channel Used
  channel_used VARCHAR(20),

  -- Result
  result_payload JSONB,
  error_message TEXT,

  -- Reference IDs
  vapi_call_id TEXT,
  twilio_message_sid TEXT,

  -- Retry Tracking
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX idx_job_logs_job_id ON exo_scheduled_job_logs(job_id);
CREATE INDEX idx_job_logs_tenant_id ON exo_scheduled_job_logs(tenant_id);
CREATE INDEX idx_job_logs_status ON exo_scheduled_job_logs(status);
CREATE INDEX idx_job_logs_scheduled ON exo_scheduled_job_logs(scheduled_at DESC);
CREATE INDEX idx_job_logs_created ON exo_scheduled_job_logs(created_at DESC);

-- Partial index for pending retries
CREATE INDEX idx_job_logs_pending_retry ON exo_scheduled_job_logs(next_retry_at)
  WHERE status IN ('pending', 'failed') AND attempt_number < max_attempts;

-- ================================================================
-- 4. EVENT TRIGGERS TABLE (Event-Driven Actions)
-- ================================================================

CREATE TABLE IF NOT EXISTS exo_event_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trigger Identity
  trigger_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Trigger Type
  trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
    'sleep_debt', 'no_social', 'task_overdue', 'low_mood',
    'spending_alert', 'health_alert', 'custom'
  )),

  -- Condition Configuration
  condition_params JSONB DEFAULT '{}',

  -- Handler
  handler_endpoint VARCHAR(255) NOT NULL,
  handler_payload JSONB DEFAULT '{}',

  -- Cooldown (prevent spam)
  cooldown_hours INTEGER DEFAULT 24,

  -- Priority (for simultaneous triggers)
  priority INTEGER DEFAULT 5,

  -- Channel
  default_channel VARCHAR(20) DEFAULT 'voice',

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- 5. EXTEND TENANTS TABLE
-- ================================================================

-- Add scheduling settings to exo_tenants if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exo_tenants' AND column_name = 'schedule_settings'
  ) THEN
    ALTER TABLE exo_tenants ADD COLUMN schedule_settings JSONB DEFAULT '{
      "notification_channels": {"voice": true, "sms": true},
      "rate_limits": {"max_calls_per_day": 10, "max_sms_per_day": 20},
      "quiet_hours": {"start": "22:00", "end": "07:00"},
      "skip_weekends": false
    }'::jsonb;
  END IF;
END $$;

-- ================================================================
-- 6. HELPER FUNCTIONS
-- ================================================================

-- Function to get users who should receive a job at current hour
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
    COALESCE(ujp.preferred_channel, sj.default_channel) as preferred_channel,
    ujp.custom_time,
    t.name as tenant_name,
    t.schedule_settings
  FROM exo_tenants t
  JOIN exo_scheduled_jobs sj ON sj.job_name = p_job_name
  LEFT JOIN exo_user_job_preferences ujp ON ujp.tenant_id = t.id AND ujp.job_id = sj.id
  WHERE
    t.phone IS NOT NULL
    AND t.phone != ''
    AND sj.is_active = true
    AND COALESCE(ujp.is_enabled, true) = true;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is within rate limits
CREATE OR REPLACE FUNCTION check_user_rate_limit(
  p_tenant_id UUID,
  p_channel TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  call_count INTEGER;
  sms_count INTEGER;
  tenant_settings JSONB;
  max_calls INTEGER;
  max_sms INTEGER;
BEGIN
  -- Get tenant settings
  SELECT schedule_settings INTO tenant_settings
  FROM exo_tenants WHERE id = p_tenant_id;

  max_calls := COALESCE((tenant_settings->'rate_limits'->>'max_calls_per_day')::INTEGER, 10);
  max_sms := COALESCE((tenant_settings->'rate_limits'->>'max_sms_per_day')::INTEGER, 20);

  -- Count today's calls
  SELECT COUNT(*) INTO call_count
  FROM exo_scheduled_job_logs
  WHERE tenant_id = p_tenant_id
    AND channel_used = 'voice'
    AND created_at >= CURRENT_DATE
    AND status = 'completed';

  -- Count today's SMS
  SELECT COUNT(*) INTO sms_count
  FROM exo_scheduled_job_logs
  WHERE tenant_id = p_tenant_id
    AND channel_used = 'sms'
    AND created_at >= CURRENT_DATE
    AND status = 'completed';

  -- Check limits
  IF p_channel = 'voice' AND call_count >= max_calls THEN
    RETURN FALSE;
  END IF;

  IF p_channel = 'sms' AND sms_count >= max_sms THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to log job execution
CREATE OR REPLACE FUNCTION log_job_execution(
  p_job_id UUID,
  p_job_name TEXT,
  p_tenant_id UUID,
  p_status TEXT,
  p_channel TEXT,
  p_result JSONB DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_vapi_call_id TEXT DEFAULT NULL,
  p_twilio_sid TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO exo_scheduled_job_logs (
    job_id, job_name, tenant_id, scheduled_at, status,
    channel_used, result_payload, error_message,
    vapi_call_id, twilio_message_sid, completed_at
  ) VALUES (
    p_job_id, p_job_name, p_tenant_id, NOW(), p_status,
    p_channel, p_result, p_error,
    p_vapi_call_id, p_twilio_sid,
    CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NOW() ELSE NULL END
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 7. INSERT DEFAULT JOBS
-- ================================================================

INSERT INTO exo_scheduled_jobs (
  job_name, display_name, description, cron_expression, job_type,
  handler_endpoint, time_window_start, time_window_end, default_channel
) VALUES
-- Daily Jobs
('morning_checkin', 'Morning Check-in',
 'Daily morning wellness check: "Jak się czujesz? Energia 1-10?"',
 '0 * * * *', 'morning_checkin',
 '/api/cron/morning-checkin', '06:00', '10:00', 'voice'),

('day_summary', 'Day Summary',
 'Summary of calendar and priorities for the day',
 '0 * * * *', 'day_summary',
 '/api/cron/day-summary', '08:00', '11:00', 'sms'),

('meal_reminder', 'Meal Reminder',
 'Remind to log meal if not logged',
 '0 * * * *', 'midday_reminder',
 '/api/cron/meal-reminder', '11:00', '14:00', 'sms'),

('evening_reflection', 'Evening Reflection',
 'Daily reflection: "Jak minął dzień?"',
 '0 * * * *', 'evening_checkin',
 '/api/cron/evening-reflection', '20:00', '22:00', 'voice'),

('bedtime_reminder', 'Bedtime Reminder',
 'Reminder for sleep goal',
 '30 * * * *', 'bedtime_reminder',
 '/api/cron/bedtime-reminder', '21:30', '23:00', 'sms'),

-- Weekly Jobs
('week_preview', 'Week Preview',
 'Monday morning week planning',
 '0 * * * 1', 'weekly_preview',
 '/api/cron/week-preview', '07:00', '10:00', 'voice'),

('week_summary', 'Week Summary',
 'Friday afternoon week review',
 '0 * * * 5', 'weekly_summary',
 '/api/cron/week-summary', '16:00', '19:00', 'voice'),

('week_planning', 'Week Planning Call',
 'Optional Sunday evening planning session',
 '0 * * * 0', 'weekly_summary',
 '/api/cron/week-planning', '18:00', '21:00', 'voice'),

-- Monthly Jobs
('monthly_review', 'Monthly Review',
 '1st of month comprehensive review',
 '0 * 1 * *', 'monthly_review',
 '/api/cron/monthly-review', '09:00', '12:00', 'voice'),

('goal_checkin', 'Mid-Month Goal Check',
 '15th of month goal progress check',
 '0 * 15 * *', 'monthly_review',
 '/api/cron/goal-checkin', '09:00', '12:00', 'sms')

ON CONFLICT (job_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  handler_endpoint = EXCLUDED.handler_endpoint,
  time_window_start = EXCLUDED.time_window_start,
  time_window_end = EXCLUDED.time_window_end,
  default_channel = EXCLUDED.default_channel,
  updated_at = NOW();

-- ================================================================
-- 8. INSERT DEFAULT EVENT TRIGGERS
-- ================================================================

INSERT INTO exo_event_triggers (
  trigger_name, display_name, description, trigger_type,
  condition_params, handler_endpoint, default_channel, priority, cooldown_hours
) VALUES
('sleep_debt_critical', 'Sleep Debt Alert',
 'Immediate call when sleep debt exceeds threshold',
 'sleep_debt',
 '{"threshold_hours": 6}'::jsonb,
 '/api/cron/sleep-debt-alert', 'voice', 1, 12),

('no_social_30d', 'Social Isolation Alert',
 'Alert after 30 days without social events',
 'no_social',
 '{"days_threshold": 30}'::jsonb,
 '/api/cron/social-alert', 'sms', 3, 168),

('task_overdue_3d', 'Task Overdue Reminder',
 'Escalating reminder for overdue tasks',
 'task_overdue',
 '{"days_overdue": 3}'::jsonb,
 '/api/cron/task-overdue', 'sms', 2, 24),

('low_mood_alert', 'Low Mood Check-in',
 'Follow-up when mood drops below threshold',
 'low_mood',
 '{"threshold": 4, "consecutive_days": 2}'::jsonb,
 '/api/cron/mood-followup', 'voice', 1, 12)

ON CONFLICT (trigger_name) DO NOTHING;

-- ================================================================
-- 9. RLS POLICIES
-- ================================================================

ALTER TABLE exo_scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_user_job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_scheduled_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_event_triggers ENABLE ROW LEVEL SECURITY;

-- Jobs table: read-only for authenticated users
CREATE POLICY "Users can view scheduled jobs"
  ON exo_scheduled_jobs FOR SELECT
  TO authenticated
  USING (is_active = true);

-- User preferences: users can manage their own
CREATE POLICY "Users can manage their job preferences"
  ON exo_user_job_preferences FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Job logs: users can view their own
CREATE POLICY "Users can view their job logs"
  ON exo_scheduled_job_logs FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role full access to jobs"
  ON exo_scheduled_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to preferences"
  ON exo_user_job_preferences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to logs"
  ON exo_scheduled_job_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to triggers"
  ON exo_event_triggers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
