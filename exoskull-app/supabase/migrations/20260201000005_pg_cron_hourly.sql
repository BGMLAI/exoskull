-- ================================================================
-- PG_CRON HOURLY SCHEDULER
-- Triggers master scheduler every hour via HTTP
-- ================================================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old jobs if they exist
SELECT cron.unschedule('exoskull-master-scheduler') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'exoskull-master-scheduler'
);

SELECT cron.unschedule('exoskull-retry-processor') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'exoskull-retry-processor'
);

-- Schedule master scheduler every hour at minute 0
SELECT cron.schedule(
  'exoskull-master-scheduler',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://exoskull-app.vercel.app/api/cron/master-scheduler',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "exoskull-cron-2026"}'::jsonb,
    body := '{"source": "pg_cron"}'::jsonb
  );
  $$
);

-- Schedule retry processor every 15 minutes
SELECT cron.schedule(
  'exoskull-retry-processor',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://exoskull-app.vercel.app/api/cron/master-scheduler',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "exoskull-cron-2026"}'::jsonb,
    body := '{"source": "pg_cron_retry", "job_filter": "system_retry_processor"}'::jsonb
  );
  $$
);

-- Verify jobs created
-- SELECT * FROM cron.job;