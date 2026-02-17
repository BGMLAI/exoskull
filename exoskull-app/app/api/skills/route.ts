// =====================================================
// GET /api/skills - List all skills for tenant
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const authSupabase = await createAuthClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = user.id;

    const supabase = getServiceSupabase();
    const status = request.nextUrl.searchParams.get("status") || "approved";

    const query = supabase
      .from("exo_generated_skills")
      .select(
        "id, slug, name, description, version, tier, risk_level, capabilities, approval_status, usage_count, last_used_at, created_at, updated_at, archived_at",
      )
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    // Filter by status unless 'all' is requested
    if (status !== "all") {
      query.eq("approval_status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Skills API] List error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      skills: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("[Skills API] List error:", error);
    return NextResponse.json(
      { error: "Failed to list skills", details: (error as Error).message },
      { status: 500 },
    );
  }
});
