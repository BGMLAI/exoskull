require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running tasks table migration...');
  
  const sql = fs.readFileSync('supabase/migrations/20260131000004_add_tasks_table.sql', 'utf8');
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration completed!');
    
    // Verify
    const { data: tasks, error: verifyError } = await supabase.from('exo_tasks').select('count');
    if (verifyError) {
      console.log('⚠️ Table created but verification failed:', verifyError.message);
    } else {
      console.log('✅ Table exo_tasks verified and ready');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigration();
