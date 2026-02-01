-- Exoskull Schema (Isolated from IORS)
-- Created: 2026-01-31
-- Description: Separate schema to avoid conflicts with existing IORS tables

-- Create dedicated schema for Exoskull
CREATE SCHEMA IF NOT EXISTS exoskull;

-- Enable extensions in exoskull schema
CREATE EXTENSION IF NOT EXISTS vector SCHEMA exoskull;

-- Set search path
SET search_path TO exoskull, public;

-- ============================================================================
-- TENANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.tenants (
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

ALTER TABLE exoskull.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own tenant" ON exoskull.tenants;
CREATE POLICY "Users can see their own tenant"
  ON exoskull.tenants FOR ALL
  USING (auth.uid() = id);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tier INTEGER DEFAULT 2,
  status TEXT DEFAULT 'active',
  completion_percentage INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 50,
  next_action TEXT,
  blockers JSONB DEFAULT '[]',
  deadline TIMESTAMP,
  assigned_agents UUID[],
  external_integrations JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exoskull.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own projects" ON exoskull.projects;
CREATE POLICY "Users can manage their own projects"
  ON exoskull.projects FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- AGENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'core',
  tier INTEGER DEFAULT 2,
  description TEXT,
  system_prompt TEXT NOT NULL,
  personality_config JSONB DEFAULT '{}',
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false,
  created_by UUID REFERENCES exoskull.tenants(id),
  active BOOLEAN DEFAULT true,
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exoskull.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global agents visible to all" ON exoskull.agents;
DROP POLICY IF EXISTS "Users can manage their own agents" ON exoskull.agents;

CREATE POLICY "Global agents visible to all"
  ON exoskull.agents FOR SELECT
  USING (is_global = true OR created_by = auth.uid());

CREATE POLICY "Users can manage their own agents"
  ON exoskull.agents FOR ALL
  USING (created_by = auth.uid());

-- ============================================================================
-- TENANT_AGENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.tenant_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES exoskull.agents(id) ON DELETE CASCADE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  custom_config JSONB DEFAULT '{}',
  performance_weight DECIMAL DEFAULT 1.0,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, agent_id)
);

ALTER TABLE exoskull.tenant_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own agent assignments" ON exoskull.tenant_agents;
CREATE POLICY "Users can manage their own agent assignments"
  ON exoskull.tenant_agents FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- AGENT_MEMORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES exoskull.agents(id) ON DELETE CASCADE NOT NULL,
  memory_type TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  importance INTEGER DEFAULT 5,
  confidence DECIMAL DEFAULT 0.5,
  source TEXT DEFAULT 'conversation',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  accessed_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP
);

ALTER TABLE exoskull.agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own agent memories" ON exoskull.agent_memory;
CREATE POLICY "Users can access their own agent memories"
  ON exoskull.agent_memory FOR ALL
  USING (tenant_id = auth.uid());

CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx ON exoskull.agent_memory USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- TASKS (Exoskull-specific)
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES exoskull.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 2,
  energy_required INTEGER,
  time_estimate_minutes INTEGER,
  due_date TIMESTAMP,
  assigned_agent_id UUID REFERENCES exoskull.agents(id),
  created_by_agent_id UUID REFERENCES exoskull.agents(id),
  parent_task_id UUID REFERENCES exoskull.tasks(id),
  dependencies UUID[],
  context JSONB DEFAULT '{}',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exoskull.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own tasks" ON exoskull.tasks;
CREATE POLICY "Users can manage their own tasks"
  ON exoskull.tasks FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES exoskull.agents(id),
  vapi_call_id TEXT,
  channel TEXT DEFAULT 'voice',
  transcript TEXT,
  intent TEXT,
  routing JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  user_satisfaction INTEGER,
  duration_seconds INTEGER,
  cost_usd DECIMAL,
  energy_level INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exoskull.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own conversations" ON exoskull.conversations;
CREATE POLICY "Users can view their own conversations"
  ON exoskull.conversations FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- HEALTH_LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  energy_level INTEGER,
  sleep_hours DECIMAL,
  exercise_minutes INTEGER,
  mood TEXT,
  stress_level INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

