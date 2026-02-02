import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/onboarding/complete - Mark onboarding as completed
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = await request.json()

    // Update tenant status
    const { error: updateError } = await supabase
      .from('exo_tenants')
      .update({
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[Complete API] Error updating status:', updateError)
      return NextResponse.json({ error: 'Failed to complete' }, { status: 500 })
    }

    // Log onboarding session
    if (conversationId) {
      await supabase.from('exo_onboarding_sessions').insert({
        tenant_id: user.id,
        step: 1,
        step_name: 'discovery',
        completed_at: new Date().toISOString(),
        conversation_id: conversationId,
        data: { method: 'conversation' }
      })
    }

    // Schedule first check-in if morning time was set
    const { data: tenant } = await supabase
      .from('exo_tenants')
      .select('morning_checkin_time, preferred_name, checkin_enabled')
      .eq('id', user.id)
      .single()

    if (tenant?.checkin_enabled && tenant?.morning_checkin_time) {
      // Create morning check-in job preference
      const { data: morningJob } = await supabase
        .from('exo_scheduled_jobs')
        .select('id')
        .eq('job_name', 'morning_checkin')
        .single()

      if (morningJob) {
        await supabase.from('exo_user_job_preferences').upsert({
          tenant_id: user.id,
          job_id: morningJob.id,
          enabled: true,
          preferred_time: tenant.morning_checkin_time,
          custom_message: `Cześć ${tenant.preferred_name || ''}! Jak się dziś czujesz?`
        })
      }
    }

    console.log('[Complete API] Onboarding completed for user:', user.id)

    return NextResponse.json({
      success: true,
      redirectTo: '/dashboard'
    })
  } catch (error) {
    console.error('[Complete API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
