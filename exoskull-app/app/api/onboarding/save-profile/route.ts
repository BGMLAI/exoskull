import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/onboarding/save-profile - Save profile data (VAPI tool callback or direct)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get tenant_id from query params (VAPI tool) or from auth
    const url = new URL(request.url)
    let tenantId = url.searchParams.get('tenant_id')
    const conversationId = url.searchParams.get('conversation_id')

    // If no tenant_id in URL, get from auth
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      tenantId = user.id
    }

    const body = await request.json()

    // Handle VAPI tool call format
    const profileData = body.message?.toolCalls?.[0]?.function?.arguments || body

    console.log('[SaveProfile API] Received data:', {
      tenantId,
      conversationId,
      profileData
    })

    // Build update object
    const updateData: Record<string, any> = {
      onboarding_status: 'in_progress'
    }

    if (profileData.preferred_name) updateData.preferred_name = profileData.preferred_name
    if (profileData.primary_goal) updateData.primary_goal = profileData.primary_goal
    if (profileData.secondary_goals) updateData.secondary_goals = profileData.secondary_goals
    if (profileData.conditions) updateData.conditions = profileData.conditions
    if (profileData.communication_style) updateData.communication_style = profileData.communication_style
    if (profileData.morning_checkin_time) updateData.morning_checkin_time = profileData.morning_checkin_time
    if (profileData.insights) {
      updateData.discovery_data = {
        insights: profileData.insights,
        extracted_at: new Date().toISOString()
      }
    }

    // Update tenant
    const { error: updateError } = await supabase
      .from('exo_tenants')
      .update(updateData)
      .eq('id', tenantId)

    if (updateError) {
      console.error('[SaveProfile API] Error updating tenant:', updateError)
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
    }

    // Save individual insights as extractions
    if (profileData.insights && Array.isArray(profileData.insights)) {
      for (const insight of profileData.insights) {
        await supabase.from('exo_discovery_extractions').insert({
          tenant_id: tenantId,
          conversation_id: conversationId || null,
          extraction_type: 'insight',
          value: insight,
          confidence: 0.9
        })
      }
    }

    console.log('[SaveProfile API] Profile saved successfully for tenant:', tenantId)

    // Return VAPI-compatible response
    return NextResponse.json({
      results: [{
        toolCallId: body.message?.toolCalls?.[0]?.id || 'direct',
        result: {
          success: true,
          message: 'Profil zapisany pomyślnie'
        }
      }]
    })
  } catch (error) {
    console.error('[SaveProfile API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
