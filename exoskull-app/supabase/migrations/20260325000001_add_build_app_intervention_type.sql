-- Add build_app to intervention_type check constraint
-- This allows the autonomy pipeline (MAPE-K → build_app action) to create
-- interventions with type "build_app" directly, rather than requiring
-- the workaround of gap_detection + action_payload.action = "build_app"

ALTER TABLE exo_interventions
  DROP CONSTRAINT IF EXISTS exo_interventions_intervention_type_check;

ALTER TABLE exo_interventions
  ADD CONSTRAINT exo_interventions_intervention_type_check
  CHECK (intervention_type IN (
    'proactive_message',
    'task_creation',
    'task_reminder',
    'schedule_adjustment',
    'health_alert',
    'goal_nudge',
    'pattern_notification',
    'gap_detection',
    'automation_trigger',
    'health_prediction',
    'build_app',
    'custom'
  ));
