import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { getOAuthConfig, buildAuthUrl, supportsOAuth } from "@/lib/rigs/oauth";
import { randomBytes } from "crypto";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

// GET /api/rigs/[slug]/connect - Start OAuth flow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) {
      // Redirect to login with return URL
      const returnUrl = `/api/rigs/${slug}/connect`;
      return NextResponse.redirect(
        new URL(
          `/login?returnUrl=${encodeURIComponent(returnUrl)}`,
          request.url,
        ),
      );
    }
    const tenantId = auth.tenantId;

    // Check if rig supports OAuth
    if (!supportsOAuth(slug)) {
      return NextResponse.json(
        { error: `Rig "${slug}" does not support OAuth` },
        { status: 400 },
      );
    }

    // Get OAuth config
    const config = getOAuthConfig(slug);
    if (!config) {
      return NextResponse.json(
        { error: `OAuth config not found for "${slug}"` },
        { status: 500 },
      );
    }

    // Check if client ID is configured
    if (!config.clientId) {
      console.error(`[OAuth] Missing client ID for ${slug}`);
      return NextResponse.json(
        {
          error: `${slug} integration is not configured. Please add API credentials.`,
        },
        { status: 500 },
      );
    }

    // Generate state token
    const state = randomBytes(32).toString("hex");

    // Store state in database for verification
    const supabase = await createClient();
    const { error: stateError } = await supabase
      .from("exo_rig_connections")
      .upsert(
        {
          tenant_id: tenantId,
          rig_slug: slug,
          metadata: {
            oauth_state: state,
            oauth_initiated_at: new Date().toISOString(),
          },
          sync_status: "pending",
        },
        {
          onConflict: "tenant_id,rig_slug",
        },
      );

    if (stateError) {
      console.error("[OAuth] Failed to store state:", stateError);
      return NextResponse.json(
        { error: "Failed to initiate OAuth flow" },
        { status: 500 },
      );
    }

    // Build auth URL and redirect
    const authUrl = buildAuthUrl(config, state);

    logger.info(`[OAuth] Redirecting to ${slug} auth`, {
      userId: tenantId,
      redirectUri: config.redirectUri,
      scopeCount: config.scopes.length,
      authUrlLength: authUrl.length,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[OAuth] Connect error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
