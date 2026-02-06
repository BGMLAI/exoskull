-- Performance indexes for CRON job hot paths
-- Identified during production readiness audit (2026-02-06)

-- master-scheduler: queries active scheduled jobs
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_active
  ON exo_scheduled_jobs(is_active)
  WHERE is_active = true;

-- 5+ CRON jobs filter tenants by subscription status
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status
  ON exo_tenants(subscription_status)
  WHERE subscription_status = 'active';

-- daily-summary: checks messages per tenant per day
CREATE INDEX IF NOT EXISTS idx_unified_messages_tenant_created
  ON exo_unified_messages(tenant_id, created_at DESC);

-- predictions: queries recent health metrics
CREATE INDEX IF NOT EXISTS idx_health_metrics_recorded_at
  ON exo_health_metrics(recorded_at DESC);

-- intervention-executor: queries pending/approved interventions
CREATE INDEX IF NOT EXISTS idx_interventions_tenant_status
  ON exo_interventions(tenant_id, status)
  WHERE status IN ('proposed', 'approved', 'executing');

-- insight-push: queries recent deliveries for dedup
CREATE INDEX IF NOT EXISTS idx_insight_deliveries_tenant_date
  ON exo_insight_deliveries(tenant_id, delivered_at DESC);
