/**
 * POST /api/apps/[slug]/approve — Approve and activate a pending app
 * Creates the DB table, adds canvas widget, marks as active.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { activateApp } from "@/lib/apps/generator/app-generator";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { data: app, error: fetchError } = await supabase
      .from("exo_generated_apps")
      .select("id, slug, status, approval_status")
      .eq("tenant_id", tenantId)
      .eq("slug", params.slug)
      .single();

    if (fetchError || !app) {
      return NextResponse.json(
        { error: `App "${params.slug}" not found` },
        { status: 404 },
      );
    }

    if (app.approval_status === "approved" && app.status === "active") {
      return NextResponse.json({
        message: "App is already active",
        app,
      });
    }

    const result = await activateApp(app.id, tenantId);

    if (!result.success) {
      logger.error("[AppApprove] Activation failed:", {
        slug: params.slug,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    logger.info(`[AppApprove] App approved and activated: ${params.slug}`);
    return NextResponse.json({
      message: `App "${params.slug}" approved and activated`,
      success: true,
    });
  } catch (error) {
    logger.error("[AppApprove] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
