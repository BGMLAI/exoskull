-- ============================================================================
-- KNOWLEDGE ARCHITECTURE (Teoria Tyrolki)
-- ============================================================================
-- Framework: Self-Image = (Ja × Nie-Ja) + Main Objective
--                       = (Experience × Research) + Objectives
-- ============================================================================

-- ============================================================================
-- NOTE TYPES
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE note_type AS ENUM (
    'text',      -- Plain text notes, thoughts
    'image',     -- Photos, screenshots, scans
    'audio',     -- Voice memos, recordings
    'video',     -- Clips, screen recordings
    'url',       -- Links, bookmarks, articles
    'social',    -- Social media posts, reels, stories
    'message',   -- Email, SMS, chat, DM
    'document',  -- PDF, Word, Slides
    'code'       -- Code snippets, repo links
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- LOOPS (Areas/Domains of Life)
-- Top-level organization - areas of attention
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  slug TEXT NOT NULL,             -- health, work, relationships, etc.
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,                      -- Emoji or icon name
  color TEXT,                     -- Hex color for UI

  -- Attention tracking
  priority INT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  last_activity_at TIMESTAMPTZ,
  attention_score DECIMAL(4,2),   -- AI-calculated: needs attention?

  -- Config
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE, -- System-created loop

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

-- ============================================================================
-- CAMPAIGNS (Major Initiatives)
-- Groups of Quests working toward a big objective
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  vision TEXT,                    -- Why this campaign exists
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

  -- Link to Objectives (MITs)
  objective_ids UUID[],           -- References user_mits

  -- Primary loop
  loop_slug TEXT,

  -- Dates
  start_date DATE,
  target_date DATE,

  -- Progress (computed)
  total_quests INT DEFAULT 0,
  completed_quests INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- QUESTS (Projects)
-- Groups of related Ops
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES user_campaigns(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),

  -- Organization
  loop_slug TEXT,                 -- Primary area

  -- Progress
  target_ops INT,
  completed_ops INT DEFAULT 0,

  -- Dates
  start_date DATE,
  deadline TIMESTAMPTZ,

  -- Metadata
  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- OPS (Tasks/Missions)
-- First level of organization - actionable items
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'dropped', 'blocked')),

  -- Priority & scheduling
  priority INT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  due_date TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,      -- When to work on it

  -- Effort estimation
  estimated_effort INT CHECK (estimated_effort >= 1 AND estimated_effort <= 10),
  actual_effort INT CHECK (actual_effort >= 1 AND actual_effort <= 10),

  -- Organization
  loop_slug TEXT,
  tags TEXT[],

  -- Recurrence
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,           -- RRULE format

  -- Completion
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NOTES (Universal content container)
-- The "sea of mixing" - all formats of digital content
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Content
  type note_type NOT NULL,
  title TEXT,
  content TEXT,                    -- For text, or transcription for media
  media_url TEXT,                  -- For media files (R2 storage)
  source_url TEXT,                 -- For URLs, social media links
  metadata JSONB DEFAULT '{}'::JSONB, -- Type-specific data

  -- Organization
  op_id UUID REFERENCES user_ops(id) ON DELETE SET NULL,
  quest_id UUID REFERENCES user_quests(id) ON DELETE SET NULL,
  loop_slug TEXT,
  tags TEXT[],

  -- Classification (Tyrolka)
  is_research BOOLEAN DEFAULT FALSE,   -- World knowledge (Nie-Ja)
  is_experience BOOLEAN DEFAULT FALSE, -- Self knowledge (Ja)

  -- AI Processing
  embedding vector(1536),              -- For semantic search
  ai_summary TEXT,
  ai_tags TEXT[],
  ai_category TEXT,
  processed_at TIMESTAMPTZ,

  -- Source tracking
  source_type TEXT,               -- 'voice', 'sms', 'web', 'import', 'manual'
  source_id TEXT,                 -- Conversation ID, message ID, etc.

  -- Dates
  captured_at TIMESTAMPTZ DEFAULT NOW(), -- When content was created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Loops
