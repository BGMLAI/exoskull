/**
 * Code Workspaces Migration
 * Phase 2: Infrastructure for code generation workspaces
 *
 * Tables:
 * - exo_code_workspaces: Per-user code generation workspaces
 * - exo_generated_files: Files generated in each workspace
 */

-- Code Workspaces table
CREATE TABLE IF NOT EXISTS exo_code_workspaces (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  model_used TEXT, -- which model generated this ('claude-code', 'kimi-code', 'gpt-o1-code')
  git_repo_url TEXT,
  deployment_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated Files table
CREATE TABLE IF NOT EXISTS exo_generated_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES exo_code_workspaces(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'create', 'modify', 'delete'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, file_path)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_code_workspaces_tenant ON exo_code_workspaces(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_files_workspace ON exo_generated_files(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_files_tenant ON exo_generated_files(tenant_id, created_at DESC);

-- RLS Policies
ALTER TABLE exo_code_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE exo_generated_files ENABLE ROW LEVEL SECURITY;

-- Workspaces: Users can read/write their own
CREATE POLICY "Users can manage their own workspaces"
  ON exo_code_workspaces
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Files: Users can read/write their own
CREATE POLICY "Users can manage their own files"
  ON exo_generated_files
  FOR ALL
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Updated_at trigger for workspaces
CREATE OR REPLACE FUNCTION update_code_workspace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER code_workspace_updated_at
  BEFORE UPDATE ON exo_code_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_code_workspace_updated_at();

-- Updated_at trigger for files
CREATE OR REPLACE FUNCTION update_generated_file_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generated_file_updated_at
  BEFORE UPDATE ON exo_generated_files
  FOR EACH ROW
  EXECUTE FUNCTION update_generated_file_updated_at();
