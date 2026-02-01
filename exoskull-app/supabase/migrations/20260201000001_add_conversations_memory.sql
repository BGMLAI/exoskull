-- Conversation memory system for ExoSkull voice agent
-- Stores all conversations and messages for total recall

-- Conversations table - one record per voice session
CREATE TABLE IF NOT EXISTS public.exo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Metadata
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Context
  context JSONB DEFAULT '{}', -- {mood: "tired", energy: 6, location: "home"}
  summary TEXT, -- AI-generated summary after conversation
  insights TEXT[], -- Key insights extracted from conversation

  -- Stats
  message_count INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  agent_messages INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table - every message in every conversation
CREATE TABLE IF NOT EXISTS public.exo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.exo_conversations(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.exo_tenants(id) ON DELETE CASCADE NOT NULL,

  -- Message content
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,

  -- Metadata
  timestamp TIMESTAMP DEFAULT NOW(),
  duration_ms INTEGER, -- How long user/agent spoke

  -- Audio metadata (optional)
  audio_url TEXT,
  transcription_confidence FLOAT,

  -- Context at message time
  context JSONB DEFAULT '{}', -- {emotion: "stressed", energy: 4}

  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.exo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exo_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can manage their own conversations" ON public.exo_conversations;
CREATE POLICY "Users can manage their own conversations"
  ON public.exo_conversations FOR ALL
  USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own messages" ON public.exo_messages;
CREATE POLICY "Users can manage their own messages"
  ON public.exo_messages FOR ALL
  USING (tenant_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON public.exo_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON public.exo_conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.exo_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.exo_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON public.exo_messages(timestamp);

-- Auto-update timestamp trigger for conversations
CREATE OR REPLACE FUNCTION update_exo_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exo_conversations_updated_at ON public.exo_conversations;
CREATE TRIGGER trigger_update_exo_conversations_updated_at
  BEFORE UPDATE ON public.exo_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_exo_conversations_updated_at();

-- Function to get conversation history (last N messages)
CREATE OR REPLACE FUNCTION get_conversation_history(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  conversation_id UUID,
  role TEXT,
  content TEXT,
  timestamp TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.conversation_id,
    m.role,
    m.content,
    m.timestamp
  FROM public.exo_messages m
  WHERE m.tenant_id = p_tenant_id
  ORDER BY m.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get last conversation summary
CREATE OR REPLACE FUNCTION get_last_conversation_info(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  started_at TIMESTAMP,
  summary TEXT,
  insights TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.started_at,
    c.summary,
    c.insights
  FROM public.exo_conversations c
  WHERE c.tenant_id = p_tenant_id
  ORDER BY c.started_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.exo_conversations IS 'Voice conversation sessions';
COMMENT ON TABLE public.exo_messages IS 'All messages from voice conversations';