CREATE INDEX IF NOT EXISTS idx_loops_tenant ON user_loops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loops_slug ON user_loops(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_loops_attention ON user_loops(tenant_id, attention_score DESC);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON user_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON user_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_loop ON user_campaigns(tenant_id, loop_slug);

-- Quests
CREATE INDEX IF NOT EXISTS idx_quests_tenant ON user_quests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quests_campaign ON user_quests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_quests_status ON user_quests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_loop ON user_quests(tenant_id, loop_slug);
CREATE INDEX IF NOT EXISTS idx_quests_deadline ON user_quests(tenant_id, deadline) WHERE deadline IS NOT NULL;

-- Ops
CREATE INDEX IF NOT EXISTS idx_ops_tenant ON user_ops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ops_quest ON user_ops(quest_id);
CREATE INDEX IF NOT EXISTS idx_ops_status ON user_ops(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ops_priority ON user_ops(tenant_id, priority DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ops_due ON user_ops(tenant_id, due_date) WHERE due_date IS NOT NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ops_loop ON user_ops(tenant_id, loop_slug);

-- Notes
CREATE INDEX IF NOT EXISTS idx_notes_tenant ON user_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON user_notes(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_notes_op ON user_notes(op_id);
CREATE INDEX IF NOT EXISTS idx_notes_quest ON user_notes(quest_id);
CREATE INDEX IF NOT EXISTS idx_notes_loop ON user_notes(tenant_id, loop_slug);
CREATE INDEX IF NOT EXISTS idx_notes_research ON user_notes(tenant_id) WHERE is_research = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_experience ON user_notes(tenant_id) WHERE is_experience = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_captured ON user_notes(tenant_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON user_notes USING GIN(tags);

-- Vector index for semantic search (if pgvector is available)
-- CREATE INDEX IF NOT EXISTS idx_notes_embedding ON user_notes USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE user_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;

-- Loops
CREATE POLICY "Users can view own loops"
  ON user_loops FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own loops"
  ON user_loops FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own loops"
  ON user_loops FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own loops"
  ON user_loops FOR DELETE
  USING (tenant_id = auth.uid() AND is_default = FALSE);

-- Campaigns
CREATE POLICY "Users can view own campaigns"
  ON user_campaigns FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own campaigns"
  ON user_campaigns FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own campaigns"
  ON user_campaigns FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own campaigns"
  ON user_campaigns FOR DELETE
  USING (tenant_id = auth.uid());

-- Quests
CREATE POLICY "Users can view own quests"
  ON user_quests FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own quests"
  ON user_quests FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own quests"
  ON user_quests FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own quests"
  ON user_quests FOR DELETE
  USING (tenant_id = auth.uid());

-- Ops
CREATE POLICY "Users can view own ops"
  ON user_ops FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own ops"
  ON user_ops FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own ops"
  ON user_ops FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own ops"
  ON user_ops FOR DELETE
  USING (tenant_id = auth.uid());

-- Notes
CREATE POLICY "Users can view own notes"
  ON user_notes FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can create own notes"
  ON user_notes FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own notes"
  ON user_notes FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON user_notes FOR DELETE
  USING (tenant_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access loops" ON user_loops FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access campaigns" ON user_campaigns FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access quests" ON user_quests FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access ops" ON user_ops FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access notes" ON user_notes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Create default loops for new tenant
CREATE OR REPLACE FUNCTION create_default_loops(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_loops (tenant_id, slug, name, icon, color, is_default, priority)
  VALUES
    (p_tenant_id, 'health', 'Zdrowie', '🏥', '#10B981', TRUE, 9),
    (p_tenant_id, 'work', 'Praca', '💼', '#3B82F6', TRUE, 8),
    (p_tenant_id, 'relationships', 'Relacje', '👥', '#EC4899', TRUE, 7),
    (p_tenant_id, 'finance', 'Finanse', '💰', '#F59E0B', TRUE, 6),
    (p_tenant_id, 'growth', 'Rozwój', '🌱', '#8B5CF6', TRUE, 5),
    (p_tenant_id, 'creativity', 'Kreatywność', '🎨', '#F472B6', TRUE, 4),
    (p_tenant_id, 'fun', 'Rozrywka', '🎮', '#22D3EE', TRUE, 3)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Get user's Tyrolka context (for system prompt)
CREATE OR REPLACE FUNCTION get_tyrolka_context(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_experience JSONB;
  v_research JSONB;
  v_objectives JSONB;
  v_active_ops JSONB;
  v_active_quests JSONB;
BEGIN
  -- Experience (Ja) - recent highlights about self
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'content', content,
    'category', category,
    'importance', importance
  )), '[]'::JSONB)
  INTO v_experience
  FROM (
    SELECT content, category, importance
    FROM user_memory_highlights
    WHERE user_id = p_tenant_id
      AND is_active = TRUE
    ORDER BY importance DESC, created_at DESC
    LIMIT 10
  ) t;

  -- Research (Nie-Ja) - recent world knowledge notes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'summary', ai_summary,
    'source', source_url
  )), '[]'::JSONB)
  INTO v_research
  FROM (
    SELECT title, ai_summary, source_url
    FROM user_notes
    WHERE tenant_id = p_tenant_id
      AND is_research = TRUE
    ORDER BY captured_at DESC
    LIMIT 5
  ) t;

  -- Objectives (MITs)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'objective', objective,
    'score', score
  )), '[]'::JSONB)
  INTO v_objectives
  FROM user_mits
  WHERE tenant_id = p_tenant_id
  ORDER BY rank;

  -- Active Ops (current tasks)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'priority', priority,
    'due_date', due_date
  )), '[]'::JSONB)
  INTO v_active_ops
  FROM (
    SELECT title, priority, due_date
    FROM user_ops
    WHERE tenant_id = p_tenant_id
      AND status IN ('pending', 'active')
    ORDER BY
      CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN 0 ELSE 1 END,
      priority DESC
    LIMIT 5
  ) t;

  -- Active Quests
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'progress', ROUND(completed_ops::DECIMAL / NULLIF(target_ops, 0) * 100)
  )), '[]'::JSONB)
  INTO v_active_quests
  FROM (
    SELECT title, completed_ops, target_ops
    FROM user_quests
    WHERE tenant_id = p_tenant_id
      AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 3
  ) t;

  RETURN jsonb_build_object(
    'ja', v_experience,
    'nieJa', v_research,
    'objectives', v_objectives,
    'activeOps', v_active_ops,
    'activeQuests', v_active_quests
  );
