-- Fix RLS policy for exo_tasks to include WITH CHECK for INSERT
-- The original policy only had USING which doesn't work for INSERT operations

DROP POLICY IF EXISTS "Users can manage their own tasks" ON public.exo_tasks;
CREATE POLICY "Users can manage their own tasks"
  ON public.exo_tasks FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Service role bypasses RLS automatically, no explicit policy needed

COMMENT ON POLICY "Users can manage their own tasks" ON public.exo_tasks IS 'Users can only access tasks where tenant_id matches their auth.uid()';
COMMENT ON POLICY "Service role full access" ON public.exo_tasks IS 'Service role has unrestricted access for server-side operations';
