-- Fix P1 Event Spam: Broaden dedup index to cover pending + claimed + dispatched
-- Previously only covered status = 'pending', allowing duplicate events after claim.

DROP INDEX IF EXISTS idx_petla_events_dedup;

CREATE UNIQUE INDEX idx_petla_events_dedup
  ON exo_petla_events (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending', 'claimed', 'dispatched');

-- Recreate emit_petla_event with matching ON CONFLICT clause
CREATE OR REPLACE FUNCTION emit_petla_event(
  p_tenant_id UUID, p_event_type TEXT, p_priority SMALLINT DEFAULT 3,
  p_source TEXT DEFAULT 'system', p_payload JSONB DEFAULT '{}',
  p_dedup_key TEXT DEFAULT NULL, p_expires_minutes INTEGER DEFAULT 60
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_event_id UUID;
BEGIN
  INSERT INTO exo_petla_events (tenant_id, event_type, priority, source, payload, dedup_key, expires_at)
  VALUES (p_tenant_id, p_event_type, p_priority, p_source, p_payload, p_dedup_key,
    CASE WHEN p_expires_minutes > 0 THEN now() + (p_expires_minutes || ' minutes')::interval ELSE NULL END)
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending', 'claimed', 'dispatched')
  DO NOTHING
  RETURNING id INTO v_event_id;
  UPDATE exo_tenant_loop_config SET last_activity_at = now(), updated_at = now() WHERE tenant_id = p_tenant_id;
  RETURN v_event_id;
END; $$;

-- Cleanup existing duplicate dispatched events (keep newest per dedup_key)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY dedup_key ORDER BY created_at DESC) AS rn
  FROM exo_petla_events WHERE dedup_key IS NOT NULL AND status = 'dispatched'
)
UPDATE exo_petla_events SET status = 'ignored'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
