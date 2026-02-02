-- ============================================================================
-- MEMORY HIGHLIGHTS (ExoSkull Nice-to-Have)
-- ============================================================================
-- Auto-generated user highlights for fast context loading
-- Similar to OpenClaw's MEMORY.md but stored in DB
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_memory_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Category of highlight
  category TEXT NOT NULL CHECK (category IN ('preference', 'pattern', 'goal', 'insight', 'relationship')),

  -- The actual highlight content
  content TEXT NOT NULL,

  -- Importance score (1-10) - higher = more relevant
  importance INT NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),

  -- How was this highlight created
  source TEXT NOT NULL DEFAULT 'conversation' CHECK (source IN ('conversation', 'analysis', 'explicit')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = never expires

  -- Prevent duplicates
  UNIQUE(user_id, category, content)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_highlights_user ON user_memory_highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_importance ON user_memory_highlights(user_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_highlights_category ON user_memory_highlights(user_id, category);

-- RLS
ALTER TABLE user_memory_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own highlights"
  ON user_memory_highlights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own highlights"
  ON user_memory_highlights FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access highlights"
  ON user_memory_highlights FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Comments
COMMENT ON TABLE user_memory_highlights IS 'Curated user highlights for fast context loading (ExoSkull memory system)';
COMMENT ON COLUMN user_memory_highlights.importance IS 'Higher = more relevant, used for sorting (1-10)';
