-- Quick setup - create minimal tables
CREATE TABLE IF NOT EXISTS public.exo_tenants (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.exo_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_policy" ON public.exo_tenants;
CREATE POLICY "tenant_policy" ON public.exo_tenants FOR ALL USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.exo_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'core',
  tier INTEGER DEFAULT 2,
  description TEXT,
  system_prompt TEXT NOT NULL,
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.exo_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_policy" ON public.exo_agents;
CREATE POLICY "agent_policy" ON public.exo_agents FOR SELECT USING (is_global = true);

INSERT INTO public.exo_agents (name, type, tier, description, system_prompt, capabilities, is_global)
VALUES
('System Coordinator', 'core', 1, 'Routes requests', 'You coordinate agents. Speak Polish.', ARRAY['routing'], true),
('Executive Assistant', 'core', 1, 'Manages time', 'You manage calendar. Speak Polish.', ARRAY['calendar'], true),
('Task Manager', 'core', 1, 'Tracks tasks', 'You track tasks. Speak Polish.', ARRAY['tasks'], true),
('Pattern Detective', 'core', 2, 'Learns patterns', 'You find patterns. Speak Polish.', ARRAY['patterns'], true),
('Gap Finder', 'core', 2, 'Finds gaps', 'You find structure gaps. Speak Polish.', ARRAY['gaps'], true)
ON CONFLICT DO NOTHING;
