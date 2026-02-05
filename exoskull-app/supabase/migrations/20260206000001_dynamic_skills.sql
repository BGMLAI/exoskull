-- =====================================================
-- DYNAMIC SKILL GENERATION SYSTEM
-- Enables ExoSkull to generate new abilities at runtime
-- =====================================================

-- Generated Skills Registry
CREATE TABLE IF NOT EXISTS exo_generated_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Identity (AgentSkills-style metadata)
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  tier TEXT NOT NULL DEFAULT 'custom' CHECK (tier IN ('custom', 'community', 'verified')),

  -- Code Storage
  executor_code TEXT NOT NULL,           -- TypeScript code implementing IModExecutor
  config_schema JSONB DEFAULT '{}',      -- JSON Schema for user config

  -- Capability Disclosure (OpenClaw pattern)
  capabilities JSONB NOT NULL DEFAULT '{}',  -- { "database": ["read"], "http": ["fetch"] }
  allowed_tools TEXT[] DEFAULT '{}',         -- ['supabase.select', 'fetch.get']
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),

  -- Generation Metadata
  generation_prompt TEXT,                -- Original prompt that generated this skill
  generated_by TEXT NOT NULL,            -- 'claude-opus-4-5', 'gpt-4-codex', etc.
  generation_tokens INTEGER,

  -- Approval Status
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revoked')),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,                      -- 'user', 'auto', 'admin'
  rejection_reason TEXT,

  -- Security Audit
  security_audit JSONB DEFAULT '{}',     -- { "static_analysis": {...}, "vulnerabilities": [] }
  last_audit_at TIMESTAMPTZ,

  -- Usage & Lifecycle
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, slug, version)
);

-- Skill Versions (for rollback support)
CREATE TABLE IF NOT EXISTS exo_skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES exo_generated_skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  executor_code TEXT NOT NULL,
  config_schema JSONB DEFAULT '{}',
  capabilities JSONB DEFAULT '{}',
  changelog TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(skill_id, version)
);

-- Skill Execution Log (audit trail)
CREATE TABLE IF NOT EXISTS exo_skill_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES exo_generated_skills(id) ON DELETE CASCADE,

  action TEXT NOT NULL,
  params JSONB,
  result JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  execution_time_ms INTEGER,
  memory_used_mb DECIMAL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Skill Approval Requests (for async 2FA approval flow)
CREATE TABLE IF NOT EXISTS exo_skill_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES exo_generated_skills(id) ON DELETE CASCADE,

  request_reason TEXT NOT NULL,          -- 'gap_detection', 'user_request', 'pattern_match'
  capability_disclosure JSONB NOT NULL,  -- Human-readable explanation of what skill does

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'channel_1_confirmed', 'approved', 'rejected', 'expired')),

  -- 2FA: Dual Channel Confirmation
  confirmation_code TEXT NOT NULL,       -- 6-char code (e.g., ABC123)
  requires_2fa BOOLEAN DEFAULT true,

  channel_1 TEXT,                        -- 'sms', 'email', 'push', 'voice'
  channel_1_confirmed_at TIMESTAMPTZ,

  channel_2 TEXT,                        -- Must be DIFFERENT from channel_1
  channel_2_confirmed_at TIMESTAMPTZ,

  -- Notifications
  notification_sent_at TIMESTAMPTZ,

  -- Lifecycle
  requested_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  responded_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_generated_skills_tenant ON exo_generated_skills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_skills_slug ON exo_generated_skills(slug);
CREATE INDEX IF NOT EXISTS idx_generated_skills_approval ON exo_generated_skills(approval_status);
CREATE INDEX IF NOT EXISTS idx_generated_skills_active ON exo_generated_skills(tenant_id, approval_status)
  WHERE approval_status = 'approved' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON exo_skill_versions(skill_id);

CREATE INDEX IF NOT EXISTS idx_skill_execution_log_skill ON exo_skill_execution_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_execution_log_tenant ON exo_skill_execution_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_skill_execution_log_created ON exo_skill_execution_log(created_at);

CREATE INDEX IF NOT EXISTS idx_skill_approval_pending ON exo_skill_approval_requests(tenant_id, status)
  WHERE status IN ('pending', 'channel_1_confirmed');

-- RLS Policies
ALTER TABLE exo_generated_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_skill_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_skill_approval_requests ENABLE ROW LEVEL SECURITY;

-- Users can only see their own skills
CREATE POLICY "Users see own skills" ON exo_generated_skills
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users see own skill versions" ON exo_skill_versions
  FOR SELECT USING (
    skill_id IN (SELECT id FROM exo_generated_skills WHERE tenant_id = auth.uid())
  );

CREATE POLICY "Users see own execution logs" ON exo_skill_execution_log
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users see own approval requests" ON exo_skill_approval_requests
  FOR SELECT USING (tenant_id = auth.uid());

-- Service role can do everything
CREATE POLICY "Service role manages skills" ON exo_generated_skills
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages versions" ON exo_skill_versions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages execution logs" ON exo_skill_execution_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages approval requests" ON exo_skill_approval_requests
  FOR ALL USING (auth.role() = 'service_role');

-- Helper function: Generate confirmation code
CREATE OR REPLACE FUNCTION generate_skill_confirmation_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get active skills for tenant
CREATE OR REPLACE FUNCTION get_active_skills(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  version TEXT,
  capabilities JSONB,
  risk_level TEXT,
  usage_count INTEGER,
  last_used_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.slug,
    s.name,
    s.description,
    s.version,
    s.capabilities,
    s.risk_level,
    s.usage_count,
    s.last_used_at
  FROM exo_generated_skills s
  WHERE s.tenant_id = p_tenant_id
    AND s.approval_status = 'approved'
    AND s.archived_at IS NULL
  ORDER BY s.last_used_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Archive unused skills (run by cron)
CREATE OR REPLACE FUNCTION archive_unused_skills(days_threshold INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  UPDATE exo_generated_skills
  SET archived_at = now(),
      updated_at = now()
  WHERE archived_at IS NULL
    AND approval_status = 'approved'
    AND (
      last_used_at IS NULL AND created_at < now() - (days_threshold || ' days')::INTERVAL
      OR last_used_at < now() - (days_threshold || ' days')::INTERVAL
    );

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION update_skill_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_skill_updated_at
  BEFORE UPDATE ON exo_generated_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_timestamp();

-- Trigger: Increment usage count on execution
CREATE OR REPLACE FUNCTION increment_skill_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE exo_generated_skills
  SET usage_count = usage_count + 1,
      last_used_at = now()
  WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_skill_usage
  AFTER INSERT ON exo_skill_execution_log
  FOR EACH ROW
  EXECUTE FUNCTION increment_skill_usage();

-- Comments for documentation
COMMENT ON TABLE exo_generated_skills IS 'AI-generated skills that implement IModExecutor interface';
COMMENT ON TABLE exo_skill_versions IS 'Version history for rollback support';
COMMENT ON TABLE exo_skill_execution_log IS 'Audit trail of all skill executions';
COMMENT ON TABLE exo_skill_approval_requests IS '2FA approval flow for deploying new skills';
COMMENT ON COLUMN exo_skill_approval_requests.requires_2fa IS 'If true, requires confirmation from 2 different channels';
