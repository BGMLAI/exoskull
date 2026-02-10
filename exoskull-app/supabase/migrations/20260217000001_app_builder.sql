-- =====================================================
-- App Builder — Generated Apps Registry
-- Stores metadata for AI-generated custom applications
-- =====================================================

-- Main app registry
CREATE TABLE IF NOT EXISTS exo_generated_apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'archived', 'failed')),

  -- Schema definition (what table was created)
  table_name TEXT NOT NULL,          -- e.g. "exo_app_reading_tracker"
  columns JSONB NOT NULL DEFAULT '[]',  -- [{name, type, nullable, default_value, description}]
  indexes JSONB NOT NULL DEFAULT '[]',  -- [{columns, unique}]

  -- UI configuration
  ui_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- {display_columns, form_fields, chart_config, icon, color}
  widget_size JSONB NOT NULL DEFAULT '{"w": 2, "h": 2}'::jsonb,

  -- Generation metadata
  generation_prompt TEXT,            -- Original user request
  generated_by TEXT NOT NULL DEFAULT 'auto-routed',
  generation_model TEXT,
  schema_sql TEXT,                   -- The actual CREATE TABLE SQL that was run
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),

  -- Approval (reuses skill approval pattern)
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revoked')),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejection_reason TEXT,

  -- Lifecycle
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  error_count INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, slug)
);

-- RLS
ALTER TABLE exo_generated_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants see own apps"
  ON exo_generated_apps FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Tenants insert own apps"
  ON exo_generated_apps FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants update own apps"
  ON exo_generated_apps FOR UPDATE
  USING (tenant_id = auth.uid());

-- Service role bypass for IORS/CRON
CREATE POLICY "Service role full access on apps"
  ON exo_generated_apps FOR ALL
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_generated_apps_tenant ON exo_generated_apps(tenant_id);
CREATE INDEX idx_generated_apps_status ON exo_generated_apps(tenant_id, status);
CREATE INDEX idx_generated_apps_slug ON exo_generated_apps(tenant_id, slug);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_generated_apps_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generated_apps_updated
  BEFORE UPDATE ON exo_generated_apps
  FOR EACH ROW EXECUTE FUNCTION update_generated_apps_timestamp();

-- =====================================================
-- Helper: Create dynamic app table with RLS
-- Called by the app builder to create per-app data tables
-- =====================================================
CREATE OR REPLACE FUNCTION create_app_table(
  p_table_name TEXT,
  p_columns JSONB,
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  col JSONB;
  col_name TEXT;
  col_type TEXT;
  col_nullable BOOLEAN;
  col_default TEXT;
  ddl TEXT;
  result JSONB;
BEGIN
  -- Validate table name starts with exo_app_
  IF NOT p_table_name LIKE 'exo_app_%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table name must start with exo_app_');
  END IF;

  -- Validate no SQL injection in table name
  IF p_table_name ~ '[^a-z0-9_]' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table name contains invalid characters');
  END IF;

  -- Build CREATE TABLE DDL
  ddl := format('CREATE TABLE IF NOT EXISTS %I (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()', p_table_name);

  -- Add custom columns
  FOR col IN SELECT * FROM jsonb_array_elements(p_columns) LOOP
    col_name := col->>'name';
    col_type := col->>'type';
    col_nullable := COALESCE((col->>'nullable')::boolean, true);
    col_default := col->>'default_value';

    -- Validate column name
    IF col_name ~ '[^a-z0-9_]' THEN
      RETURN jsonb_build_object('success', false, 'error', format('Column name %s contains invalid characters', col_name));
    END IF;

    -- Validate column type (whitelist)
    IF col_type NOT IN ('text', 'integer', 'bigint', 'numeric', 'boolean', 'date', 'timestamptz', 'jsonb', 'uuid', 'real', 'double precision') THEN
      RETURN jsonb_build_object('success', false, 'error', format('Column type %s not allowed', col_type));
    END IF;

    ddl := ddl || format(', %I %s', col_name, col_type);

    IF NOT col_nullable THEN
      ddl := ddl || ' NOT NULL';
    END IF;

    IF col_default IS NOT NULL THEN
      -- Only allow safe defaults
      IF col_default IN ('now()', 'true', 'false', '0', '''''', 'gen_random_uuid()') THEN
        ddl := ddl || format(' DEFAULT %s', col_default);
      END IF;
    END IF;
  END LOOP;

  ddl := ddl || ')';

  -- Execute DDL
  EXECUTE ddl;

  -- Enable RLS
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table_name);

  -- Create RLS policies
  EXECUTE format(
    'CREATE POLICY "Tenants see own data" ON %I FOR SELECT USING (tenant_id = auth.uid())',
    p_table_name
  );
  EXECUTE format(
    'CREATE POLICY "Tenants insert own data" ON %I FOR INSERT WITH CHECK (tenant_id = auth.uid())',
    p_table_name
  );
  EXECUTE format(
    'CREATE POLICY "Tenants update own data" ON %I FOR UPDATE USING (tenant_id = auth.uid())',
    p_table_name
  );
  EXECUTE format(
    'CREATE POLICY "Service role full access" ON %I FOR ALL USING (auth.role() = ''service_role'')',
    p_table_name
  );

  -- Create tenant index
  EXECUTE format('CREATE INDEX idx_%s_tenant ON %I(tenant_id)', replace(p_table_name, 'exo_app_', ''), p_table_name);

  -- Create updated_at trigger
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_generated_apps_timestamp()',
    replace(p_table_name, 'exo_app_', ''),
    p_table_name
  );

  RETURN jsonb_build_object('success', true, 'table_name', p_table_name);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
