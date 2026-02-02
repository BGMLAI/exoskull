-- Remove overly permissive service role policy
-- Service role bypasses RLS by default, so no explicit policy needed
DROP POLICY IF EXISTS "Service role full access" ON public.exo_tasks;
