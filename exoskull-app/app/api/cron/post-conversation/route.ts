/**
 * Post-Conversation CRON Handler
 *
 * Runs every 15 minutes to:
 * - Process unprocessed conversations
 * - Extract highlights
 * - Boost referenced highlights
 *
 * Schedule: every 15 minutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { runSelfUpdate, runDecay } from '@/lib/learning/self-updater'

// ============================================================================
// AUTHENTICATION
// ============================================================================

function validateCronAuth(request: NextRequest): boolean {
  // Check for Vercel CRON secret
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }

  // Check for internal pg_cron call (via service role)
  const serviceKey = request.headers.get('x-service-key')
  if (serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return true
  }

  // Development mode
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  return false
}

// ============================================================================
// GET HANDLER (for Vercel CRON)
// ============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Auth check
  if (!validateCronAuth(request)) {
    console.warn('[PostConversation] Unauthorized CRON attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[PostConversation] Starting CRON job...')

  try {
    // Run the self-update cycle
    const result = await runSelfUpdate()

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      result: {
        conversations_processed: result.conversationsProcessed,
        highlights_added: result.highlightsAdded,
        highlights_boosted: result.highlightsBoosted,
        processing_time_ms: result.processingTimeMs,
      },
    }

    console.log('[PostConversation] CRON completed:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('[PostConversation] CRON failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST HANDLER (for manual triggers)
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Auth check
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'update'

    let result

    switch (action) {
      case 'update':
        result = await runSelfUpdate()
        break
      case 'decay':
        result = await runDecay()
        break
      case 'both':
        const updateResult = await runSelfUpdate()
        const decayResult = await runDecay()
        result = { ...updateResult, ...decayResult }
        break
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      result,
    })
  } catch (error) {
    console.error('[PostConversation] Manual trigger failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
