// Run Exoskull migration programmatically
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvupnwvkzreikurymncs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running Exoskull migration...');

  const migrationPath = path.join(__dirname, '../supabase/migrations/20260131000001_init_exoskull_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    // Split by statement (naive approach - works for this migration)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';
      if (stmt.length < 20) continue; // Skip very short statements

      try {
        await supabase.rpc('exec_sql', { sql: stmt });
        process.stdout.write(`✓ ${i + 1}/${statements.length}\r`);
      } catch (err) {
        console.error(`\n❌ Failed at statement ${i + 1}:`, stmt.substring(0, 100));
        throw err;
      }
    }

    console.log('\n✅ Migration completed successfully!');

    // Verify
    const { data, error } = await supabase.from('agents').select('name');
    if (error) throw error;

    console.log(`\n✅ Verification: Found ${data.length} agents`);
    data.forEach(a => console.log(`  - ${a.name}`));

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
