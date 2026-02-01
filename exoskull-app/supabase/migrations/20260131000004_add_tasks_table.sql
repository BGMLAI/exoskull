-- Add exo_tasks table to public schema
-- Based on tasks schema from migration 20260131000001

CREATE TABLE IF NOT EXISTS public.exo_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.exo_tenants(id) ON DELETE CASCADE NOT NULL,
  project_id UUID, -- Will reference exo_projects when that table exists
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, blocked, done, cancelled
  priority INTEGER DEFAULT 2, -- 1=critical, 2=high, 3=medium, 4=low
  energy_required INTEGER, -- 1-10 (match to user energy)
  time_estimate_minutes INTEGER,
  due_date TIMESTAMP,
  assigned_agent_id UUID REFERENCES public.exo_agents(id),
  created_by_agent_id UUID REFERENCES public.exo_agents(id),
  parent_task_id UUID REFERENCES public.exo_tasks(id),
  dependencies UUID[],
  context JSONB DEFAULT '{}',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.exo_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own tasks
DROP POLICY IF EXISTS "Users can manage their own tasks" ON public.exo_tasks;
CREATE POLICY "Users can manage their own tasks"
  ON public.exo_tasks FOR ALL
  USING (tenant_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_exo_tasks_tenant_id ON public.exo_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_tasks_status ON public.exo_tasks(status);
CREATE INDEX IF NOT EXISTS idx_exo_tasks_due_date ON public.exo_tasks(due_date);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_exo_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exo_tasks_updated_at ON public.exo_tasks;
CREATE TRIGGER trigger_update_exo_tasks_updated_at
  BEFORE UPDATE ON public.exo_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_exo_tasks_updated_at();

COMMENT ON TABLE public.exo_tasks IS 'User tasks with GTD-style management';
