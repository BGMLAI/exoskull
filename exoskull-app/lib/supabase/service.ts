/**
 * Service-role Supabase client factory.
 *
 * Use this for server-side operations that need to bypass RLS
 * (CRON jobs, webhooks, internal API calls).
 *
 * For user-scoped operations, use `lib/supabase/server.ts` instead.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
