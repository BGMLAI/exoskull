/**
 * GET/POST /api/mods/[slug]/data - CRUD for Mod data
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Fetch recent data entries for a Mod
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = params
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const { data, error } = await supabase
      .from('exo_mod_data')
      .select('*')
      .eq('tenant_id', user.id)
      .eq('mod_slug', slug)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error(`[Mod Data] GET error for ${slug}:`, error)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('[Mod Data] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Add a new data entry for a Mod
export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = params
    const body = await request.json()

    const { data, error } = await supabase
      .from('exo_mod_data')
      .insert({
        tenant_id: user.id,
        mod_slug: slug,
        data: body
      })
      .select()
      .single()

    if (error) {
      console.error(`[Mod Data] POST error for ${slug}:`, error)
      return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
    }

    return NextResponse.json({ success: true, entry: data })
  } catch (error) {
    console.error('[Mod Data] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
