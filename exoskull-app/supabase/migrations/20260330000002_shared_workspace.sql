-- Shared Workspace: Virtual browser sessions, panels, collaboration
-- Architecture: Chrome on VPS + CDP + WebRTC live stream

-- ============================================================================
-- WORKSPACE SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_workspace_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  -- Session state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),

  -- Browser state
  browser_url TEXT,                    -- Current URL in virtual browser
  browser_title TEXT,                  -- Current page title
  browser_screenshot_url TEXT,         -- Latest screenshot (R2 presigned URL)

  -- VPS connection
  vps_container_id TEXT,              -- Docker container ID on VPS
  cdp_endpoint TEXT,                  -- Chrome DevTools Protocol endpoint (ws://...)
  webrtc_offer JSONB,                -- WebRTC SDP offer for live view
  webrtc_answer JSONB,               -- WebRTC SDP answer from client

  -- Collaboration
  shared_with UUID[],                 -- Other tenant IDs with access
  control_mode TEXT NOT NULL DEFAULT 'ai' CHECK (control_mode IN ('ai', 'user', 'shared')),

  -- Panels configuration
  panels JSONB NOT NULL DEFAULT '[]', -- Array of {type, title, url, content, position}

  -- Terminal
  terminal_enabled BOOLEAN NOT NULL DEFAULT false,
  terminal_output TEXT,               -- Last terminal output buffer

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- ============================================================================
-- WORKSPACE ACTIONS LOG (what AI/user did in workspace)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_workspace_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exo_workspace_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  actor TEXT NOT NULL DEFAULT 'ai' CHECK (actor IN ('ai', 'user', 'system')),
  action_type TEXT NOT NULL, -- 'navigate', 'click', 'type', 'screenshot', 'scroll', 'terminal_cmd', 'open_panel', 'close_panel'

  -- Action details
  target TEXT,               -- CSS selector, URL, panel ID
  value TEXT,                -- Input text, command, etc.
  result TEXT,               -- Action result/output
  screenshot_url TEXT,       -- Screenshot after action

  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- WORKSPACE PANELS (expandable content from chat)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_workspace_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exo_workspace_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  panel_type TEXT NOT NULL CHECK (panel_type IN (
    'browser',      -- Virtual browser iframe/WebRTC
    'document',     -- Document preview (PDF, MD, etc.)
    'terminal',     -- VPS terminal
    'dashboard',    -- AI-generated dashboard
    'code',         -- Code editor
    'visualization',-- Charts, graphs
    'link_preview', -- Expanded link from chat
    'file_preview', -- File content preview
    'custom'        -- AI-generated HTML/React widget
  )),

  title TEXT NOT NULL,
  content TEXT,              -- HTML content, markdown, code, etc.
  url TEXT,                  -- URL for browser/link panels
  position JSONB DEFAULT '{"x": 0, "y": 0, "w": 6, "h": 4}', -- Grid position
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_visible BOOLEAN NOT NULL DEFAULT true,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_tenant ON exo_workspace_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_status ON exo_workspace_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_actions_session ON exo_workspace_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_workspace_panels_session ON exo_workspace_panels(session_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE exo_workspace_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_workspace_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_workspace_panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_workspace_sessions" ON exo_workspace_sessions FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_workspace_actions" ON exo_workspace_actions FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_workspace_panels" ON exo_workspace_panels FOR ALL
  USING (true) WITH CHECK (true);
