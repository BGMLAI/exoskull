/**
 * GET /api/emotion/history
 *
 * Retrieve emotion log entries for a tenant.
 * Query params: tenant_id (required), limit, crisis_only, start_date, end_date
 */

import { NextRequest, NextResponse } from "next/server";
import { getEmotionHistory } from "@/lib/emotion";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const crisisOnly = searchParams.get("crisis_only") === "true";
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const entries = await getEmotionHistory(tenantId, limit, {
      crisisOnly,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return NextResponse.json({
      entries,
      count: entries.length,
      tenant_id: tenantId,
    });
  } catch (error) {
    logger.error("[EmotionHistory] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
