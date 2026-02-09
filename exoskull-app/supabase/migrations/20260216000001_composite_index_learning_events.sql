-- Composite index for learning_events: tenant_id + event_type + created_at
-- Used by insight-pusher, optimization widget, and IORS loop-tasks
-- Replaces 3 single-column indexes for queries filtering on all 3 columns

CREATE INDEX IF NOT EXISTS idx_learning_tenant_type_created
  ON learning_events(tenant_id, event_type, created_at DESC);
