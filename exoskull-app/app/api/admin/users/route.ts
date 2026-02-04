import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
    const sortBy = req.nextUrl.searchParams.get("sort") || "created_at";
    const order = req.nextUrl.searchParams.get("order") || "desc";
    const search = req.nextUrl.searchParams.get("search") || "";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get users
    let query = db
      .from("exo_tenants")
      .select(
        "id, name, email, phone, subscription_tier, timezone, language, created_at, last_payment_at, total_paid_pln, failed_payments",
        { count: "exact" },
      );

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.order(sortBy, { ascending: order === "asc" });
    query = query.range(from, to);

    const { data: users, count } = await query;

    // Get engagement scores for these users
    const userIds = (users || []).map((u: any) => u.id);
    let engagementMap = new Map<string, any>();

    if (userIds.length > 0) {
      const { data: engagements } = await db
        .from("exo_engagement_scores")
        .select(
          "tenant_id, engagement_level, overall_score, churn_risk, last_active_at",
        )
        .in("tenant_id", userIds);

      for (const e of engagements || []) {
        engagementMap.set(e.tenant_id, e);
      }
    }

    // Merge
    const enrichedUsers = (users || []).map((u: any) => ({
      ...u,
      engagement: engagementMap.get(u.id) || null,
    }));

    return NextResponse.json({
      users: enrichedUsers,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminUsers] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
