import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/installations/[id] - Get single installation details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: installation, error } = await supabase
      .from('exo_user_installations')
      .select(`
        *,
        registry:exo_registry(*)
      `)
      .eq('id', id)
      .eq('tenant_id', user.id)
      .single();

    if (error || !installation) {
      return NextResponse.json(
        { error: 'Installation not found' },
        { status: 404 }
      );
    }

    // Get connection if it's a rig
    let connection = null;
    if (installation.registry?.type === 'rig') {
      const { data: conn } = await supabase
        .from('exo_rig_connections')
        .select('*')
        .eq('tenant_id', user.id)
        .eq('rig_slug', installation.registry.slug)
        .single();

      connection = conn;
    }

    return NextResponse.json({
      installation,
      connection,
    });
  } catch (error) {
    console.error('[Installations] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/installations/[id] - Update installation config
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { config, enabled } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (config !== undefined) {
      updates.config = config;
    }

    if (enabled !== undefined) {
      updates.enabled = enabled;
    }

    const { data: installation, error } = await supabase
      .from('exo_user_installations')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[Installations] Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update installation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      installation,
    });
  } catch (error) {
    console.error('[Installations] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/installations/[id] - Uninstall
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get installation to check type
    const { data: installation } = await supabase
      .from('exo_user_installations')
      .select('*, registry:exo_registry(slug, type, name)')
      .eq('id', id)
      .eq('tenant_id', user.id)
      .single();

    if (!installation) {
      return NextResponse.json(
        { error: 'Installation not found' },
        { status: 404 }
      );
    }

    // Delete installation
    const { error } = await supabase
      .from('exo_user_installations')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.id);

    if (error) {
      console.error('[Installations] Delete error:', error);
      return NextResponse.json(
        { error: 'Failed to uninstall' },
        { status: 500 }
      );
    }

    // If it's a rig, optionally delete the connection too
    // (keeping it commented - user might want to reconnect later)
    // if (installation.registry?.type === 'rig') {
    //   await supabase
    //     .from('exo_rig_connections')
    //     .delete()
    //     .eq('tenant_id', user.id)
    //     .eq('rig_slug', installation.registry.slug);
    // }

    return NextResponse.json({
      success: true,
      message: `${installation.registry?.name} uninstalled`,
    });
  } catch (error) {
    console.error('[Installations] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