END;
$$ LANGUAGE plpgsql;

-- Update quest progress when op status changes
CREATE OR REPLACE FUNCTION update_quest_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quest_id IS NOT NULL THEN
    UPDATE user_quests
    SET
      completed_ops = (
        SELECT COUNT(*) FROM user_ops
        WHERE quest_id = NEW.quest_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE id = NEW.quest_id;
  END IF;

  -- Also update old quest if moved
  IF OLD.quest_id IS NOT NULL AND OLD.quest_id != NEW.quest_id THEN
    UPDATE user_quests
    SET
      completed_ops = (
        SELECT COUNT(*) FROM user_ops
        WHERE quest_id = OLD.quest_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE id = OLD.quest_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_quest_progress
  AFTER INSERT OR UPDATE OF status, quest_id ON user_ops
  FOR EACH ROW
  EXECUTE FUNCTION update_quest_progress();

-- Update campaign progress when quest status changes
CREATE OR REPLACE FUNCTION update_campaign_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    UPDATE user_campaigns
    SET
      total_quests = (
        SELECT COUNT(*) FROM user_quests
        WHERE campaign_id = NEW.campaign_id
      ),
      completed_quests = (
        SELECT COUNT(*) FROM user_quests
        WHERE campaign_id = NEW.campaign_id AND status = 'completed'
      ),
      updated_at = NOW()
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_campaign_progress
  AFTER INSERT OR UPDATE OF status, campaign_id ON user_quests
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_progress();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE user_loops IS 'Areas/domains of life (Pętle) - top level organization';
COMMENT ON TABLE user_campaigns IS 'Major initiatives grouping multiple Quests';
COMMENT ON TABLE user_quests IS 'Projects - groups of related Ops';
COMMENT ON TABLE user_ops IS 'Tasks/Missions - first level of actionable organization';
COMMENT ON TABLE user_notes IS 'Universal content container - "morze pomieszania"';
COMMENT ON FUNCTION get_tyrolka_context IS 'Returns user context in Tyrolka framework: Ja × Nie-Ja + Objectives';
