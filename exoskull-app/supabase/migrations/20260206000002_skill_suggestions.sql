-- =====================================================
-- Skill Suggestions Table
-- Stores proactive skill suggestions from need detection
-- =====================================================

CREATE TABLE IF NOT EXISTS exo_skill_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('request_parse', 'pattern_match', 'gap_detection')),
  description TEXT NOT NULL,
  suggested_slug TEXT,
  life_area TEXT,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT,
  conversation_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'generated', 'expired')),
  generated_skill_id UUID REFERENCES exo_generated_skills(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_skill_suggestions_tenant_status ON exo_skill_suggestions(tenant_id, status, confidence DESC);
CREATE INDEX idx_skill_suggestions_created ON exo_skill_suggestions(created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_skill_suggestion_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_skill_suggestion_updated
  BEFORE UPDATE ON exo_skill_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_suggestion_timestamp();

-- RLS
ALTER TABLE exo_skill_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own suggestions
CREATE POLICY "Users can view own suggestions"
  ON exo_skill_suggestions FOR SELECT
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE user_id = auth.uid()
  ));

-- Users can update own suggestions (accept/reject)
CREATE POLICY "Users can update own suggestions"
  ON exo_skill_suggestions FOR UPDATE
  USING (tenant_id IN (
    SELECT id FROM exo_tenants WHERE user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT id FROM exo_tenants WHERE user_id = auth.uid()
  ));

-- Service role can do everything
CREATE POLICY "Service role full access suggestions"
  ON exo_skill_suggestions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Helper: Get pending suggestions for tenant
CREATE OR REPLACE FUNCTION get_pending_skill_suggestions(p_tenant_id UUID, p_limit INT DEFAULT 5)
RETURNS SETOF exo_skill_suggestions
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM exo_skill_suggestions
  WHERE tenant_id = p_tenant_id
    AND status = 'pending'
    AND created_at > now() - INTERVAL '14 days'
  ORDER BY confidence DESC, created_at DESC
  LIMIT p_limit;
$$;

-- Helper: Expire old suggestions
CREATE OR REPLACE FUNCTION expire_old_skill_suggestions(days_threshold INT DEFAULT 14)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INT;
BEGIN
  UPDATE exo_skill_suggestions
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - (days_threshold || ' days')::INTERVAL;

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
