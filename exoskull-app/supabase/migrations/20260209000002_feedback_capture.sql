-- ============================================================================
-- FEEDBACK CAPTURE — User satisfaction tracking + IORS improvement loop
-- Migration: 20260209000001
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'response_quality',  -- thumbs up/down on specific response
    'personality',       -- IORS tone/style feedback
    'action',           -- feedback on autonomous action
    'feature_request',  -- user wants something new
    'bug_report',       -- something broke
    'general'           -- open-ended
  )),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  message TEXT,
  context JSONB DEFAULT '{}'::jsonb,  -- what triggered the feedback (message_id, tool_name, etc.)
  channel TEXT,                        -- which channel feedback came from
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_time ON exo_feedback(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON exo_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON exo_feedback(tenant_id, rating) WHERE rating IS NOT NULL;

ALTER TABLE exo_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own feedback" ON exo_feedback
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access feedback" ON exo_feedback
  FOR ALL USING (auth.role() = 'service_role');

-- Aggregation view for optimization loop
CREATE OR REPLACE VIEW feedback_summary AS
SELECT
  tenant_id,
  feedback_type,
  COUNT(*) AS total,
  AVG(rating) AS avg_rating,
  COUNT(*) FILTER (WHERE rating >= 4) AS positive,
  COUNT(*) FILTER (WHERE rating <= 2) AS negative,
  MAX(created_at) AS last_feedback
FROM exo_feedback
GROUP BY tenant_id, feedback_type;

COMMENT ON TABLE exo_feedback IS 'User feedback on IORS responses, actions, and behavior';
