/**
 * Intervention Executor Cron
 *
 * Runs every 15 minutes to:
 * 1. Auto-approve interventions that have passed their timeout
 * 2. Execute approved interventions from the queue
 *
 * Vercel cron: every 15 minutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { processQueue, processTimeouts } from '@/lib/autonomy/executor'

const CRON_SECRET = process.env.CRON_SECRET || 'exoskull-cron-2026'

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret === CRON_SECRET) return true

  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) return true

  return false
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    // Step 1: Auto-approve timed-out interventions
    const autoApproved = await processTimeouts()

    // Step 2: Execute due items from queue
    const queueResult = await processQueue(10)

    const duration = Date.now() - startTime

    console.log('[InterventionExecutor] Cron complete:', {
      autoApproved,
      ...queueResult,
      durationMs: duration,
    })

    return NextResponse.json({
      ok: true,
      autoApproved,
      ...queueResult,
      durationMs: duration,
    })
  } catch (error) {
    console.error('[InterventionExecutor] Cron error:', error)
    return NextResponse.json(
      { error: 'Intervention executor failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
