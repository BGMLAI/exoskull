-- =====================================================
-- ENABLE RLS ON ALL LEGACY PUBLIC TABLES
-- =====================================================
-- These tables are from earlier development phases and are
-- no longer referenced by the active codebase (which uses exo_* prefix).
-- Enabling RLS + service_role-only policy blocks public API access
-- while keeping backend access intact.
-- =====================================================

-- =====================================================
-- 1. BATCH ENABLE RLS + SERVICE ROLE POLICY
-- =====================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'accountability_goals',
    'consent_management',
    'weekly_summaries',
    'federated_model_updates',
    'on_device_metadata',
    'scheduled_sessions',
    'sent_emails',
    'mood_observations',
    'session_transcripts',
    'safety_logs',
    'bio_core_facts',
    'agent_recommendations',
    'mits',
    'enclave_voice_biomarkers',
    'gratitude_log',
    'calendar_events',
    'enclave_screenshot_samples',
    'sessions',
    'email_interactions',
    'enclave_query_log',
    'memory',
    'exercise_questions',
    'user_context',
    'exercise_steps',
    'exercise_templates',
    'personality_exercises',
    'exercise_programs',
    'program_exercises',
    'exercise_resources',
    'data_deletion_schedule',
    'conversation_embeddings',
    'user_roles',
    'user_research_tier',
    'data_collection_settings',
    'privacy_budget_tracking',
    'research_consent_forms',
    'research_compensation',
    'tasks',
    'decisions',
    'vapi_conversation_history',
    'user_goals',
    'schema_registry',
    'user_profiles',
    'data_events',
    'user_plugin_connections',
    'plugin_registry',
    'encryption_policies',
    'payment_intents',
    'scheduled_calls',
    'therapeutic_exercises',
    'personalities',
    'daily_checkins',
    'users'
  ])
  LOOP
    -- Only process tables that actually exist
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      -- Add service_role full access policy (idempotent)
      BEGIN
        EXECUTE format(
          'CREATE POLICY "service_role_full_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          t, t
        );
      EXCEPTION WHEN duplicate_object THEN
        -- Policy already exists, skip
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- 2. FIX TABLES WITH POLICIES BUT RLS DISABLED
-- =====================================================
-- These already have policies but RLS was never enabled.

ALTER TABLE IF EXISTS public.user_research_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vapi_conversation_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. FIX SECURITY DEFINER VIEWS → SECURITY INVOKER
-- =====================================================
-- SECURITY DEFINER views bypass RLS of the querying user.
-- SECURITY INVOKER enforces the caller's permissions.

DO $$
DECLARE
  v TEXT;
BEGIN
  FOR v IN SELECT unnest(ARRAY[
    'users_decrypted',
    'privacy_budget_status',
    'ghl_user_sync_status',
    'pending_deletions',
    'ghl_sync_errors',
    'active_tier3_participants'
  ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = v
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- DONE
-- =====================================================
-- All legacy public tables now have RLS enabled with service_role access.
-- Public (anon) API access to these tables is blocked.
-- Active exo_* tables were already secured — no changes needed there.
