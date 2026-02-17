import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Get overview stats
    const { data: overview } = await db.rpc("get_admin_overview");

    // Get latest daily snapshot
    const { data: snapshot } = await db
      .from("admin_daily_snapshot")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    // Get recent errors (last 24h)
    const { data: recentErrors } = await db
      .from("admin_error_log")
      .select("id, source, severity, message, created_at")
      .gte("created_at", new Date(Date.now() - 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    // Get recent cron runs
    const { data: recentCrons } = await db
      .from("admin_cron_runs")
      .select("id, cron_name, status, duration_ms, started_at, error_message")
      .order("started_at", { ascending: false })
      .limit(20);

    // Get cron health summary
    const { data: cronHealth } = await db.rpc("get_cron_health_summary", {
      p_hours: 24,
    });

    // Get today's business metrics
    const { data: businessMetrics } = await db
      .from("exo_business_daily_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      overview: overview?.[0] || overview || {},
      snapshot,
      recentErrors: recentErrors || [],
      recentCrons: recentCrons || [],
      cronHealth: cronHealth || [],
      businessMetrics,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminOverview] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
