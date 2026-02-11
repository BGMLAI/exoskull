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

import { NextRequest, NextResponse } from "next/server";
import {
  runSilverETL,
  runDirectSilverETL,
  getSilverStats,
} from "@/lib/datalake/silver-etl";
import { checkR2Connection } from "@/lib/storage/r2-client";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { verifyCronAuth } from "@/lib/cron/auth";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/silver-etl
 * Trigger Silver ETL job
 */
async function postHandler(req: NextRequest) {
  logger.info(`[Silver ETL] Triggered at ${new Date().toISOString()}`);

  try {
    // Try R2-based ETL first, fallback to direct mode
    const r2Check = await checkR2Connection();
    let summary;
    let mode: string;

    if (r2Check.connected) {
      mode = "r2";
      summary = await runSilverETL();
    } else {
      mode = "direct";
      logger.info(
        "[Silver ETL] R2 unavailable, using direct mode (Supabase → Silver)",
      );
      summary = await runDirectSilverETL();
    }

    // Calculate totals
    const totalInserted = summary.results.reduce(
      (sum, r) => sum + r.recordsInserted,
      0,
    );
    const successCount = summary.results.filter((r) => r.success).length;
    const errorMessages = summary.results
      .filter((r) => r.errors.length > 0)
      .map((r) => ({
        dataType: r.dataType,
        errors: r.errors,
      }));

    return NextResponse.json({
      status: "completed",
      mode,
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
    });
  } catch (error) {
    console.error("[Silver ETL] Fatal error:", error);
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export const POST = withCronGuard(
  { name: "silver-etl", dependencies: ["bronze-etl"] },
  postHandler,
);

/**
 * GET /api/cron/silver-etl
 * Get Silver ETL status and stats
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check R2 connection status
  const r2Check = await checkR2Connection();

  // Get Silver stats (works regardless of R2)
  try {
    const stats = await getSilverStats();

    return NextResponse.json({
      status: "ready",
      description:
        "Silver ETL — supports R2 mode + direct mode (Supabase → Silver)",
      mode: r2Check.connected ? "r2" : "direct",
      r2_connected: r2Check.connected,
      r2_note: r2Check.connected
        ? undefined
        : "Using direct mode (raw tables → Silver). R2 optional.",
      silver_tables: {
        conversations: stats.conversations,
        messages: stats.messages,
        voice_calls: stats.voiceCalls,
        sms_logs: stats.smsLogs,
      },
      last_sync: stats.lastSync,
    });
  } catch (error) {
    return NextResponse.json({
      status: "ready",
      mode: r2Check.connected ? "r2" : "direct",
      r2_connected: r2Check.connected,
      stats_error:
        error instanceof Error ? error.message : "Failed to get stats",
      note: "Silver tables may not exist yet. Run the migration first.",
    });
  }
}
