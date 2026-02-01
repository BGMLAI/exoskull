// Auto-initialize database tables if they don't exist
import { createClient } from '@/lib/supabase/server'

export async function ensureTablesExist() {
  const supabase = await createClient()

  // Check if exo_agents table exists
  const { data, error } = await supabase
    .from('exo_agents')
    .select('id')
    .limit(1)

  // If table doesn't exist (error), we can't auto-create via REST API
  // User must run SQL manually
  if (error && error.code === 'PGRST002') {
    return {
      exists: false,
      message: 'Tables not initialized. Run quick_setup.sql in Supabase SQL Editor.'
    }
  }

  return { exists: true, message: 'Database ready' }
}
