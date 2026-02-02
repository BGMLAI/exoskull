-- Voice Sessions Table
-- Stores conversation state for Twilio voice calls
-- Used by HTTP turn-by-turn voice pipeline

-- ============================================================================
-- TABLE: exo_voice_sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Twilio call identifier (unique per call)
  call_sid TEXT UNIQUE NOT NULL,

  -- Link to tenant (user)
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Session status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended')),

  -- Conversation history (array of {role, content} objects)
  messages JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,

  -- Additional metadata (direction, duration, final_status, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Standard timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_voice_sessions_call_sid
  ON exo_voice_sessions(call_sid);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_tenant
  ON exo_voice_sessions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_status
  ON exo_voice_sessions(status);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_started
  ON exo_voice_sessions(started_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE exo_voice_sessions ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for API routes)
CREATE POLICY "Service role full access on voice_sessions"
  ON exo_voice_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own sessions
CREATE POLICY "Users can view own voice sessions"
  ON exo_voice_sessions
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_voice_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS voice_sessions_updated_at ON exo_voice_sessions;
CREATE TRIGGER voice_sessions_updated_at
  BEFORE UPDATE ON exo_voice_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_voice_sessions_updated_at();

-- ============================================================================
-- STORAGE BUCKET: voice-audio
-- ============================================================================

-- Create bucket for TTS audio files (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-audio',
  'voice-audio',
  true,  -- Public access for Twilio <Play>
  10485760,  -- 10MB limit
  ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read access for voice audio"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'voice-audio');

CREATE POLICY "Service role upload to voice audio"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'voice-audio');

CREATE POLICY "Service role delete from voice audio"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'voice-audio');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_voice_sessions IS 'Stores voice call sessions with conversation history';
COMMENT ON COLUMN exo_voice_sessions.call_sid IS 'Unique Twilio call identifier';
COMMENT ON COLUMN exo_voice_sessions.messages IS 'Array of {role: user|assistant, content: string}';
COMMENT ON COLUMN exo_voice_sessions.metadata IS 'Additional call data: direction, duration, final_status';
