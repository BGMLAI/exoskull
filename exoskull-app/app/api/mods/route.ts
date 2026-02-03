/**
 * GET /api/mods - List installed Mods for the current user
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('exo_tenant_mods')
      .select(`
        id,
        active,
        installed_at,
        mod:exo_mod_registry (
          id, slug, name, description, icon, category, config
        )
      `)
      .eq('tenant_id', user.id)
      .eq('active', true)

    if (error) {
      console.error('[Mods API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch mods' }, { status: 500 })
    }

    return NextResponse.json({ mods: data || [] })
  } catch (error) {
    console.error('[Mods API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
