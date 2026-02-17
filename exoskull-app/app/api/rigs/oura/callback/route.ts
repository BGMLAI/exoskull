import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getOAuthConfig } from "@/lib/rigs/oauth";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

const RIG_SLUG = "oura";

// GET /api/rigs/oura/callback - OAuth callback
export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      logger.error("[Oura OAuth] Error:", error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/dashboard/mods/${RIG_SLUG}?error=${encodeURIComponent(
            errorDescription || error,
          )}`,
          request.url,
        ),
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/mods/${RIG_SLUG}?error=missing_params`,
          request.url,
        ),
      );
    }

    const auth = await verifyTenantAuth(request);
    if (!auth.ok) {
      return NextResponse.redirect(
        new URL(`/login?error=session_expired`, request.url),
      );
    }
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { data: connection, error: connError } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", RIG_SLUG)
      .single();

    if (connError || !connection) {
      logger.error("[Oura OAuth] Connection not found:", connError);
      return NextResponse.redirect(
        new URL(`/dashboard/mods/${RIG_SLUG}?error=invalid_state`, request.url),
      );
    }

    if (connection.metadata?.oauth_state !== state) {
      logger.error("[Oura OAuth] State mismatch");
      return NextResponse.redirect(
        new URL(
          `/dashboard/mods/${RIG_SLUG}?error=state_mismatch`,
          request.url,
        ),
      );
    }

    const config = getOAuthConfig(RIG_SLUG);
    if (!config) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/mods/${RIG_SLUG}?error=config_not_found`,
          request.url,
        ),
      );
    }

    let tokens;
    try {
      tokens = await exchangeCodeForTokens(config, code);
    } catch (tokenError) {
      logger.error("[Oura OAuth] Token exchange failed:", tokenError);
      return NextResponse.redirect(
        new URL(
          `/dashboard/mods/${RIG_SLUG}?error=token_exchange_failed`,
          request.url,
        ),
      );
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from("exo_rig_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_type: tokens.token_type || "Bearer",
        expires_at: expiresAt,
        scopes: tokens.scope ? tokens.scope.split(" ") : config.scopes,
        metadata: {
          ...connection.metadata,
          oauth_state: null,
          connected_at: new Date().toISOString(),
        },
        sync_status: "success",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (updateError) {
      logger.error("[Oura OAuth] Failed to save tokens:", updateError);
      return NextResponse.redirect(
        new URL(`/dashboard/mods/${RIG_SLUG}?error=save_failed`, request.url),
      );
    }

    const { data: registry } = await supabase
      .from("exo_registry")
      .select("id")
      .eq("slug", RIG_SLUG)
      .single();

    if (registry) {
      await supabase.from("exo_user_installations").upsert(
        {
          tenant_id: tenantId,
          registry_id: registry.id,
          enabled: true,
          config: {},
        },
        { onConflict: "tenant_id,registry_id" },
      );
    }

    return NextResponse.redirect(
      new URL(`/dashboard/mods/${RIG_SLUG}?connected=true`, request.url),
    );
  } catch (error) {
    logger.error("[Oura OAuth] Callback error:", error);
    return NextResponse.redirect(
      new URL(`/dashboard/mods/${RIG_SLUG}?error=internal_error`, request.url),
    );
  }
});
