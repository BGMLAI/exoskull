/**
 * Canvas Tasks Data API
 *
 * GET /api/canvas/data/tasks — Returns TaskStats for the TasksWidget.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getTaskStats } from "@/lib/tasks/task-service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    // Count tasks by status via dual-read service
    const stats = await getTaskStats(tenantId);

    return NextResponse.json({
      stats,
      series: [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Canvas] Tasks data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
