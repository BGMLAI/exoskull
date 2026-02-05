-- ============================================================================
-- EMOTION INTELLIGENCE — Layer 11 Upgrade
-- Upgrades exo_emotion_log from basic mood tracking to full VAD + crisis system
-- ============================================================================

-- Drop old table (basic schema, no production data worth keeping)
DROP TABLE IF EXISTS exo_emotion_log CASCADE;

-- Recreate with full emotion intelligence schema
CREATE TABLE exo_emotion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Fusion outputs (VAD model)
  primary_emotion TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 0 AND 100),
  secondary_emotions TEXT[] DEFAULT '{}',
  valence DECIMAL(3,2) CHECK (valence BETWEEN -1 AND 1),
  arousal DECIMAL(3,2) CHECK (arousal BETWEEN 0 AND 1),
  dominance DECIMAL(3,2) CHECK (dominance BETWEEN 0 AND 1),
  fusion_confidence DECIMAL(3,2),

  -- Source data
  text_sentiment JSONB NOT NULL,
  voice_features JSONB,       -- Phase 2
  face_detected JSONB,        -- Phase 2

  -- Crisis tracking
  crisis_flags TEXT[] DEFAULT '{}',
  crisis_protocol_triggered BOOLEAN DEFAULT FALSE,
  escalated_to_human BOOLEAN DEFAULT FALSE,

  -- Context
  personality_adapted_to TEXT,
  message_text TEXT NOT NULL
);

-- Performance indexes
CREATE INDEX idx_emo_tenant_time ON exo_emotion_log(tenant_id, created_at DESC);
CREATE INDEX idx_emo_crisis ON exo_emotion_log(tenant_id)
  WHERE array_length(crisis_flags, 1) > 0;

-- RLS
ALTER TABLE exo_emotion_log ENABLE ROW LEVEL SECURITY;

-- Service role (server-side logging)
CREATE POLICY "service_role_all" ON exo_emotion_log
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- EMOTION TREND FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_emotion_trends(
  p_tenant_id UUID,
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  avg_valence DECIMAL,
  avg_arousal DECIMAL,
  avg_intensity DECIMAL,
  dominant_emotion TEXT,
  crisis_count BIGINT,
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.created_at::date AS date,
    ROUND(AVG(el.valence), 2) AS avg_valence,
    ROUND(AVG(el.arousal), 2) AS avg_arousal,
    ROUND(AVG(el.intensity::decimal), 1) AS avg_intensity,
    MODE() WITHIN GROUP (ORDER BY el.primary_emotion) AS dominant_emotion,
    COUNT(*) FILTER (WHERE array_length(el.crisis_flags, 1) > 0) AS crisis_count,
    COUNT(*) AS entry_count
  FROM exo_emotion_log el
  WHERE el.tenant_id = p_tenant_id
    AND el.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY el.created_at::date
  ORDER BY date DESC;
END;
$$;
