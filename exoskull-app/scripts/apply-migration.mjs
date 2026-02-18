#!/usr/bin/env node
/**
 * Apply pending migration to Supabase via direct Postgres connection.
 * Run: op run --env-file=.env.local -- node scripts/apply-migration.mjs
 */
import pg from "pg";
const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL/POSTGRES_URL/DIRECT_URL found in env");
  process.exit(1);
}

console.log("Connecting to Supabase Postgres...");
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await pool.query(`
    ALTER TABLE exo_rig_sync_log
      ADD COLUMN IF NOT EXISTS connection_id UUID,
      ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS error TEXT,
      ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  `);
  console.log("Columns added.");

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sync_log_connection ON exo_rig_sync_log(connection_id);`);
  console.log("Index created.");

  // Verify
  const { rows } = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'exo_rig_sync_log' ORDER BY ordinal_position;
  `);
  console.log("\nexo_rig_sync_log columns:");
  for (const r of rows) console.log(`  ${r.column_name}: ${r.data_type}`);

  console.log("\nMigration applied successfully!");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
