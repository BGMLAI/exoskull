-- Exoskull Multi-Tenant Schema
-- Created: 2026-01-31
-- Description: Self-optimizing life management system

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TENANTS (Users/Organizations)
-- ============================================================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  language TEXT DEFAULT 'pl',
  subscription_tier TEXT DEFAULT 'free', -- free, basic, pro, enterprise
  subscription_status TEXT DEFAULT 'trial', -- trial, active, cancelled, expired
  trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days'),
  settings JSONB DEFAULT '{}',
  adhd_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own tenant"
  ON tenants FOR ALL
  USING (auth.uid() = id);

-- ============================================================================
-- PROJECTS (Work/Life Areas)
-- ============================================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- work, personal, health, finance, legal, creative
  tier INTEGER DEFAULT 2, -- 1=critical, 2=important, 3=nice-to-have
  status TEXT DEFAULT 'active', -- active, paused, blocked, completed, archived
  completion_percentage INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 50, -- 0-100 (calculated by system)
  next_action TEXT,
  blockers JSONB DEFAULT '[]',
  deadline TIMESTAMP,
  assigned_agents UUID[],
  external_integrations JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
  ON projects FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- AGENTS (AI Personalities)
-- ============================================================================
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'core', -- core, specialized, learning
  tier INTEGER DEFAULT 2, -- 1-4 priority
  description TEXT,
  system_prompt TEXT NOT NULL,
  personality_config JSONB DEFAULT '{}',
  capabilities TEXT[],
  is_global BOOLEAN DEFAULT false,
  created_by UUID REFERENCES tenants(id),
  active BOOLEAN DEFAULT true,
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global agents visible to all"
  ON agents FOR SELECT
  USING (is_global = true OR created_by = auth.uid());

CREATE POLICY "Users can manage their own agents"
  ON agents FOR ALL
  USING (created_by = auth.uid());

-- ============================================================================
-- TENANT_AGENTS (Agent Assignments + Performance)
-- ============================================================================
CREATE TABLE tenant_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  custom_config JSONB DEFAULT '{}',
  performance_weight DECIMAL DEFAULT 1.0,
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, agent_id)
);

ALTER TABLE tenant_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own agent assignments"
  ON tenant_agents FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- AGENT_MEMORY (Per-Tenant Agent Knowledge)
-- ============================================================================
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  memory_type TEXT, -- fact, preference, pattern, decision, learned_behavior
  content TEXT NOT NULL,
  embedding vector(1536),
  importance INTEGER DEFAULT 5, -- 1-10
  confidence DECIMAL DEFAULT 0.5, -- 0.0-1.0
  source TEXT DEFAULT 'conversation',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  accessed_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP
);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own agent memories"
  ON agent_memory FOR ALL
  USING (tenant_id = auth.uid());

-- Vector similarity search index
CREATE INDEX agent_memory_embedding_idx ON agent_memory USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- TASKS (Actions to Take)
-- ============================================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, blocked, done, cancelled
  priority INTEGER DEFAULT 2, -- 1=critical, 2=high, 3=medium, 4=low
  energy_required INTEGER, -- 1-10 (match to user energy)
  time_estimate_minutes INTEGER,
  due_date TIMESTAMP,
  assigned_agent_id UUID REFERENCES agents(id),
  created_by_agent_id UUID REFERENCES agents(id),
  parent_task_id UUID REFERENCES tasks(id),
  dependencies UUID[],
  context JSONB DEFAULT '{}',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tasks"
  ON tasks FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- CONVERSATIONS (Voice + Text Interactions)
-- ============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id),
  vapi_call_id TEXT,
  channel TEXT DEFAULT 'voice', -- voice, web, mobile, sms
  transcript TEXT,
  intent TEXT,
  routing JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  user_satisfaction INTEGER, -- 1-5 stars
  duration_seconds INTEGER,
  cost_usd DECIMAL,
  energy_level INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
  ON conversations FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- HEALTH_LOGS (Wellness Tracking)
-- ============================================================================
CREATE TABLE health_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  energy_level INTEGER, -- 1-10 from morning check-in
  sleep_hours DECIMAL,
  exercise_minutes INTEGER,
  mood TEXT, -- poor, okay, good, great
  stress_level INTEGER, -- 1-10
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own health logs"
  ON health_logs FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- NOTIFICATIONS (Proactive Alerts)
