import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, getOAuthConfig } from "@/lib/rigs/oauth";
import { randomBytes } from "crypto";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

const RIG_SLUG = "oura";

// GET /api/rigs/oura/connect - Start OAuth flow
export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) {
      const returnUrl = `/api/rigs/${RIG_SLUG}/connect`;
      return NextResponse.redirect(
        new URL(
          `/login?returnUrl=${encodeURIComponent(returnUrl)}`,
          request.url,
        ),
      );
    }
    const tenantId = auth.tenantId;

    const config = getOAuthConfig(RIG_SLUG);
    if (!config) {
      return NextResponse.json(
        { error: "OAuth config not found for Oura" },
        { status: 500 },
      );
    }

    if (!config.clientId) {
      console.error("[Oura OAuth] Missing client ID");
      return NextResponse.json(
        {
          error:
            "Oura integration is not configured. Please add API credentials.",
        },
        { status: 500 },
      );
    }

    const state = randomBytes(32).toString("hex");

    const supabase = await createClient();
    const { error: stateError } = await supabase
      .from("exo_rig_connections")
      .upsert(
        {
          tenant_id: tenantId,
          rig_slug: RIG_SLUG,
          metadata: {
            oauth_state: state,
            oauth_initiated_at: new Date().toISOString(),
          },
          sync_status: "pending",
        },
        { onConflict: "tenant_id,rig_slug" },
      );

    if (stateError) {
      console.error("[Oura OAuth] Failed to store state:", stateError);
      return NextResponse.json(
        { error: "Failed to initiate OAuth flow" },
        { status: 500 },
      );
    }

    const authUrl = buildAuthUrl(config, state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[Oura OAuth] Connect error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
