-- ============================================================================
-- PROJECTS TABLE + MESSAGE-TO-TASK LINKING
-- Enables converting messages to tasks and organizing tasks into projects
-- ============================================================================

-- Create projects table
CREATE TABLE IF NOT EXISTS exo_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES exo_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active', -- active, completed, archived
  color TEXT DEFAULT '#6366f1', -- UI color for project badge
  icon TEXT, -- Optional icon identifier
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add linked_task_id to unified messages (for message → task conversion)
ALTER TABLE exo_unified_messages
ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES exo_tasks(id) ON DELETE SET NULL;

-- Add foreign key constraint to exo_tasks.project_id (was declared without constraint)
-- First check if constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'exo_tasks_project_id_fkey'
    AND table_name = 'exo_tasks'
  ) THEN
    ALTER TABLE exo_tasks
    ADD CONSTRAINT exo_tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES exo_projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on projects
ALTER TABLE exo_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can manage their own projects"
  ON exo_projects FOR ALL
  USING (tenant_id = auth.uid());

CREATE POLICY "Service role full access projects"
  ON exo_projects FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exo_projects_tenant ON exo_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exo_projects_status ON exo_projects(status);
CREATE INDEX IF NOT EXISTS idx_unified_messages_linked_task ON exo_unified_messages(linked_task_id);
CREATE INDEX IF NOT EXISTS idx_exo_tasks_project ON exo_tasks(project_id);

-- Auto-update timestamp trigger for projects
CREATE OR REPLACE FUNCTION update_exo_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exo_projects_updated_at ON exo_projects;
CREATE TRIGGER trigger_update_exo_projects_updated_at
  BEFORE UPDATE ON exo_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_exo_projects_updated_at();

-- Comments
COMMENT ON TABLE exo_projects IS 'User projects for organizing tasks';
COMMENT ON COLUMN exo_unified_messages.linked_task_id IS 'Task created from this message (message → task conversion)';
COMMENT ON COLUMN exo_tasks.project_id IS 'Project this task belongs to';