-- ============================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id),
  type TEXT DEFAULT 'reminder', -- reminder, alert, suggestion, deadline, insight
  priority INTEGER DEFAULT 2,
  title TEXT NOT NULL,
  message TEXT,
  action_required BOOLEAN DEFAULT false,
  action_url TEXT,
  channel TEXT DEFAULT 'voice', -- voice, sms, push, email, in_app
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  status TEXT DEFAULT 'pending', -- pending, sent, acknowledged, dismissed, failed
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notifications"
  ON notifications FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- PATTERNS (System-Learned Behaviors)
-- ============================================================================
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  pattern_type TEXT, -- workflow, habit, trigger, blocker, success_factor
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

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own patterns"
  ON patterns FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- SYSTEM_OPTIMIZATIONS (Self-Improvement Log)
-- ============================================================================
CREATE TABLE system_optimizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  optimization_type TEXT,
  description TEXT,
  before_state JSONB,
  after_state JSONB,
  expected_impact TEXT,
  actual_impact DECIMAL,
  applied_at TIMESTAMP DEFAULT NOW(),
  measured_at TIMESTAMP
);

ALTER TABLE system_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own optimizations"
  ON system_optimizations FOR ALL
  USING (tenant_id = auth.uid());

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA: Core Agents
-- ============================================================================
INSERT INTO agents (name, type, tier, description, system_prompt, capabilities, is_global) VALUES
(
  'System Coordinator',
  'core',
  1,
  'Routes user requests to appropriate agents and manages orchestration',
  'You are the System Coordinator for Exoskull. Your role is to understand user intent and route requests to the most appropriate agent. Analyze the user''s message, determine what they need, and delegate intelligently. Be concise and efficient.',
  ARRAY['routing', 'orchestration', 'intent_detection', 'multi_agent_coordination'],
  true
),
(
  'Executive Assistant',
  'core',
  1,
  'Manages calendar, deadlines, and reminders',
  'You are an Executive Assistant for Exoskull. Help users manage their time, set reminders, track deadlines, and stay organized. Be proactive but respectful of their autonomy. Speak in Polish.',
  ARRAY['calendar_management', 'deadline_tracking', 'reminders', 'scheduling'],
  true
),
(
  'Task Manager',
  'core',
  1,
  'Creates, tracks, and completes tasks',
  'You are a Task Manager for Exoskull. Help users capture tasks, break down complex projects, set priorities, and track completion. Use the Getting Things Done (GTD) methodology. Speak in Polish.',
  ARRAY['task_creation', 'task_tracking', 'prioritization', 'gtd_methodology'],
  true
),
(
  'Pattern Detective',
  'core',
  2,
  'Learns user patterns and identifies what works',
  'You are a Pattern Detective for Exoskull. Observe user behavior, identify patterns (good and bad), and suggest optimizations. Be data-driven but empathetic. Speak in Polish.',
  ARRAY['pattern_recognition', 'behavioral_analysis', 'optimization_suggestions'],
  true
),
(
  'Gap Finder',
  'core',
  2,
  'Identifies missing structure and fills gaps',
  'You are a Gap Finder for Exoskull. Detect where users lack structure, organization, or follow-through. Proactively suggest systems to fill these gaps. Be helpful without being pushy. Speak in Polish.',
  ARRAY['gap_analysis', 'structure_creation', 'proactive_suggestions'],
  true
);

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================
CREATE INDEX tasks_tenant_status_idx ON tasks(tenant_id, status);
CREATE INDEX tasks_due_date_idx ON tasks(due_date) WHERE status != 'done';
CREATE INDEX conversations_tenant_created_idx ON conversations(tenant_id, created_at DESC);
CREATE INDEX notifications_tenant_scheduled_idx ON notifications(tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX health_logs_tenant_date_idx ON health_logs(tenant_id, date DESC);
CREATE INDEX patterns_tenant_active_idx ON patterns(tenant_id, active);

COMMENT ON TABLE tenants IS 'Multi-tenant user accounts with subscription management';
COMMENT ON TABLE agents IS 'AI agent personalities (global and user-created)';
COMMENT ON TABLE tasks IS 'User tasks with GTD-style organization';
COMMENT ON TABLE conversations IS 'Voice and text interaction logs';
COMMENT ON TABLE health_logs IS 'Daily wellness check-in data';
