-- =====================================================
-- Goal Realization Engine + Life Signal Triage
-- 2026-02-18
-- =====================================================

-- 1. Goal Strategies — plans for achieving user goals
CREATE TABLE IF NOT EXISTS exo_goal_strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES exo_user_goals(id) ON DELETE CASCADE,
  approach TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'active', 'completed', 'abandoned', 'regenerating')),
  confidence NUMERIC(3,2),
  reasoning TEXT,
  context_snapshot JSONB DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  next_step_index INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_goal_strategies_tenant ON exo_goal_strategies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goal_strategies_goal ON exo_goal_strategies(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_strategies_status ON exo_goal_strategies(status) WHERE status IN ('approved', 'active');

-- 2. Life Signal Triage — ALL incoming signals (emails, messages, notifications, events, etc.)
CREATE TABLE IF NOT EXISTS exo_signal_triage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN ('email', 'sms', 'whatsapp', 'slack', 'calendar_event', 'notification', 'health_alert', 'finance_alert', 'social_event', 'system_event', 'web_mention', 'app_event')),
  source_id TEXT,
  source_channel TEXT,
  from_identifier TEXT,
  subject TEXT,
  snippet TEXT,
  full_payload JSONB DEFAULT '{}',
  classification TEXT
    CHECK (classification IN ('urgent', 'important', 'routine', 'noise', 'opportunity')),
  proposed_action TEXT
    CHECK (proposed_action IN ('respond', 'create_task', 'archive', 'forward', 'schedule_meeting', 'delegate', 'research', 'connect_to_goal', 'ignore', 'build_app')),
  action_params JSONB DEFAULT '{}',
  draft_response TEXT,
  related_goal_id UUID REFERENCES exo_user_goals(id),
  reasoning TEXT,
  confidence NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'proposed', 'approved', 'executed', 'rejected', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  proposed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signal_triage_tenant ON exo_signal_triage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signal_triage_status ON exo_signal_triage(status) WHERE status IN ('pending', 'proposed');
CREATE INDEX IF NOT EXISTS idx_signal_triage_type ON exo_signal_triage(signal_type);
CREATE INDEX IF NOT EXISTS idx_signal_triage_created ON exo_signal_triage(created_at DESC);
