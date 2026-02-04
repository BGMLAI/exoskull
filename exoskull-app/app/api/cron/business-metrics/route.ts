/**
 * Business Metrics Cron
 *
 * Runs daily at 05:00 UTC to calculate business metrics.
 */

import { NextRequest, NextResponse } from "next/server";
import { calculateDailyMetrics } from "@/lib/business/metrics";
import { verifyCronAuth } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const metrics = await calculateDailyMetrics();
    const duration = Date.now() - startTime;

    console.log("[BusinessMetrics] Cron complete:", {
      mrr: metrics.mrr_pln,
      activeUsers: metrics.active_users_30d,
      churn: metrics.churn_rate_30d,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      metrics,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[BusinessMetrics] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}
