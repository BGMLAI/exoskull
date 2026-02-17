import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding - Get current onboarding status
 */
export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();
    const { data: tenant, error } = await supabase
      .from("exo_tenants")
      .select(
        `
        onboarding_status,
        onboarding_step,
        onboarding_completed_at,
        preferred_name,
        primary_goal,
        secondary_goals,
        conditions,
        communication_style,
        preferred_channel,
        morning_checkin_time,
        discovery_data
      `,
      )
      .eq("id", tenantId)
      .single();

    if (error) {
      console.error("[Onboarding API] Error fetching status:", error);
      return NextResponse.json(
        { error: "Failed to fetch status" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: tenant?.onboarding_status || "pending",
      step: tenant?.onboarding_step || 0,
      completedAt: tenant?.onboarding_completed_at,
      profile: {
        preferred_name: tenant?.preferred_name,
        primary_goal: tenant?.primary_goal,
        secondary_goals: tenant?.secondary_goals,
        conditions: tenant?.conditions,
        communication_style: tenant?.communication_style,
        preferred_channel: tenant?.preferred_channel,
        morning_checkin_time: tenant?.morning_checkin_time,
      },
      discoveryData: tenant?.discovery_data,
    });
  } catch (error) {
    console.error("[Onboarding API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