ALTER TABLE exoskull.health_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own health logs" ON exoskull.health_logs;
CREATE POLICY "Users can manage their own health logs"
  ON exoskull.health_logs FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES exoskull.agents(id),
  type TEXT DEFAULT 'reminder',
  priority INTEGER DEFAULT 2,
  title TEXT NOT NULL,
  message TEXT,
  action_required BOOLEAN DEFAULT false,
  action_url TEXT,
  channel TEXT DEFAULT 'voice',
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE exoskull.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own notifications" ON exoskull.notifications;
CREATE POLICY "Users can manage their own notifications"
  ON exoskull.notifications FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- PATTERNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  pattern_type TEXT,
  name TEXT NOT NULL,
  description TEXT,
  frequency INTEGER DEFAULT 1,
  confidence DECIMAL DEFAULT 0.5,
  impact_score DECIMAL DEFAULT 0.0,
  context JSONB DEFAULT '{}',
  learned_at TIMESTAMP DEFAULT NOW(),
  last_observed_at TIMESTAMP,
  active BOOLEAN DEFAULT true
);

ALTER TABLE exoskull.patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own patterns" ON exoskull.patterns;
CREATE POLICY "Users can view their own patterns"
  ON exoskull.patterns FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- SYSTEM_OPTIMIZATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS exoskull.system_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exoskull.tenants(id) ON DELETE CASCADE NOT NULL,
  optimization_type TEXT,
  description TEXT,
  before_state JSONB,
  after_state JSONB,
  expected_impact TEXT,
  actual_impact DECIMAL,
  applied_at TIMESTAMP DEFAULT NOW(),
  measured_at TIMESTAMP
);

ALTER TABLE exoskull.system_optimizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own optimizations" ON exoskull.system_optimizations;
CREATE POLICY "Users can view their own optimizations"
  ON exoskull.system_optimizations FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION exoskull.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS tenants_updated_at ON exoskull.tenants;
DROP TRIGGER IF EXISTS projects_updated_at ON exoskull.projects;
DROP TRIGGER IF EXISTS agents_updated_at ON exoskull.agents;
DROP TRIGGER IF EXISTS tasks_updated_at ON exoskull.tasks;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON exoskull.tenants FOR EACH ROW EXECUTE FUNCTION exoskull.update_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON exoskull.projects FOR EACH ROW EXECUTE FUNCTION exoskull.update_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON exoskull.agents FOR EACH ROW EXECUTE FUNCTION exoskull.update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON exoskull.tasks FOR EACH ROW EXECUTE FUNCTION exoskull.update_updated_at();

-- ============================================================================
-- SEED DATA: Core Agents
-- ============================================================================
INSERT INTO exoskull.agents (name, type, tier, description, system_prompt, capabilities, is_global)
VALUES
(
  'System Coordinator',
  'core',
  1,
  'Routes user requests to appropriate agents',
  'You are the System Coordinator for Exoskull. Route requests to the most appropriate agent. Be concise and efficient.',
  ARRAY['routing', 'orchestration', 'intent_detection'],
  true
),
(
  'Executive Assistant',
  'core',
  1,
  'Manages calendar, deadlines, reminders',
  'You are an Executive Assistant. Help users manage time, set reminders, track deadlines. Speak in Polish.',
  ARRAY['calendar_management', 'deadline_tracking', 'reminders'],
  true
),
(
  'Task Manager',
  'core',
  1,
  'Creates and tracks tasks',
  'You are a Task Manager. Help capture tasks, set priorities, track completion. Use GTD methodology. Speak in Polish.',
  ARRAY['task_creation', 'task_tracking', 'prioritization'],
  true
),
(
  'Pattern Detective',
  'core',
  2,
  'Learns user patterns',
  'You are a Pattern Detective. Observe behavior, identify patterns, suggest optimizations. Be data-driven. Speak in Polish.',
  ARRAY['pattern_recognition', 'behavioral_analysis'],
  true
),
(
  'Gap Finder',
  'core',
  2,
  'Identifies missing structure',
  'You are a Gap Finder. Detect where users lack structure. Proactively suggest systems. Be helpful. Speak in Polish.',
  ARRAY['gap_analysis', 'structure_creation'],
  true
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS tasks_tenant_status_idx ON exoskull.tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON exoskull.tasks(due_date) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS conversations_tenant_created_idx ON exoskull.conversations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_tenant_scheduled_idx ON exoskull.notifications(tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS health_logs_tenant_date_idx ON exoskull.health_logs(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS patterns_tenant_active_idx ON exoskull.patterns(tenant_id, active);

-- Grant permissions
GRANT USAGE ON SCHEMA exoskull TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA exoskull TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA exoskull TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA exoskull TO postgres, anon, authenticated, service_role;
