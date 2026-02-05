-- ============================================================================
-- MEMORY DIGESTS SYSTEM
-- Best memory on the market: 50+ messages + insights + summaries + search
-- ============================================================================

-- ============================================================================
-- 1. DAILY SUMMARIES (Interactive review with user)
-- ============================================================================
-- System generates daily summary at 21:00
-- User can review, correct, and add information
-- Final version stored for future context

CREATE TABLE IF NOT EXISTS exo_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Date of summary (one per day per tenant)
  summary_date DATE NOT NULL,

  -- AI-generated draft (before user review)
  draft_summary TEXT,

  -- User corrections/additions
  user_corrections JSONB DEFAULT '[]'::jsonb,

  -- Final summary (after user review, or draft if not reviewed)
  final_summary TEXT,

  -- Extracted data points
  mood_score REAL,                    -- Average mood (1-10)
  energy_score REAL,                  -- Average energy (1-10)
  key_events JSONB DEFAULT '[]'::jsonb,       -- Important events
  key_topics TEXT[],                  -- Main topics discussed
  decisions_made JSONB DEFAULT '[]'::jsonb,   -- Decisions/commitments
  tasks_created INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,

  -- Message stats
  message_count INT DEFAULT 0,
  voice_minutes REAL DEFAULT 0,

  -- Review status
  reviewed_at TIMESTAMPTZ,
  review_channel TEXT,                -- voice, sms, web

  -- Vector embedding for semantic search
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One summary per day per tenant
  UNIQUE(tenant_id, summary_date)
);

-- ============================================================================
-- 2. MEMORY DIGESTS (Weekly/Monthly compression)
-- ============================================================================
-- Compressed summaries for long-term context
-- Keep recent messages detailed, older as digests

CREATE TABLE IF NOT EXISTS exo_memory_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Period type
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),

  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- AI-generated narrative summary
  narrative_summary TEXT NOT NULL,

  -- Key extracted data
  key_topics TEXT[],
  key_events JSONB DEFAULT '[]'::jsonb,
  patterns_detected JSONB DEFAULT '[]'::jsonb,
  goals_mentioned JSONB DEFAULT '[]'::jsonb,

  -- Aggregated metrics
  avg_mood REAL,
  avg_energy REAL,
  total_messages INT,
  total_voice_minutes REAL,

  -- Vector embedding for semantic search
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One digest per period per tenant
  UNIQUE(tenant_id, period_type, start_date)
);

-- ============================================================================
-- 3. INDEXES for fast retrieval
-- ============================================================================

-- Daily summaries
CREATE INDEX IF NOT EXISTS idx_daily_summaries_tenant_date
  ON exo_daily_summaries(tenant_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_unreviewed
  ON exo_daily_summaries(tenant_id, reviewed_at)
  WHERE reviewed_at IS NULL;

-- Memory digests
CREATE INDEX IF NOT EXISTS idx_memory_digests_tenant_period
  ON exo_memory_digests(tenant_id, period_type, start_date DESC);

-- Vector search indexes (if pgvector is available)
CREATE INDEX IF NOT EXISTS idx_daily_summaries_embedding
  ON exo_daily_summaries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_digests_embedding
  ON exo_memory_digests USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- 4. RLS Policies
-- ============================================================================

ALTER TABLE exo_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_memory_digests ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access daily_summaries"
  ON exo_daily_summaries FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access memory_digests"
  ON exo_memory_digests FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can view own summaries
CREATE POLICY "Users can view own daily_summaries"
  ON exo_daily_summaries FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can view own memory_digests"
  ON exo_memory_digests FOR SELECT
  USING (tenant_id = auth.uid());

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Get context window for AI (50 recent + digests)
CREATE OR REPLACE FUNCTION get_memory_context(
  p_tenant_id UUID,
  p_recent_count INT DEFAULT 50
)
RETURNS TABLE (
  source TEXT,
  content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  -- Recent messages (last N)
  (SELECT
    'recent_message'::TEXT as source,
    m.role || ': ' || m.content as content,
    m.created_at
  FROM exo_unified_messages m
  WHERE m.tenant_id = p_tenant_id
  ORDER BY m.created_at DESC
  LIMIT p_recent_count)

  UNION ALL

  -- This week's daily summaries
  (SELECT
    'daily_summary'::TEXT as source,
    COALESCE(ds.final_summary, ds.draft_summary) as content,
    ds.created_at
  FROM exo_daily_summaries ds
  WHERE ds.tenant_id = p_tenant_id
    AND ds.summary_date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY ds.summary_date DESC)

  UNION ALL

  -- Last month digest
  (SELECT
    'month_digest'::TEXT as source,
    md.narrative_summary as content,
    md.created_at
  FROM exo_memory_digests md
  WHERE md.tenant_id = p_tenant_id
    AND md.period_type = 'month'
  ORDER BY md.start_date DESC
  LIMIT 1)

  UNION ALL

  -- Top highlights
  (SELECT
    'highlight'::TEXT as source,
    h.category || ': ' || h.content as content,
    h.created_at
  FROM user_memory_highlights h
  WHERE h.user_id = p_tenant_id
  ORDER BY h.importance DESC
  LIMIT 15);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get or create today's daily summary
CREATE OR REPLACE FUNCTION get_or_create_daily_summary(p_tenant_id UUID)
RETURNS UUID AS $$
DECLARE
  v_summary_id UUID;
BEGIN
  SELECT id INTO v_summary_id
  FROM exo_daily_summaries
  WHERE tenant_id = p_tenant_id
    AND summary_date = CURRENT_DATE;

  IF v_summary_id IS NULL THEN
    INSERT INTO exo_daily_summaries (tenant_id, summary_date)
    VALUES (p_tenant_id, CURRENT_DATE)
    RETURNING id INTO v_summary_id;
  END IF;

  RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE exo_daily_summaries IS 'Daily AI-generated summaries that user can review and correct';
COMMENT ON TABLE exo_memory_digests IS 'Compressed weekly/monthly/yearly memory digests for long-term context';
COMMENT ON COLUMN exo_daily_summaries.user_corrections IS 'Array of corrections from user review: [{original, corrected, timestamp}]';
COMMENT ON COLUMN exo_daily_summaries.key_events IS 'Extracted events: [{event, time, sentiment}]';
COMMENT ON FUNCTION get_memory_context IS 'Returns smart context window: 50 recent msgs + week summaries + month digest + highlights';
