-- Move everything to public schema with exo_ prefix
-- This avoids needing to configure exposed schemas

-- Drop exoskull schema tables if they exist
DROP SCHEMA IF EXISTS exoskull CASCADE;

-- Create tables in public schema with exo_ prefix
CREATE TABLE IF NOT EXISTS public.exo_tenants (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  language TEXT DEFAULT 'pl',
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'trial',
  trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days'),
  settings JSONB DEFAULT '{}',
  adhd_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.exo_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own tenant" ON public.exo_tenants;
CREATE POLICY "Users can see their own tenant"
  ON public.exo_tenants FOR ALL
  USING (auth.uid() = id);

-- Rest of tables...
CREATE TABLE IF NOT EXISTS public.exo_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'core',
  tier INTEGER DEFAULT 2,
  description TEXT,
  system_prompt TEXT NOT NULL,
  personality_config JSONB DEFAULT '{}',
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.exo_tenants(id),
  active BOOLEAN DEFAULT true,
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.exo_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global agents visible" ON public.exo_agents;
CREATE POLICY "Global agents visible"
  ON public.exo_agents FOR SELECT
  USING (is_global = true OR created_by = auth.uid());

-- Seed core agents
INSERT INTO public.exo_agents (name, type, tier, description, system_prompt, capabilities, is_global)
VALUES
('System Coordinator', 'core', 1, 'Routes requests', 'You coordinate agents. Polish.', ARRAY['routing'], true),
('Executive Assistant', 'core', 1, 'Manages time', 'You manage calendar. Polish.', ARRAY['calendar'], true),
('Task Manager', 'core', 1, 'Tracks tasks', 'You track tasks. Polish.', ARRAY['tasks'], true),
('Pattern Detective', 'core', 2, 'Learns patterns', 'You find patterns. Polish.', ARRAY['patterns'], true),
('Gap Finder', 'core', 2, 'Finds gaps', 'You find structure gaps. Polish.', ARRAY['gaps'], true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.exo_tenants IS 'Exoskull users';
COMMENT ON TABLE public.exo_agents IS 'Exoskull AI agents';

-- ============================================
-- MIGRATION 2: Tasks Table
-- ============================================

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
