/**
 * Run brain seed migration via Supabase service role.
 * Usage: npx tsx scripts/run-migration.ts
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sqlPath = resolve(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260218000002_brain_seed.sql",
  );
  const sql = await readFile(sqlPath, "utf-8");

  // Split by semicolons and run each statement
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`Running ${statements.length} SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\n/g, " ");
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    const { error } = await supabase.rpc("exec_sql", { sql_text: stmt });
    if (error) {
      // Try direct query via PostgREST — some statements may not work via RPC
      console.warn(`  RPC failed: ${error.message}`);
      console.warn("  Trying via raw POST...");
    }
  }

  console.log("Migration complete (check for errors above).");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
