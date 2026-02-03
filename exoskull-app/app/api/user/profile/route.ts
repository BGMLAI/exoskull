import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UserProfile } from '@/lib/types/user'

// Fields that can be updated via PATCH
const UPDATABLE_FIELDS = [
  'preferred_name',
  'age_range',
  'primary_goal',
  'secondary_goals',
  'conditions',
  'communication_style',
  'preferred_channel',
  'morning_checkin_time',
  'evening_checkin_time',
  'checkin_enabled',
  'timezone',
  'language',
] as const

// GET /api/user/profile - Fetch current user's profile
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[API:user/profile] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('exo_tenants')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[API:user/profile] Profile fetch error:', {
        error: profileError.message,
        userId: user.id,
      })
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[API:user/profile] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/user/profile - Update current user's profile
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[API:user/profile] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Filter to only allowed fields
    const updates: Partial<UserProfile> = {}
    for (const field of UPDATABLE_FIELDS) {
      if (field in body) {
        // Type-safe assignment
        (updates as Record<string, unknown>)[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const { data: profile, error: updateError } = await supabase
      .from('exo_tenants')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('[API:user/profile] Update error:', {
        error: updateError.message,
        userId: user.id,
        updates: Object.keys(updates),
      })
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    console.log('[API:user/profile] Profile updated:', {
      userId: user.id,
      fields: Object.keys(updates),
    })

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('[API:user/profile] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
