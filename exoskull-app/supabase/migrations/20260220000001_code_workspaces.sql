-- Phase 2: Code Generation Workspaces
-- Tables for multi-model code generation system

-- Workspace metadata (one per generation request)
CREATE TABLE IF NOT EXISTS exo_code_workspaces (
  id TEXT PRIMARY KEY,  -- 'ws-{tenantId}-{timestamp}'
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  model_used TEXT NOT NULL,  -- 'claude-code' | 'kimi-code' | 'gpt-o1-code'
  tech_stack TEXT DEFAULT 'Next.js, Supabase, TailwindCSS',
  features JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'complete', 'failed', 'deployed', 'archived')),
  deployment_url TEXT,
  deployment_platform TEXT
    CHECK (deployment_platform IS NULL OR deployment_platform IN ('vercel', 'railway', 'custom')),
  total_files INT NOT NULL DEFAULT 0,
  total_lines INT NOT NULL DEFAULT 0,
  generation_duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generated files (versioned per workspace)
CREATE TABLE IF NOT EXISTS exo_generated_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES exo_code_workspaces(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,  -- 'typescript', 'sql', 'css', etc.
  operation TEXT NOT NULL DEFAULT 'create'
    CHECK (operation IN ('create', 'modify', 'delete')),
  version INT NOT NULL DEFAULT 1,
  previous_content TEXT,  -- For modify operations
  line_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, file_path, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_code_workspaces_tenant ON exo_code_workspaces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_code_workspaces_status ON exo_code_workspaces(status);
CREATE INDEX IF NOT EXISTS idx_generated_files_workspace ON exo_generated_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_generated_files_tenant ON exo_generated_files(tenant_id);

-- RLS
ALTER TABLE exo_code_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_generated_files ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: users see only their own workspaces
CREATE POLICY "tenant_select_workspaces" ON exo_code_workspaces
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "tenant_insert_workspaces" ON exo_code_workspaces
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "tenant_update_workspaces" ON exo_code_workspaces
  FOR UPDATE USING (tenant_id = auth.uid());

-- Service role full access
CREATE POLICY "service_all_workspaces" ON exo_code_workspaces
  FOR ALL USING (auth.role() = 'service_role');

-- Tenant isolation: users see only their own files
CREATE POLICY "tenant_select_files" ON exo_generated_files
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "tenant_insert_files" ON exo_generated_files
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "tenant_update_files" ON exo_generated_files
  FOR UPDATE USING (tenant_id = auth.uid());

-- Service role full access
CREATE POLICY "service_all_files" ON exo_generated_files
  FOR ALL USING (auth.role() = 'service_role');
