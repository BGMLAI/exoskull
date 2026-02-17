import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const db = getAdminSupabase();
    const { id } = await params;

    // User profile
    const { data: user } = await db
      .from("exo_tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Recent conversations (last 30)
    const { data: conversations } = await db
      .from("exo_conversations")
      .select(
        "id, channel, created_at, model_used, tokens_used, duration_seconds",
      )
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(30);

    // Engagement score
    const { data: engagement } = await db
      .from("exo_engagement_scores")
      .select("*")
      .eq("tenant_id", id)
      .single();

    // Active mods/rigs
    const { data: installations } = await db
      .from("exo_user_installations")
      .select("*, registry:exo_registry(name, type, icon, category)")
      .eq("tenant_id", id)
      .eq("is_active", true);

    // MITs
    const { data: mits } = await db
      .from("user_mits")
      .select("*")
      .eq("tenant_id", id)
      .order("rank", { ascending: true });

    // Patterns
    const { data: patterns } = await db
      .from("user_patterns")
      .select("*")
      .eq("tenant_id", id)
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(10);

    // AI usage (last 30 days)
    const { data: aiUsage } = await db
      .from("exo_ai_usage")
      .select("model_used, tier, estimated_cost, total_tokens")
      .eq("tenant_id", id)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    const aiSummary = {
      totalRequests: aiUsage?.length || 0,
      totalCost: (aiUsage || []).reduce(
        (s, r) => s + (r.estimated_cost || 0),
        0,
      ),
      totalTokens: (aiUsage || []).reduce(
        (s, r) => s + (r.total_tokens || 0),
        0,
      ),
    };

    // Interventions (last 20)
    const { data: interventions } = await db
      .from("exo_interventions")
      .select(
        "id, intervention_type, priority, guardian_verdict, benefit_score, user_feedback, created_at",
      )
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      user,
      conversations: conversations || [],
      engagement,
      installations: installations || [],
      mits: mits || [],
      patterns: patterns || [],
      aiSummary,
      interventions: interventions || [],
    });
  } catch (error) {
    if (error instanceof Response) return error;
    logger.error("[AdminUserDetail] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
