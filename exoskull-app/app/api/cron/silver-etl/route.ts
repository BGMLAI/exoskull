/**
 * Silver ETL Cron Job
 *
 * Transforms Bronze (R2 Parquet) → Silver (Supabase Postgres).
 * Runs hourly at minute 15 via Vercel Cron (10 min after Bronze ETL).
 *
 * Transformations:
 * - Deduplicate by ID
 * - Validate schema
 * - Parse JSON strings → JSONB
 * - Normalize timestamps to UTC
 */

import { NextRequest, NextResponse } from 'next/server'
import { runSilverETL, getSilverStats } from '@/lib/datalake/silver-etl'
import { checkR2Connection } from '@/lib/storage/r2-client'

const CRON_SECRET = process.env.CRON_SECRET || 'exoskull-cron-2026'

/**
 * Verify cron authorization
 * Accepts: x-cron-secret header OR Authorization: Bearer token
 */
function verifyCronAuth(req: NextRequest): boolean {
  // Method 1: Custom header (for manual testing)
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret === CRON_SECRET) return true

  // Method 2: Vercel Cron (Authorization header)
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) return true

  return false
}

/**
 * POST /api/cron/silver-etl
 * Trigger Silver ETL job
 */
export async function POST(req: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(req)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Valid x-cron-secret header or Authorization bearer token required' },
      { status: 401 }
    )
  }

  console.log(`[Silver ETL] Triggered at ${new Date().toISOString()}`)

  // Check R2 connection first (needed to read Bronze)
  const r2Check = await checkR2Connection()
  if (!r2Check.connected) {
    console.error('[Silver ETL] R2 not connected:', r2Check.error)
    return NextResponse.json({
      error: 'R2 connection failed',
      message: r2Check.error,
      action: 'Configure R2 credentials in environment variables',
    }, { status: 503 })
  }

  try {
    // Run Silver ETL
    const summary = await runSilverETL()

    // Calculate totals
    const totalInserted = summary.results.reduce((sum, r) => sum + r.recordsInserted, 0)
    const successCount = summary.results.filter((r) => r.success).length
    const errorMessages = summary.results
      .filter((r) => r.errors.length > 0)
      .map((r) => ({
        dataType: r.dataType,
        errors: r.errors,
      }))

    return NextResponse.json({
      status: 'completed',
      started_at: summary.startedAt.toISOString(),
      completed_at: summary.completedAt.toISOString(),
      duration_ms: summary.completedAt.getTime() - summary.startedAt.getTime(),
      tenants_processed: summary.tenants.length,
      tenants: summary.tenants,
      results: summary.results.map((r) => ({
        data_type: r.dataType,
        success: r.success,
        records_processed: r.recordsProcessed,
        records_inserted: r.recordsInserted,
        files_processed: r.filesProcessed.length,
        errors: r.errors,
      })),
      totals: {
        records_processed: summary.totalRecords,
        records_inserted: totalInserted,
        successful_jobs: successCount,
        failed_jobs: summary.results.length - successCount,
        total_errors: summary.totalErrors,
      },
      error_details: errorMessages,
    })
  } catch (error) {
    console.error('[Silver ETL] Fatal error:', error)
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

/**
 * GET /api/cron/silver-etl
 * Get Silver ETL status and stats
 */
export async function GET() {
  // Check R2 connection (needed to read Bronze)
  const r2Check = await checkR2Connection()

  if (!r2Check.connected) {
    return NextResponse.json({
      status: 'not_configured',
      description: 'Silver ETL job - transforms Bronze (R2) → Silver (Supabase)',
      r2_connected: false,
      r2_error: r2Check.error,
      configuration: {
        required_env_vars: [
          'R2_ACCOUNT_ID',
          'R2_ACCESS_KEY_ID',
          'R2_SECRET_ACCESS_KEY',
          'R2_BUCKET_NAME',
          'NEXT_PUBLIC_SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
        ],
        schedule: '15 * * * * (every hour at minute 15)',
      },
    })
  }

  // Get Silver stats
  try {
    const stats = await getSilverStats()

    return NextResponse.json({
      status: 'ready',
      description: 'Silver ETL job - transforms Bronze (R2) → Silver (Supabase)',
      r2_connected: true,
      schedule: '15 * * * * (every hour at minute 15)',
      silver_tables: {
        'silver.conversations_clean': stats.conversations,
        'silver.messages_clean': stats.messages,
        'silver.voice_calls_clean': stats.voiceCalls,
        'silver.sms_logs_clean': stats.smsLogs,
      },
      last_sync: stats.lastSync,
      endpoints: {
        trigger: 'POST /api/cron/silver-etl',
        status: 'GET /api/cron/silver-etl',
      },
      transformations: [
        'Deduplicate by ID',
        'Parse JSON strings → JSONB',
        'Normalize timestamps to UTC',
        'Validate schema (channel, role, direction)',
      ],
    })
  } catch (error) {
    return NextResponse.json({
      status: 'ready',
      description: 'Silver ETL job - transforms Bronze (R2) → Silver (Supabase)',
      r2_connected: true,
      schedule: '15 * * * * (every hour at minute 15)',
      stats_error: error instanceof Error ? error.message : 'Failed to get stats',
      note: 'Silver tables may not exist yet. Run the migration first.',
    })
  }
}
