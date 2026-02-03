/**
 * Twilio Outbound Call API
 *
 * Initiates outbound calls to users.
 * Used for:
 * - Test calls from dashboard
 * - Scheduled check-ins (CRON)
 * - Intervention calls
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { makeOutboundCall } from '@/lib/voice/twilio-client'

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://exoskull.xyz'

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ============================================================================
// TYPES
// ============================================================================

interface OutboundCallRequest {
  phone?: string // Phone number to call (optional if tenantId provided)
  tenantId?: string // Lookup phone from tenant
  purpose?: 'test' | 'checkin' | 'intervention' | 'custom'
  message?: string // Custom message for the call
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body: OutboundCallRequest = await req.json()
    const { phone, tenantId, purpose = 'test' } = body

    console.log('[Twilio Outbound] Request:', { phone, tenantId, purpose })

    // Resolve phone number
    let targetPhone = phone

    if (!targetPhone && tenantId) {
      const supabase = getSupabase()
      const { data: tenant } = await supabase
        .from('exo_tenants')
        .select('phone')
        .eq('id', tenantId)
        .single()

      if (!tenant?.phone) {
        return NextResponse.json(
          { error: 'Tenant phone number not found' },
          { status: 400 }
        )
      }

      targetPhone = tenant.phone
    }

    if (!targetPhone) {
      return NextResponse.json(
        { error: 'Phone number required (provide phone or tenantId)' },
        { status: 400 }
      )
    }

    // Initiate outbound call
    const result = await makeOutboundCall({
      to: targetPhone,
      webhookUrl: `${APP_URL}/api/twilio/voice?action=start`,
      statusCallbackUrl: `${APP_URL}/api/twilio/status`,
      timeout: 30
    })

    console.log('[Twilio Outbound] Call initiated:', {
      callSid: result.callSid,
      to: targetPhone,
      purpose
    })

    // Pre-create session in database
    if (tenantId) {
      const supabase = getSupabase()
      await supabase.from('exo_voice_sessions').insert({
        call_sid: result.callSid,
        tenant_id: tenantId,
        status: 'active',
        messages: [],
        started_at: new Date().toISOString(),
        metadata: {
          direction: 'outbound',
          purpose
        }
      })
    }

    return NextResponse.json({
      success: true,
      callSid: result.callSid,
      status: result.status,
      to: targetPhone
    })
  } catch (error) {
    console.error('[Twilio Outbound] Error:', error)

    const message = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { error: `Failed to initiate call: ${message}` },
      { status: 500 }
    )
  }
}

// Test endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Twilio Outbound Call API',
    usage: {
      method: 'POST',
      body: {
        phone: '+48123456789 (optional if tenantId provided)',
        tenantId: 'uuid (optional)',
        purpose: 'test | checkin | intervention | custom'
      }
    }
  })
}
