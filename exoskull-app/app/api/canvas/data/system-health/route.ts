/**
 * Canvas System Health Data API
 *
 * GET /api/canvas/data/system-health — Returns user-facing health snapshot
 * for the SystemHealthWidget.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getSystemHealthSnapshot } from "@/lib/system/events";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    // Get health snapshot scoped to this tenant
    const snapshot = await getSystemHealthSnapshot(tenantId);

    return NextResponse.json({
      overall_status: snapshot.overall_status,
      subsystems: snapshot.subsystems,
      alerts: snapshot.alerts,
      timestamp: snapshot.timestamp,
    });
  } catch (error) {
    console.error("[CanvasSystemHealth] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
