-- System Self-Awareness — Inter-component events and health tracking

CREATE TABLE IF NOT EXISTS exo_system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'component_started', 'component_stopped', 'component_error',
    'health_check_passed', 'health_check_failed',
    'circuit_breaker_opened', 'circuit_breaker_closed',
    'integration_degraded', 'integration_recovered',
    'build_completed', 'build_failed',
    'maintenance_completed', 'maintenance_failed',
    'config_changed', 'threshold_exceeded',
    'ralph_cycle_completed', 'cron_completed', 'cron_failed'
  )),
  component TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN (
    'debug', 'info', 'warn', 'error', 'critical'
  )),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::JSONB,
  correlation_id UUID,
  ttl_days INT DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_events_tenant ON exo_system_events(tenant_id, created_at DESC);
CREATE INDEX idx_system_events_type ON exo_system_events(event_type, created_at DESC);
CREATE INDEX idx_system_events_component ON exo_system_events(component, created_at DESC);
CREATE INDEX idx_system_events_severity ON exo_system_events(severity)
  WHERE severity IN ('error', 'critical');
CREATE INDEX idx_system_events_correlation ON exo_system_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE exo_system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage system events" ON exo_system_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION cleanup_system_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM exo_system_events
  WHERE created_at < now() - (ttl_days * interval '1 day');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
