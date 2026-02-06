-- Insight Delivery Tracking
-- Tracks which insights were already pushed to each tenant (prevents repeats).
-- Used by the daily insight-push CRON job.

CREATE TABLE IF NOT EXISTS exo_insight_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,  -- 'exo_interventions' | 'user_memory_highlights' | 'learning_events'
  source_id UUID NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT NOT NULL,
  batch_id UUID,

  UNIQUE(tenant_id, source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_del_tenant
  ON exo_insight_deliveries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_insight_del_date
  ON exo_insight_deliveries(delivered_at DESC);

-- RLS
ALTER TABLE exo_insight_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on insight deliveries"
  ON exo_insight_deliveries
  FOR ALL
  USING (true)
  WITH CHECK (true);
