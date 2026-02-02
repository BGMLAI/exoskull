-- Custom scheduled jobs for user-created reminders and check-ins
-- Separate from system-defined jobs in exo_scheduled_jobs

CREATE TABLE IF NOT EXISTS public.exo_custom_scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Job identification
  job_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,

  -- Schedule configuration
  schedule_type TEXT NOT NULL DEFAULT 'daily', -- daily, weekly, monthly
  time_of_day TIME NOT NULL DEFAULT '09:00:00',
  days_of_week INTEGER[], -- 0=Sunday, 1=Monday, etc (for weekly)
  day_of_month INTEGER, -- 1-31 (for monthly)

  -- Delivery configuration
  channel TEXT NOT NULL DEFAULT 'sms', -- voice, sms
  message_template TEXT, -- What to say/send (can include variables)

  -- Job type for special handling
  job_type TEXT DEFAULT 'reminder', -- reminder, check_in, follow_up, custom

  -- Status
  is_enabled BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMP,
  next_execution_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure unique job names per user
  UNIQUE(tenant_id, job_name)
);

-- Enable Row Level Security
ALTER TABLE public.exo_custom_scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage their own custom jobs
DROP POLICY IF EXISTS "Users can manage their own custom jobs" ON public.exo_custom_scheduled_jobs;
CREATE POLICY "Users can manage their own custom jobs"
  ON public.exo_custom_scheduled_jobs FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_jobs_tenant_id ON public.exo_custom_scheduled_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_jobs_enabled ON public.exo_custom_scheduled_jobs(is_enabled);
CREATE INDEX IF NOT EXISTS idx_custom_jobs_next_exec ON public.exo_custom_scheduled_jobs(next_execution_at);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_custom_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_custom_jobs_updated_at ON public.exo_custom_scheduled_jobs;
CREATE TRIGGER trigger_update_custom_jobs_updated_at
  BEFORE UPDATE ON public.exo_custom_scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_jobs_updated_at();

-- Function to calculate next execution time
CREATE OR REPLACE FUNCTION calculate_next_execution(
  p_schedule_type TEXT,
  p_time_of_day TIME,
  p_days_of_week INTEGER[],
  p_day_of_month INTEGER,
  p_timezone TEXT DEFAULT 'Europe/Warsaw'
) RETURNS TIMESTAMP AS $$
DECLARE
  v_now TIMESTAMP;
  v_next TIMESTAMP;
  v_today_time TIMESTAMP;
  v_dow INTEGER;
BEGIN
  v_now := NOW() AT TIME ZONE p_timezone;
  v_today_time := DATE(v_now) + p_time_of_day;

  CASE p_schedule_type
    WHEN 'daily' THEN
      -- If time already passed today, schedule for tomorrow
      IF v_today_time <= v_now THEN
        v_next := v_today_time + INTERVAL '1 day';
      ELSE
        v_next := v_today_time;
      END IF;

    WHEN 'weekly' THEN
      -- Find next matching day of week
      v_dow := EXTRACT(DOW FROM v_now)::INTEGER;
      v_next := NULL;

      FOR i IN 0..7 LOOP
        IF (v_dow + i) % 7 = ANY(p_days_of_week) THEN
          v_next := v_today_time + (i || ' days')::INTERVAL;
          IF v_next > v_now THEN
            EXIT;
          END IF;
        END IF;
      END LOOP;

    WHEN 'monthly' THEN
      -- Schedule for specified day of month
      v_next := DATE_TRUNC('month', v_now) + ((p_day_of_month - 1) || ' days')::INTERVAL + p_time_of_day;
      IF v_next <= v_now THEN
        v_next := DATE_TRUNC('month', v_now + INTERVAL '1 month') + ((p_day_of_month - 1) || ' days')::INTERVAL + p_time_of_day;
      END IF;

    ELSE
      v_next := v_today_time + INTERVAL '1 day';
  END CASE;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate next_execution_at on insert/update
CREATE OR REPLACE FUNCTION set_next_execution()
RETURNS TRIGGER AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  -- Get user's timezone
  SELECT COALESCE(timezone, 'Europe/Warsaw') INTO v_timezone
  FROM public.exo_tenants
  WHERE id = NEW.tenant_id;

  NEW.next_execution_at := calculate_next_execution(
    NEW.schedule_type,
    NEW.time_of_day,
    NEW.days_of_week,
    NEW.day_of_month,
    v_timezone
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_next_execution ON public.exo_custom_scheduled_jobs;
CREATE TRIGGER trigger_set_next_execution
  BEFORE INSERT OR UPDATE OF schedule_type, time_of_day, days_of_week, day_of_month
  ON public.exo_custom_scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_next_execution();

-- Execution log for custom jobs
CREATE TABLE IF NOT EXISTS public.exo_custom_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.exo_custom_scheduled_jobs(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.exo_tenants(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL, -- pending, completed, failed, skipped
  channel_used TEXT,
  result JSONB,
  error_message TEXT,
  executed_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.exo_custom_job_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own job logs" ON public.exo_custom_job_logs;
CREATE POLICY "Users can view their own job logs"
  ON public.exo_custom_job_logs FOR SELECT
  USING (tenant_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_custom_job_logs_job_id ON public.exo_custom_job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_custom_job_logs_tenant ON public.exo_custom_job_logs(tenant_id);

COMMENT ON TABLE public.exo_custom_scheduled_jobs IS 'User-created scheduled reminders and check-ins';
COMMENT ON TABLE public.exo_custom_job_logs IS 'Execution history for custom scheduled jobs';
