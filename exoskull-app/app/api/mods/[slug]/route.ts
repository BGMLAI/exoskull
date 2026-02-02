// =====================================================
// MOD API - Execute mod operations
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getModExecutor, hasModExecutor } from '@/lib/mods/executors';
import { getModDefinition } from '@/lib/mods';
import { ModSlug } from '@/lib/mods/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =====================================================
// GET /api/mods/[slug] - Get mod data & insights
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const tenantId = request.headers.get('x-tenant-id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant ID' }, { status: 401 });
    }

    // Check mod exists
    const modDef = getModDefinition(slug);
    if (!modDef) {
      return NextResponse.json({ error: 'Mod not found' }, { status: 404 });
    }

    // Check mod is installed for this user
    const { data: installation } = await supabase
      .from('exo_user_installations')
      .select('*, registry:exo_registry(*)')
      .eq('tenant_id', tenantId)
      .eq('enabled', true)
      .single();

    // Allow access even without installation for now (development)
    // In production, you'd want to enforce installation check

    // Check executor exists
    if (!hasModExecutor(slug as ModSlug)) {
      return NextResponse.json(
        { error: 'Mod executor not implemented', definition: modDef },
        { status: 501 }
      );
    }

    const executor = getModExecutor(slug as ModSlug)!;

    // Get data and insights in parallel
    const [data, insights, actions] = await Promise.all([
      executor.getData(tenantId),
      executor.getInsights(tenantId),
      Promise.resolve(executor.getActions()),
    ]);

    return NextResponse.json({
      slug,
      definition: modDef,
      data,
      insights,
      actions,
      installation: installation || null,
    });
  } catch (error) {
    console.error('[Mods API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get mod data', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// =====================================================
// POST /api/mods/[slug] - Execute mod action
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const tenantId = request.headers.get('x-tenant-id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant ID' }, { status: 401 });
    }

    const body = await request.json();
    const { action, params: actionParams } = body as {
      action: string;
      params?: Record<string, unknown>;
    };

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    // Check executor exists
    if (!hasModExecutor(slug as ModSlug)) {
      return NextResponse.json({ error: 'Mod executor not implemented' }, { status: 501 });
    }

    const executor = getModExecutor(slug as ModSlug)!;

    // Verify action exists
    const availableActions = executor.getActions();
    const actionDef = availableActions.find((a) => a.slug === action);
    if (!actionDef) {
      return NextResponse.json(
        { error: 'Unknown action', available: availableActions.map((a) => a.slug) },
        { status: 400 }
      );
    }

    // Execute action
    const result = await executor.executeAction(tenantId, action, actionParams || {});

    // Log action execution (ignore errors - table might not exist yet)
    try {
      await supabase.from('exo_mod_action_log').insert({
        tenant_id: tenantId,
        mod_slug: slug,
        action,
        params: actionParams,
        success: result.success,
        error: result.error,
      });
    } catch {
      // Ignore logging errors
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error, success: false }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    console.error('[Mods API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to execute action', details: (error as Error).message },
      { status: 500 }
    );
  }
}
