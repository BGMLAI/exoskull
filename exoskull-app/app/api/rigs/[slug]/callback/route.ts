import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getOAuthConfig, exchangeCodeForTokens } from "@/lib/rigs/oauth";

export const dynamic = "force-dynamic";

// GET /api/rigs/[slug]/callback - OAuth callback
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle OAuth error
    if (error) {
      console.error(`[OAuth] ${slug} error:`, error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=${encodeURIComponent(errorDescription || error)}`,
          request.url,
        ),
      );
    }

    // Validate required params
    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=missing_params`,
          request.url,
        ),
      );
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(
        new URL(`/login?error=session_expired`, request.url),
      );
    }

    // Verify state token
    const { data: connection, error: connError } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", user.id)
      .eq("rig_slug", slug)
      .single();

    if (connError || !connection) {
      console.error("[OAuth] Connection not found:", connError);
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=invalid_state`,
          request.url,
        ),
      );
    }

    // Verify state matches
    if (connection.metadata?.oauth_state !== state) {
      console.error("[OAuth] State mismatch");
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=state_mismatch`,
          request.url,
        ),
      );
    }

    // Get OAuth config
    const config = getOAuthConfig(slug);
    if (!config) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=config_not_found`,
          request.url,
        ),
      );
    }

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(config, code);
    } catch (tokenError) {
      console.error("[OAuth] Token exchange failed:", tokenError);
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=token_exchange_failed`,
          request.url,
        ),
      );
    }

    // Calculate expiry time
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Update connection with tokens
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
          oauth_state: null, // Clear state
          connected_at: new Date().toISOString(),
        },
        sync_status: "success",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (updateError) {
      console.error("[OAuth] Failed to save tokens:", updateError);
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?rig=${slug}&error=save_failed`,
          request.url,
        ),
      );
    }

    // Auto-install the rig if not already installed
    const { data: registry } = await supabase
      .from("exo_registry")
      .select("id")
      .eq("slug", slug)
      .single();

    if (registry) {
      await supabase.from("exo_user_installations").upsert(
        {
          tenant_id: user.id,
          registry_id: registry.id,
          enabled: true,
          config: {},
        },
        {
          onConflict: "tenant_id,registry_id",
        },
      );
    }

    console.log(`[OAuth] ${slug} connected successfully for user ${user.id}`);

    // Facebook-specific: auto-fetch page tokens and store in exo_meta_pages
    if (slug === "facebook" && tokens.access_token) {
      try {
        await syncFacebookPages(user.id, tokens.access_token);
      } catch (fbError) {
        console.error("[OAuth] Facebook page sync failed (non-blocking):", {
          error: fbError instanceof Error ? fbError.message : "Unknown",
        });
      }
    }

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/dashboard/settings?rig=${slug}&connected=true`, request.url),
    );
  } catch (error) {
    console.error("[OAuth] Callback error:", error);
    const { slug } = await params;
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?rig=${slug}&error=internal_error`,
        request.url,
      ),
    );
  }
}

// =====================================================
// FACEBOOK: Auto-fetch page tokens after OAuth
// =====================================================

async function syncFacebookPages(
  tenantId: string,
  userAccessToken: string,
): Promise<void> {
  const GRAPH_API = "https://graph.facebook.com/v21.0";

  // Fetch all pages the user manages
  const res = await fetch(
    `${GRAPH_API}/me/accounts?access_token=${encodeURIComponent(userAccessToken)}&fields=id,name,category,access_token,fan_count,picture`,
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Graph API error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const pages: Array<{
    id: string;
    name: string;
    category: string;
    access_token: string;
    fan_count?: number;
    picture?: { data?: { url?: string } };
  }> = data.data || [];

  if (pages.length === 0) {
    console.log("[OAuth/FB] No pages found for user");
    return;
  }

  // Use service role client to bypass RLS (callback runs as server)
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let connected = 0;
  for (const page of pages) {
    // Subscribe page to our app's webhook
    try {
      const subRes = await fetch(
        `${GRAPH_API}/${page.id}/subscribed_apps?access_token=${encodeURIComponent(page.access_token)}&subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads`,
        { method: "POST" },
      );
      const subData = await subRes.json();
      if (!subData.success) {
        console.error("[OAuth/FB] Failed to subscribe page:", {
          pageId: page.id,
          error: subData.error?.message,
        });
      }
    } catch (subError) {
      console.error("[OAuth/FB] Webhook subscribe failed:", {
        pageId: page.id,
        error: subError instanceof Error ? subError.message : "Unknown",
      });
    }

    // Upsert page token
    const { error } = await supabase.from("exo_meta_pages").upsert(
      {
        tenant_id: tenantId,
        page_type: "messenger",
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        is_active: true,
        metadata: {
          category: page.category,
          fan_count: page.fan_count,
          profile_pic: page.picture?.data?.url,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_type,page_id" },
    );

    if (error) {
      console.error("[OAuth/FB] Page upsert failed:", {
        pageId: page.id,
        error: error.message,
      });
    } else {
      connected++;
    }
  }

  console.log(
    `[OAuth/FB] Synced ${connected}/${pages.length} pages for tenant ${tenantId}`,
  );
}
