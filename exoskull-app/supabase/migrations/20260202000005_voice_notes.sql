-- Voice Notes System
-- Voice-first: every thought, task, note can have audio

-- Voice notes table
CREATE TABLE IF NOT EXISTS public.exo_voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Audio file
  audio_path TEXT NOT NULL,
  duration_seconds FLOAT,
  file_size INTEGER,

  -- Transcription
  transcript TEXT,
  transcript_language VARCHAR(10) DEFAULT 'pl',

  -- AI Processing
  summary TEXT,
  extracted_memories JSONB,
  sentiment VARCHAR(20),
  topics TEXT[],

  -- Linking
  linked_task_id UUID REFERENCES exo_tasks(id) ON DELETE SET NULL,
  linked_conversation_id UUID REFERENCES exo_conversations(id) ON DELETE SET NULL,
  context_type VARCHAR(50),

  -- Status
  status VARCHAR(20) DEFAULT 'recording',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voice_notes_tenant ON exo_voice_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_status ON exo_voice_notes(status);
CREATE INDEX IF NOT EXISTS idx_voice_notes_task ON exo_voice_notes(linked_task_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_created ON exo_voice_notes(created_at DESC);

-- RLS
ALTER TABLE exo_voice_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own voice notes" ON exo_voice_notes;
CREATE POLICY "Users can manage own voice notes"
  ON exo_voice_notes FOR ALL
  USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Service role full access voice notes" ON exo_voice_notes;
CREATE POLICY "Service role full access voice notes"
  ON exo_voice_notes FOR ALL
  USING (auth.role() = 'service_role');

-- Link tasks to voice notes
ALTER TABLE exo_tasks
ADD COLUMN IF NOT EXISTS voice_note_id UUID REFERENCES exo_voice_notes(id) ON DELETE SET NULL;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-notes',
  'voice-notes',
  false,
  52428800,
  ARRAY['audio/webm', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "Users upload own voice notes storage" ON storage.objects;
CREATE POLICY "Users upload own voice notes storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users view own voice notes storage" ON storage.objects;
CREATE POLICY "Users view own voice notes storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own voice notes storage" ON storage.objects;
CREATE POLICY "Users delete own voice notes storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Service voice notes storage" ON storage.objects;
CREATE POLICY "Service voice notes storage"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'voice-notes');