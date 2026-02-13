-- ============================================================================
-- Value Hierarchy — Top-level "Values" for the Tyrolka framework
-- Adds exo_values table and value_id FK on user_loops
-- ============================================================================

-- Table: exo_values (user-defined core values)
CREATE TABLE IF NOT EXISTS exo_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,            -- emoji or lucide icon name
  color TEXT,           -- hex color for UI (#RRGGBB)
  priority INT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),

  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX idx_values_tenant ON exo_values(tenant_id);
CREATE INDEX idx_values_priority ON exo_values(tenant_id, priority DESC);
CREATE INDEX idx_values_active ON exo_values(tenant_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE exo_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own values" ON exo_values
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Users can insert own values" ON exo_values
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update own values" ON exo_values
  FOR UPDATE USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete own custom values" ON exo_values
  FOR DELETE USING (tenant_id = auth.uid() AND is_default = FALSE);

CREATE POLICY "Service can manage all values" ON exo_values
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Extend user_loops with value_id FK
-- ============================================================================

ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS value_id UUID REFERENCES exo_values(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_loops_value ON user_loops(tenant_id, value_id);

-- ============================================================================
-- RPC: create_default_values(p_tenant_id)
-- Creates 5 universal default values for a new tenant
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_values(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO exo_values (tenant_id, name, description, icon, color, priority, is_default)
  VALUES
    (p_tenant_id, 'Zdrowie i Energia',       'Twoje zdrowie fizyczne i psychiczne, energia, sen, ruch',           '💚', '#10B981', 10, TRUE),
    (p_tenant_id, 'Rozwoj i Wiedza',          'Nauka, kariera, kompetencje, samodoskonalenie',                     '📚', '#8B5CF6',  8, TRUE),
    (p_tenant_id, 'Relacje i Wspolnota',      'Rodzina, przyjaciele, partnerstwo, spolecznosc',                    '💛', '#EC4899',  9, TRUE),
    (p_tenant_id, 'Wolnosc i Niezaleznosc',   'Finanse, niezaleznosc, bezpieczenstwo, autonomia',                 '🦅', '#F59E0B',  7, TRUE),
    (p_tenant_id, 'Tworczosc i Ekspresja',    'Kreatywnosc, sztuka, rozrywka, samowrazenie',                      '🎨', '#F472B6',  6, TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$;

-- ============================================================================
-- RPC: link_default_values_to_loops(p_tenant_id)
-- Auto-links existing default loops to their matching values
-- ============================================================================

CREATE OR REPLACE FUNCTION link_default_values_to_loops(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health_id UUID;
  v_rozwoj_id UUID;
  v_relacje_id UUID;
  v_wolnosc_id UUID;
  v_tworczosc_id UUID;
BEGIN
  -- Get value IDs
  SELECT id INTO v_health_id FROM exo_values
    WHERE tenant_id = p_tenant_id AND name = 'Zdrowie i Energia' LIMIT 1;
  SELECT id INTO v_rozwoj_id FROM exo_values
    WHERE tenant_id = p_tenant_id AND name = 'Rozwoj i Wiedza' LIMIT 1;
  SELECT id INTO v_relacje_id FROM exo_values
    WHERE tenant_id = p_tenant_id AND name = 'Relacje i Wspolnota' LIMIT 1;
  SELECT id INTO v_wolnosc_id FROM exo_values
    WHERE tenant_id = p_tenant_id AND name = 'Wolnosc i Niezaleznosc' LIMIT 1;
  SELECT id INTO v_tworczosc_id FROM exo_values
    WHERE tenant_id = p_tenant_id AND name = 'Tworczosc i Ekspresja' LIMIT 1;

  -- Link loops to values (only if value exists and loop has no value yet)
  UPDATE user_loops SET value_id = v_health_id
    WHERE tenant_id = p_tenant_id AND slug IN ('health', 'fun') AND value_id IS NULL;

  UPDATE user_loops SET value_id = v_rozwoj_id
    WHERE tenant_id = p_tenant_id AND slug IN ('growth', 'work') AND value_id IS NULL;

  UPDATE user_loops SET value_id = v_relacje_id
    WHERE tenant_id = p_tenant_id AND slug = 'relationships' AND value_id IS NULL;

  UPDATE user_loops SET value_id = v_wolnosc_id
    WHERE tenant_id = p_tenant_id AND slug = 'finance' AND value_id IS NULL;

  UPDATE user_loops SET value_id = v_tworczosc_id
    WHERE tenant_id = p_tenant_id AND slug = 'creativity' AND value_id IS NULL;
END;
$$;
