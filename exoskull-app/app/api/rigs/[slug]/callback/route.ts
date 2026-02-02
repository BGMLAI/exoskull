import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOAuthConfig, exchangeCodeForTokens } from '@/lib/rigs/oauth';

export const dynamic = 'force-dynamic';

// GET /api/rigs/[slug]/callback - OAuth callback
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth error
    if (error) {
      console.error(`[OAuth] ${slug} error:`, error, errorDescription);
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=${encodeURIComponent(errorDescription || error)}`, request.url)
      );
    }

    // Validate required params
    if (!code || !state) {
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=missing_params`, request.url)
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(
        new URL(`/login?error=session_expired`, request.url)
      );
    }

    // Verify state token
    const { data: connection, error: connError } = await supabase
      .from('exo_rig_connections')
      .select('*')
      .eq('tenant_id', user.id)
      .eq('rig_slug', slug)
      .single();

    if (connError || !connection) {
      console.error('[OAuth] Connection not found:', connError);
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=invalid_state`, request.url)
      );
    }

    // Verify state matches
    if (connection.metadata?.oauth_state !== state) {
      console.error('[OAuth] State mismatch');
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=state_mismatch`, request.url)
      );
    }

    // Get OAuth config
    const config = getOAuthConfig(slug);
    if (!config) {
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=config_not_found`, request.url)
      );
    }

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(config, code);
    } catch (tokenError) {
      console.error('[OAuth] Token exchange failed:', tokenError);
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=token_exchange_failed`, request.url)
      );
    }

    // Calculate expiry time
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Update connection with tokens
    const { error: updateError } = await supabase
      .from('exo_rig_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_type: tokens.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes: tokens.scope ? tokens.scope.split(' ') : config.scopes,
        metadata: {
          ...connection.metadata,
          oauth_state: null, // Clear state
          connected_at: new Date().toISOString(),
        },
        sync_status: 'success',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[OAuth] Failed to save tokens:', updateError);
      return NextResponse.redirect(
        new URL(`/dashboard/marketplace/${slug}?error=save_failed`, request.url)
      );
    }

    // Auto-install the rig if not already installed
    const { data: registry } = await supabase
      .from('exo_registry')
      .select('id')
      .eq('slug', slug)
      .single();

    if (registry) {
      await supabase
        .from('exo_user_installations')
        .upsert({
          tenant_id: user.id,
          registry_id: registry.id,
          enabled: true,
          config: {},
        }, {
          onConflict: 'tenant_id,registry_id',
        });
    }

    console.log(`[OAuth] ${slug} connected successfully for user ${user.id}`);

    // Redirect to success page
    return NextResponse.redirect(
      new URL(`/dashboard/marketplace/${slug}?connected=true`, request.url)
    );
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    const { slug } = await params;
    return NextResponse.redirect(
      new URL(`/dashboard/marketplace/${slug}?error=internal_error`, request.url)
    );
  }
}
