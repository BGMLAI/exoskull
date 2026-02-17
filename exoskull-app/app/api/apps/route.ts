/**
 * GET /api/apps — List all generated apps for the authenticated tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const service = getServiceSupabase();
    const { data: apps, error } = await service
      .from("exo_generated_apps")
      .select(
        "id, slug, name, description, status, table_name, columns, ui_config, widget_size, usage_count, last_used_at, created_at",
      )
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AppList] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ apps: apps || [] });
  } catch (error) {
    console.error("[AppList] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
