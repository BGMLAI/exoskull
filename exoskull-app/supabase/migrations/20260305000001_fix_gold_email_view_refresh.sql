-- Fix: Add exo_gold_email_daily to refresh_gold_view valid_views
-- The email datalake migration (20260221000001) created the view
-- but didn't update the RPC function's allowed list

-- =============================================================================
-- REFRESH SINGLE VIEW (updated)
-- =============================================================================

DROP FUNCTION IF EXISTS public.refresh_gold_view(text);

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
    'exo_gold_messages_daily',
    'exo_gold_email_daily'
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
  INSERT INTO exo_gold_sync_log (view_name, refreshed_at, duration_ms, status, error_message)
  VALUES (
    view_name,
    NOW(),
    0,
    'error',
    SQLERRM
  );
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_gold_view(text) TO service_role;

-- =============================================================================
-- REFRESH ALL VIEWS (updated)
-- =============================================================================

DROP FUNCTION IF EXISTS public.refresh_all_gold_views();

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
    'exo_gold_messages_daily',
    'exo_gold_email_daily'
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

GRANT EXECUTE ON FUNCTION public.refresh_all_gold_views() TO service_role;

COMMENT ON FUNCTION public.refresh_gold_view(text) IS 'Refresh a single Gold layer materialized view with CONCURRENTLY option (includes email daily)';
COMMENT ON FUNCTION public.refresh_all_gold_views() IS 'Refresh all Gold layer materialized views including email daily';
