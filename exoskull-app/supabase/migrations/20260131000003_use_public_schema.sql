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
