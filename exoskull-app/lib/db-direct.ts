// Direct database access using Supabase service role
// Bypasses PostgREST and RLS - use for system queries only
import { createClient } from "@supabase/supabase-js";

// Create admin client with service role (bypasses RLS)
function getAdminClient() {
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

export async function queryDatabase<T = any>(
  table: string,
  query?: {
    select?: string;
    filter?: Record<string, any>;
    order?: { column: string; ascending: boolean };
  },
): Promise<T[]> {
  try {
    let dbQuery = getAdminClient()
      .from(table)
      .select(query?.select || "*");

    if (query?.filter) {
      Object.entries(query.filter).forEach(([key, value]) => {
        dbQuery = dbQuery.eq(key, value);
      });
    }

    if (query?.order) {
      dbQuery = dbQuery.order(query.order.column, {
        ascending: query.order.ascending,
      });
    }

    const { data, error } = await dbQuery;

    if (error) throw error;
    return (data as T[]) || [];
  } catch (error) {
    console.error("Admin query error:", error);
    throw error;
  }
}
