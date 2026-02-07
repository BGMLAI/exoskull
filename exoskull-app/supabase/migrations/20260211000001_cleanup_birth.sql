-- Mark all already-onboarded tenants as birth-completed.
-- Birth flow replaces legacy onboarding — users who completed old onboarding
-- are treated as if they completed birth (they already have discovery data).
UPDATE exo_tenants
SET iors_birth_completed = true,
    iors_birth_date = COALESCE(onboarding_completed_at, NOW()),
    updated_at = NOW()
WHERE onboarding_status = 'completed'
  AND (iors_birth_completed = false OR iors_birth_completed IS NULL);
