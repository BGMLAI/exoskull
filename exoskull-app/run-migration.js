const fs = require('fs');
const https = require('https');

// Read env vars
const envContent = fs.readFileSync('.env.local', 'utf8');
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();

if (!serviceKey || !supabaseUrl) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

// Read migration file
const migrationFile = process.argv[2] || 'supabase/migrations/20260131000003_use_public_schema.sql';
console.log(`📄 Reading migration: ${migrationFile}`);
const migration = fs.readFileSync(migrationFile, 'utf8');

// Execute via pg connection string would be better, but let's try REST API first
// Supabase doesn't expose exec_sql via REST by default, so we'll use psql instead

const { exec } = require('child_process');

// Extract DB connection details from Supabase URL
const projectId = supabaseUrl.replace('https://', '').split('.')[0];
const dbHost = `db.${projectId}.supabase.co`;
const dbPort = 5432;
const dbName = 'postgres';
const dbUser = 'postgres';

// We need the DB password, not the service role key
console.log('ℹ️  Note: This requires database password, not service role key');
console.log('ℹ️  Get it from: Supabase Dashboard → Project Settings → Database → Connection String');
console.log('');
console.log('Alternative: Use Supabase Dashboard → SQL Editor and paste migration manually');
console.log('');
console.log('Migration SQL preview:');
console.log('---');
console.log(migration.substring(0, 500) + '...');
console.log('---');
