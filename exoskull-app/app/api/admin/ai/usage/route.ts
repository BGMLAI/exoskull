import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    const period = req.nextUrl.searchParams.get("period") || "7d";
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period] || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Total usage by model
    const { data: byModel } = await db
      .from("exo_ai_usage")
      .select("model_used, tier, estimated_cost, total_tokens, success")
      .gte("created_at", since);

    // Aggregate by model
    const modelStats = new Map<
      string,
      {
        model: string;
        tier: number;
        requests: number;
        totalCost: number;
        totalTokens: number;
        errors: number;
      }
    >();

    for (const row of byModel || []) {
      const key = row.model_used || "unknown";
      if (!modelStats.has(key)) {
        modelStats.set(key, {
          model: key,
          tier: row.tier || 0,
          requests: 0,
          totalCost: 0,
          totalTokens: 0,
          errors: 0,
        });
      }
      const stat = modelStats.get(key)!;
      stat.requests++;
      stat.totalCost += row.estimated_cost || 0;
      stat.totalTokens += row.total_tokens || 0;
      if (!row.success) stat.errors++;
    }

    // Daily cost trend
    const { data: dailyCosts } = await db
      .from("mv_ai_daily_costs")
      .select("*")
      .gte("date", since.split("T")[0])
      .order("date", { ascending: true });

    // Total summary
    const totalRequests = byModel?.length || 0;
    const totalCost = (byModel || []).reduce(
      (sum, r) => sum + (r.estimated_cost || 0),
      0,
    );
    const totalErrors = (byModel || []).filter((r) => !r.success).length;

    return NextResponse.json({
      period,
      summary: {
        totalRequests,
        totalCost: Math.round(totalCost * 1000000) / 1000000,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      },
      byModel: Array.from(modelStats.values()).sort(
        (a, b) => b.requests - a.requests,
      ),
      dailyCosts: dailyCosts || [],
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminAIUsage] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
