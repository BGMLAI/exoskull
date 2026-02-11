/**
 * Gold ETL Cron Job
 *
 * Refreshes materialized views for pre-aggregated dashboard queries.
 * Runs daily at 02:00 UTC via Vercel Cron.
 *
 * Views refreshed:
 * - exo_gold_daily_summary
 * - exo_gold_weekly_summary
 * - exo_gold_monthly_summary
 * - exo_gold_messages_daily
 */

import { NextRequest, NextResponse } from "next/server";
import { runGoldETL, refreshSingleView } from "@/lib/datalake/gold-etl";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/gold-etl
 * Trigger Gold ETL job (refresh materialized views)
 */
async function postHandler(req: NextRequest) {
  logger.info(`[Gold ETL] Triggered at ${new Date().toISOString()}`);

  try {
    // Check if specific view requested
    const body = await req.json().catch(() => ({}));
    const viewName = body.view_name;

    if (viewName) {
      // Single view refresh
      logger.info(`[Gold ETL] Refreshing single view: ${viewName}`);
      const result = await refreshSingleView(viewName);

      return NextResponse.json({
        status: result.success ? "completed" : "failed",
        view_name: result.viewName,
        duration_ms: result.durationMs,
        rows_count: result.rowsCount,
        error: result.error,
      });
    }

    // Full ETL - refresh all views
    const summary = await runGoldETL();

    return NextResponse.json({
      status: "completed",
      started_at: summary.startedAt.toISOString(),
      completed_at: summary.completedAt.toISOString(),
      duration_ms: summary.completedAt.getTime() - summary.startedAt.getTime(),
      results: summary.results.map((r) => ({
        view_name: r.viewName,
        success: r.success,
        duration_ms: r.durationMs,
        rows_count: r.rowsCount,
        error: r.error,
      })),
      totals: {
        views_refreshed: summary.successCount,
        views_failed: summary.errorCount,
        total_views: summary.totalViews,
      },
    });
  } catch (error) {
    console.error("[Gold ETL] Fatal error:", error);
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

export const GET = withCronGuard(
  { name: "gold-etl", dependencies: ["silver-etl"] },
  postHandler,
);
export const POST = withCronGuard(
  { name: "gold-etl", dependencies: ["silver-etl"] },
  postHandler,
);
