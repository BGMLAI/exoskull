import { createClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client with service role key (bypasses RLS).
 * Use only for server-side system operations.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
