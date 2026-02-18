/**
 * Shared helpers for all seed scripts.
 *
 * Provides Supabase client, slugification, and batch upsert utilities.
 * Usage: import { getSupabase, slugify, batchUpsert } from "./seed-helpers";
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000";

export { SYSTEM_TENANT_ID };

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function capitalize(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Batch upsert rows into a table, handling Supabase's row limits.
 * Returns total inserted/updated count.
 */
export async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  batchSize = 50,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict, count: "exact" });

    if (error) {
      console.error(
        `[${table}] Batch ${Math.floor(i / batchSize) + 1} error:`,
        error.message,
      );
    } else {
      total += count ?? batch.length;
    }
  }
  return total;
}
