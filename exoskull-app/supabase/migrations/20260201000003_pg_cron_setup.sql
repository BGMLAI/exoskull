-- ================================================================
-- EXOSKULL PG_CRON SETUP
-- Migration: 20260201000003_pg_cron_setup.sql
--
-- NOTE: pg_cron must be enabled via Supabase Dashboard:
-- 1. Go to Database > Extensions
-- 2. Enable pg_cron
-- 3. Then run this migration
-- ================================================================

-- Check if pg_cron is available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron extension not enabled. Enable it in Supabase Dashboard > Database > Extensions';
    -- Don't fail - just skip cron setup
    RETURN;
  END IF;
END $$;

-- ================================================================
-- CRON JOBS (Only if pg_cron is enabled)
-- ================================================================

-- Unschedule existing jobs (in case of re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('exo-master-scheduler');
    PERFORM cron.unschedule('exo-event-checker');
    PERFORM cron.unschedule('exo-cleanup');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule jobs: %', SQLERRM;
END $$;

-- ================================================================
-- MASTER SCHEDULER - Runs every hour
-- Calls the API route which handles timezone-aware dispatching
-- ================================================================

DO $$
DECLARE
  app_url TEXT;
  service_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Get app URL from environment or use default
  app_url := COALESCE(
    current_setting('app.exoskull_url', true),
    'https://richardson-ages-caring-oaks.trycloudflare.com'
  );

  PERFORM cron.schedule(
    'exo-master-scheduler',
    '0 * * * *',  -- Every hour at minute 0
    format(
      'SELECT net.http_post(
        url := ''%s/api/cron/master-scheduler'',
        headers := ''{"Content-Type": "application/json", "x-cron-secret": "exoskull-cron-2026"}''::jsonb,
        body := ''{"source": "pg_cron", "triggered_at": "'' || NOW()::text || ''"}''::jsonb
      )',
      app_url
    )
  );

  RAISE NOTICE 'Master scheduler cron job created';
END $$;

-- ================================================================
-- EVENT TRIGGER CHECKER - Runs every 15 minutes
-- ================================================================

DO $$
DECLARE
  app_url TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  app_url := COALESCE(
    current_setting('app.exoskull_url', true),
    'https://richardson-ages-caring-oaks.trycloudflare.com'
  );

  PERFORM cron.schedule(
    'exo-event-checker',
    '*/15 * * * *',  -- Every 15 minutes
    format(
      'SELECT net.http_post(
        url := ''%s/api/cron/event-checker'',
        headers := ''{"Content-Type": "application/json", "x-cron-secret": "exoskull-cron-2026"}''::jsonb,
        body := ''{"source": "pg_cron", "triggered_at": "'' || NOW()::text || ''"}''::jsonb
      )',
      app_url
    )
  );

  RAISE NOTICE 'Event checker cron job created';
END $$;

-- ================================================================
-- DAILY CLEANUP - Runs at 3 AM UTC
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'exo-cleanup',
    '0 3 * * *',  -- 3 AM UTC daily
    $$
    -- Clean up old job logs (keep 30 days)
    DELETE FROM exo_scheduled_job_logs
    WHERE created_at < NOW() - INTERVAL '30 days';

    -- Clean up old conversation messages (keep 90 days)
    DELETE FROM exo_conversation_messages
    WHERE created_at < NOW() - INTERVAL '90 days';
    $$
  );

  RAISE NOTICE 'Daily cleanup cron job created';
END $$;

-- ================================================================
-- VERIFY CRON JOBS
-- ================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Cron jobs configured:';
    RAISE NOTICE '%', (SELECT jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule)) FROM cron.job);
  ELSE
    RAISE NOTICE 'pg_cron not enabled - cron jobs not configured';
  END IF;
END $$;

-- ================================================================
-- ALTERNATIVE: Manual Testing
-- ================================================================

-- If pg_cron is not available, you can test the scheduler manually:
--
-- 1. Using curl:
--    curl -X POST https://your-app.com/api/cron/master-scheduler \
--      -H "Content-Type: application/json" \
--      -H "x-cron-secret: exoskull-cron-2026" \
--      -d '{"source": "manual", "triggered_at": "2026-02-01T12:00:00Z"}'
--
-- 2. Using Supabase Edge Functions (alternative to pg_cron)
-- 3. Using external cron service (cron-job.org, etc.)
-- 4. Using Vercel Cron (when deployed to Vercel)
