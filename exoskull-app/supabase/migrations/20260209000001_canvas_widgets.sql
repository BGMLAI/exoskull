-- ============================================================================
-- CANVAS WIDGET SYSTEM — Sprint 2
-- Migration: 20260209000001
-- Description: Per-tenant customizable dashboard widget grid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS exo_canvas_widgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT,
  mod_slug TEXT,

  -- Grid position (react-grid-layout compatible: x, y, w, h)
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  size_w INTEGER NOT NULL DEFAULT 2,
  size_h INTEGER NOT NULL DEFAULT 2,
  min_w INTEGER DEFAULT 1,
  min_h INTEGER DEFAULT 1,

  -- Behavior
  config JSONB DEFAULT '{}'::jsonb,
  visible BOOLEAN DEFAULT TRUE,
  pinned BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'user_added'
    CHECK (created_by IN ('iors_proposed', 'user_added', 'mod_default', 'system_default')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_canvas_widgets_tenant
  ON exo_canvas_widgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canvas_widgets_tenant_visible
  ON exo_canvas_widgets(tenant_id, visible) WHERE visible = TRUE;

-- Prevent duplicate non-mod widgets per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_widgets_unique_type
  ON exo_canvas_widgets(tenant_id, widget_type)
  WHERE widget_type NOT LIKE 'dynamic_mod:%';

-- RLS
ALTER TABLE exo_canvas_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own canvas widgets"
  ON exo_canvas_widgets FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role full access canvas widgets"
  ON exo_canvas_widgets FOR ALL
  USING (auth.role() = 'service_role');
