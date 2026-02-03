-- ============================================================================
-- EMOTION SYSTEM
-- Tracks detected emotions from text, voice, check-ins, and wearables
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_emotion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,
  score FLOAT,
  source TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exo_emotion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own emotions" ON exo_emotion_log
  FOR ALL USING (auth.uid() = tenant_id);

CREATE INDEX IF NOT EXISTS idx_emotion_log_tenant ON exo_emotion_log(tenant_id, created_at DESC);
