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
import { checkR2Connection } from "@/lib/storage/r2-client";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/bronze-etl
 * Trigger Bronze ETL job
 */
async function postHandler(req: NextRequest) {
  logger.info(`[Bronze ETL] Triggered at ${new Date().toISOString()}`);

  // Check R2 connection first
  const r2Check = await checkR2Connection();
  if (!r2Check.connected) {
    logger.error("[Bronze ETL] R2 not connected:", r2Check.error);
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
      logger.info(`[Bronze ETL] Running for single tenant: ${tenantId}`);
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
    logger.error("[Bronze ETL] Fatal error:", error);
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

export const GET = withCronGuard({ name: "bronze-etl" }, postHandler);
export const POST = withCronGuard({ name: "bronze-etl" }, postHandler);
