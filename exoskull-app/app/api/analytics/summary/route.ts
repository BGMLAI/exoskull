/**
 * Analytics Summary API
 *
 * Exposes Gold layer materialized views for dashboard consumption.
 * GET /api/analytics/summary?period=daily|weekly|monthly&days=30
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import {
  getDailySummary,
  getWeeklySummary,
  getMonthlySummary,
  getMessagesDailySummary,
  getConversationInsights,
  getPeriodComparison,
} from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;
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
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
