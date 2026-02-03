-- Gold Layer Refresh Function
-- Enables CONCURRENTLY refresh of materialized views via RPC
-- Used by gold-etl.ts cron job

-- =============================================================================
-- REFRESH FUNCTION
-- =============================================================================

-- Drop if exists to allow re-creation
DROP FUNCTION IF EXISTS public.refresh_gold_view(text);

/**
 * Refresh a Gold layer materialized view
 * Uses CONCURRENTLY to avoid blocking reads during refresh
 *
 * @param view_name - Name of the materialized view (e.g., 'exo_gold_daily_summary')
 * @returns void
 *
 * Usage from Supabase JS:
 *   await supabase.rpc('refresh_gold_view', { view_name: 'exo_gold_daily_summary' })
 */
CREATE OR REPLACE FUNCTION public.refresh_gold_view(view_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  valid_views text[] := ARRAY[
    'exo_gold_daily_summary',
    'exo_gold_weekly_summary',
    'exo_gold_monthly_summary',
    'exo_gold_messages_daily'
  ];
  start_time timestamptz;
  end_time timestamptz;
BEGIN
  -- Validate view name to prevent SQL injection
  IF NOT view_name = ANY(valid_views) THEN
    RAISE EXCEPTION 'Invalid view name: %. Valid views: %', view_name, array_to_string(valid_views, ', ');
  END IF;

  start_time := clock_timestamp();

  -- Refresh the materialized view CONCURRENTLY
  -- CONCURRENTLY requires a unique index (which we have)
  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);

  end_time := clock_timestamp();

  -- Log the refresh
  INSERT INTO exo_gold_sync_log (view_name, refreshed_at, duration_ms, status)
  VALUES (
    view_name,
    NOW(),
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer,
    'success'
  );

EXCEPTION WHEN OTHERS THEN
  -- Log the error
  INSERT INTO exo_gold_sync_log (view_name, refreshed_at, duration_ms, status, error_message)
  VALUES (
    view_name,
    NOW(),
    0,
    'error',
    SQLERRM
  );
  -- Re-raise the exception
  RAISE;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.refresh_gold_view(text) TO service_role;

-- =============================================================================
-- REFRESH ALL FUNCTION
-- =============================================================================

/**
 * Refresh all Gold layer materialized views
 *
 * Usage from Supabase JS:
 *   await supabase.rpc('refresh_all_gold_views')
 */
CREATE OR REPLACE FUNCTION public.refresh_all_gold_views()
RETURNS TABLE(view_name text, duration_ms integer, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  views text[] := ARRAY[
    'exo_gold_daily_summary',
    'exo_gold_weekly_summary',
    'exo_gold_monthly_summary',
    'exo_gold_messages_daily'
  ];
  v text;
  start_time timestamptz;
  end_time timestamptz;
  refresh_duration integer;
  refresh_success boolean;
BEGIN
  FOREACH v IN ARRAY views LOOP
    start_time := clock_timestamp();
    refresh_success := true;

    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', v);
    EXCEPTION WHEN OTHERS THEN
      refresh_success := false;
      -- Log error but continue with other views
      INSERT INTO exo_gold_sync_log (view_name, refreshed_at, duration_ms, status, error_message)
      VALUES (v, NOW(), 0, 'error', SQLERRM);
    END;

    end_time := clock_timestamp();
    refresh_duration := EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer;

    IF refresh_success THEN
      INSERT INTO exo_gold_sync_log (view_name, refreshed_at, duration_ms, status)
      VALUES (v, NOW(), refresh_duration, 'success');
    END IF;

    view_name := v;
    duration_ms := refresh_duration;
    success := refresh_success;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.refresh_all_gold_views() TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION public.refresh_gold_view(text) IS 'Refresh a single Gold layer materialized view with CONCURRENTLY option';
COMMENT ON FUNCTION public.refresh_all_gold_views() IS 'Refresh all Gold layer materialized views and return status for each';
