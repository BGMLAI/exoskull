/**
 * Analytics Summary API
 *
 * Exposes Gold layer materialized views for dashboard consumption.
 * GET /api/analytics/summary?period=daily|weekly|monthly&days=30
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  getDailySummary,
  getWeeklySummary,
  getMonthlySummary,
  getMessagesDailySummary,
  getConversationInsights,
  getPeriodComparison,
} from "@/lib/analytics/queries";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "daily";
    const days = parseInt(searchParams.get("days") || "30", 10);

    switch (period) {
      case "daily": {
        const [summary, messages] = await Promise.all([
          getDailySummary(tenantId, days),
          getMessagesDailySummary(tenantId, days),
        ]);
        return NextResponse.json({ period, summary, messages });
      }

      case "weekly": {
        const summary = await getWeeklySummary(tenantId, Math.ceil(days / 7));
        return NextResponse.json({ period, summary });
      }

      case "monthly": {
        const summary = await getMonthlySummary(tenantId, Math.ceil(days / 30));
        return NextResponse.json({ period, summary });
      }

      case "insights": {
        const [insights, comparison] = await Promise.all([
          getConversationInsights(tenantId),
          getPeriodComparison(tenantId, 7),
        ]);
        return NextResponse.json({ period, insights, comparison });
      }

      default:
        return NextResponse.json(
          {
            error: `Invalid period: ${period}. Use daily, weekly, monthly, or insights.`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
});
