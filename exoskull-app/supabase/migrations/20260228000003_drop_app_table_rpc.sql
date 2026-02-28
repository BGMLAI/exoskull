-- RPC: drop_app_table
-- Safely drops dynamically-generated app tables.
-- Used by autonomy-smoke-test cleanup and future app deletion flows.
-- Only drops tables with the exo_app_ prefix to prevent accidental deletion of system tables.

CREATE OR REPLACE FUNCTION drop_app_table(p_table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Safety check: only allow dropping tables with exo_app_ prefix
  IF p_table_name !~ '^exo_app_' THEN
    RAISE EXCEPTION 'Refusing to drop table "%" — only exo_app_* tables allowed', p_table_name;
  END IF;

  -- Verify table exists before dropping
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table_name
  ) THEN
    -- Table doesn't exist — no-op
    RETURN;
  END IF;

  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', p_table_name);
END;
$$;
