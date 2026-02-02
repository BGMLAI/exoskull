import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/onboarding - Get current onboarding status
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tenant, error } = await supabase
      .from('exo_tenants')
      .select(`
        onboarding_status,
        onboarding_step,
        onboarding_completed_at,
        preferred_name,
        primary_goal,
        secondary_goals,
        conditions,
        communication_style,
        preferred_channel,
        morning_checkin_time,
        discovery_data
      `)
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('[Onboarding API] Error fetching status:', error)
      return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
    }

    return NextResponse.json({
      status: tenant?.onboarding_status || 'pending',
      step: tenant?.onboarding_step || 0,
      completedAt: tenant?.onboarding_completed_at,
      profile: {
        preferred_name: tenant?.preferred_name,
        primary_goal: tenant?.primary_goal,
        secondary_goals: tenant?.secondary_goals,
        conditions: tenant?.conditions,
        communication_style: tenant?.communication_style,
        preferred_channel: tenant?.preferred_channel,
        morning_checkin_time: tenant?.morning_checkin_time,
      },
      discoveryData: tenant?.discovery_data
    })
  } catch (error) {
    console.error('[Onboarding API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
