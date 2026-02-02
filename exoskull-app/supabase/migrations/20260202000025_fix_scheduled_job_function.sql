-- ================================================================
-- FIX: get_users_for_scheduled_job function
-- Error: "structure of query does not match function result type"
-- ================================================================

-- Ensure schedule_settings column exists on exo_tenants
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

-- Drop existing function to avoid conflicts
DROP FUNCTION IF EXISTS get_users_for_scheduled_job(TEXT, INTEGER);

-- Recreate function with explicit type casts
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
    t.id::UUID as tenant_id,
    t.phone::TEXT as phone,
    COALESCE(t.timezone, 'Europe/Warsaw')::TEXT as timezone,
    COALESCE(t.language, 'pl')::TEXT as language,
    COALESCE(ujc.preferred_channel, ujp.preferred_channel, sj.default_channel)::TEXT as preferred_channel,
    COALESCE(ujc.preferred_time, ujp.custom_time)::TIME as custom_time,
    t.name::TEXT as tenant_name,
    COALESCE(t.schedule_settings, '{}'::jsonb)::JSONB as schedule_settings
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

-- Re-enable user jobs (make them active again)
UPDATE exo_scheduled_jobs
SET is_active = true
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_users_for_scheduled_job(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_users_for_scheduled_job(TEXT, INTEGER) TO authenticated;
