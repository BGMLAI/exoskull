import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Latest business metrics
    const { data: latest } = await db
      .from("exo_business_daily_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    // History (last 90 days)
    const { data: history } = await db
      .from("exo_business_daily_metrics")
      .select("*")
      .order("date", { ascending: true })
      .limit(90);

    // Engagement distribution
    const { data: engagementDist } = await db
      .from("exo_engagement_scores")
      .select("engagement_level");

    const engagementDistribution: Record<string, number> = {};
    for (const e of engagementDist || []) {
      const level = e.engagement_level || "unknown";
      engagementDistribution[level] = (engagementDistribution[level] || 0) + 1;
    }

    // Subscription tier distribution
    const { data: tierDist } = await db
      .from("exo_tenants")
      .select("subscription_tier");

    const tierDistribution: Record<string, number> = {};
    for (const t of tierDist || []) {
      const tier = t.subscription_tier || "free";
      tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
    }

    // Recent dunning attempts
    const { data: dunning } = await db
      .from("exo_dunning_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    // Referral stats
    const { data: referrals } = await db
      .from("exo_referrals")
      .select("id, status");

    const referralStats = {
      total: referrals?.length || 0,
      converted:
        referrals?.filter((r: any) => r.status === "converted").length || 0,
    };

    return NextResponse.json({
      latest: latest || null,
      history: history || [],
      engagementDistribution,
      tierDistribution,
      dunning: dunning || [],
      referralStats,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminBusinessKPIs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
