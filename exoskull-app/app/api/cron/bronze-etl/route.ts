/**
 * Bronze ETL Cron Job
 *
 * Syncs Supabase data to R2 Parquet files (Bronze layer).
 * Runs hourly at minute 5 via Vercel Cron.
 *
 * Flow:
 * 1. Get all active tenants
 * 2. For each tenant, fetch new data since last sync
 * 3. Convert to Parquet format
 * 4. Write to R2 Bronze layer
 * 5. Update sync log
 */

import { NextRequest, NextResponse } from "next/server";
import { runBronzeETL, runBronzeETLForTenant } from "@/lib/datalake/bronze-etl";
import { checkR2Connection, getBronzeStats } from "@/lib/storage/r2-client";
import { verifyCronAuth } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/bronze-etl
 * Trigger Bronze ETL job
 */
export async function POST(req: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(req)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message:
          "Valid x-cron-secret header or Authorization bearer token required",
      },
      { status: 401 },
    );
  }

  console.log(`[Bronze ETL] Triggered at ${new Date().toISOString()}`);

  // Check R2 connection first
  const r2Check = await checkR2Connection();
  if (!r2Check.connected) {
    console.error("[Bronze ETL] R2 not connected:", r2Check.error);
    return NextResponse.json(
      {
        error: "R2 connection failed",
        message: r2Check.error,
        action: "Configure R2 credentials in environment variables",
      },
      { status: 503 },
    );
  }

  try {
    // Check if specific tenant requested
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;

    if (tenantId) {
      // Single tenant ETL
      console.log(`[Bronze ETL] Running for single tenant: ${tenantId}`);
      const results = await runBronzeETLForTenant(tenantId);

      return NextResponse.json({
        status: "completed",
        tenant_id: tenantId,
        results,
        total_records: results.reduce((sum, r) => sum + r.records_processed, 0),
        total_bytes: results.reduce((sum, r) => sum + r.bytes_written, 0),
        errors: results
          .filter((r) => !r.success)
          .map((r) => ({
            data_type: r.data_type,
            error: r.error,
          })),
      });
    }

    // Full ETL for all tenants
    const summary = await runBronzeETL();

    return NextResponse.json({
      status: "completed",
      ...summary,
    });
  } catch (error) {
    console.error("[Bronze ETL] Fatal error:", error);
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

/**
 * GET /api/cron/bronze-etl
 * Get Bronze ETL status and stats
 */
export async function GET(req: NextRequest) {
  // Check R2 connection
  const r2Check = await checkR2Connection();

  if (!r2Check.connected) {
    return NextResponse.json({
      status: "not_configured",
      description: "Bronze ETL job - syncs Supabase to R2 Parquet",
      r2_connected: false,
      r2_error: r2Check.error,
      configuration: {
        required_env_vars: [
          "R2_ACCOUNT_ID",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_BUCKET_NAME",
        ],
        schedule: "5 * * * * (every hour at minute 5)",
      },
    });
  }

  // Get stats if R2 is connected
  try {
    const stats = await getBronzeStats();

    return NextResponse.json({
      status: "ready",
      description: "Bronze ETL job - syncs Supabase to R2 Parquet",
      r2_connected: true,
      schedule: "5 * * * * (every hour at minute 5)",
      stats: {
        total_files: stats.totalFiles,
        total_bytes: stats.totalBytes,
        total_mb: (stats.totalBytes / (1024 * 1024)).toFixed(2),
        by_data_type: stats.byDataType,
      },
      endpoints: {
        trigger: "POST /api/cron/bronze-etl",
        status: "GET /api/cron/bronze-etl",
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "ready",
      description: "Bronze ETL job - syncs Supabase to R2 Parquet",
      r2_connected: true,
      schedule: "5 * * * * (every hour at minute 5)",
      stats_error:
        error instanceof Error ? error.message : "Failed to get stats",
    });
  }
}
