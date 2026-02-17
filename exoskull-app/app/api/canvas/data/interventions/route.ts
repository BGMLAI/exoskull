/**
 * Canvas Interventions Data API
 *
 * GET /api/canvas/data/interventions — Returns pending + needs-feedback interventions.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const [pendingResult, feedbackResult] = await Promise.all([
      // Pending interventions awaiting approval
      supabase
        .from("exo_interventions")
        .select(
          "id, title, description, intervention_type, priority, created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("status", "proposed")
        .eq("requires_approval", true)
        .order("created_at", { ascending: false })
        .limit(5),

      // Recently completed without feedback
      supabase
        .from("exo_interventions")
        .select("id, title, intervention_type, completed_at")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .is("user_feedback", null)
        .gte("completed_at", twoDaysAgo)
        .order("completed_at", { ascending: false })
        .limit(3),
    ]);

    return NextResponse.json({
      pending: pendingResult.data || [],
      needsFeedback: feedbackResult.data || [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[Canvas] Interventions data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
