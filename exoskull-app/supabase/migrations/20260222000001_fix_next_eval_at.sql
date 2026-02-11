-- Fix next_eval_at deadlock: existing tenants have next_eval_at in the future,
-- which means loop-15 never evaluates them (WHERE next_eval_at <= now() returns empty).
-- Set all to now() so they get picked up on the next loop-15 cycle.

UPDATE exo_tenant_loop_config
SET next_eval_at = now()
WHERE next_eval_at > now() OR next_eval_at IS NULL;
