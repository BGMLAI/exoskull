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
import {
  runGoldETL,
  refreshSingleView,
  getGoldStats,
  getRefreshHistory,
} from "@/lib/datalake/gold-etl";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { verifyCronAuth } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/gold-etl
 * Trigger Gold ETL job (refresh materialized views)
 */
async function postHandler(req: NextRequest) {
  console.log(`[Gold ETL] Triggered at ${new Date().toISOString()}`);

  try {
    // Check if specific view requested
    const body = await req.json().catch(() => ({}));
    const viewName = body.view_name;

    if (viewName) {
      // Single view refresh
      console.log(`[Gold ETL] Refreshing single view: ${viewName}`);
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

export const POST = withCronGuard(
  { name: "gold-etl", dependencies: ["silver-etl"] },
  postHandler,
);

/**
 * GET /api/cron/gold-etl
 * Get Gold ETL status and stats
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [stats, history] = await Promise.all([
      getGoldStats(),
      getRefreshHistory(10),
    ]);

    return NextResponse.json({
      status: "ready",
      description:
        "Gold ETL job - refreshes materialized views for dashboard aggregations",
      schedule: "0 2 * * * (daily at 02:00 UTC)",
      views: {
        exo_gold_daily_summary: stats.daily,
        exo_gold_weekly_summary: stats.weekly,
        exo_gold_monthly_summary: stats.monthly,
        exo_gold_messages_daily: stats.messagesDaily,
      },
      last_refresh: stats.lastRefresh,
      recent_history: history.slice(0, 5).map((h) => ({
        view_name: h.view_name,
        refreshed_at: h.refreshed_at,
        duration_ms: h.duration_ms,
        rows_count: h.rows_count,
        status: h.status,
      })),
      endpoints: {
        trigger: "POST /api/cron/gold-etl",
        trigger_single:
          'POST /api/cron/gold-etl { "view_name": "exo_gold_daily_summary" }',
        status: "GET /api/cron/gold-etl",
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      description:
        "Gold ETL job - refreshes materialized views for dashboard aggregations",
      schedule: "0 2 * * * (daily at 02:00 UTC)",
      error: error instanceof Error ? error.message : "Failed to get stats",
      note: "Gold views may not exist yet. Run the migration first.",
    });
  }
}
