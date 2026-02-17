// =====================================================
// MOD API - Execute mod operations
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { getModExecutor, hasModExecutor } from "@/lib/mods/executors";
import { getModDefinition } from "@/lib/mods";
import { ModSlug } from "@/lib/mods/types";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// =====================================================
// GET /api/mods/[slug] - Get mod data & insights
// =====================================================

export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const supabase = getServiceSupabase();
    const { slug } = await params;

    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    // Check mod exists (static definition or dynamic skill)
    const modDef = getModDefinition(slug);
    const isDynamicSkill = slug.startsWith("custom-");

    if (!modDef && !isDynamicSkill) {
      return NextResponse.json({ error: "Mod not found" }, { status: 404 });
    }

    // Check mod is installed for this user
    const { data: installation } = await supabase
      .from("exo_tenant_mods")
      .select("*, mod:exo_mod_registry(*)")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .single();

    // Allow access even without installation for now (development)
    // In production, you'd want to enforce installation check

    // Check executor exists (static or dynamic)
    if (!(await hasModExecutor(slug as ModSlug, tenantId))) {
      return NextResponse.json(
        { error: "Mod executor not implemented", definition: modDef },
        { status: 501 },
      );
    }

    const executor = (await getModExecutor(slug as ModSlug, tenantId))!;

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
    console.error("[Mods API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get mod data", details: (error as Error).message },
      { status: 500 },
    );
  }
});

// =====================================================
// POST /api/mods/[slug] - Execute mod action
// =====================================================

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const supabase = getServiceSupabase();
    const { slug } = await params;

    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await request.json();
    const { action, params: actionParams } = body as {
      action: string;
      params?: Record<string, unknown>;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    // Check executor exists (static or dynamic)
    if (!(await hasModExecutor(slug as ModSlug, tenantId))) {
      return NextResponse.json(
        { error: "Mod executor not implemented" },
        { status: 501 },
      );
    }

    const executor = (await getModExecutor(slug as ModSlug, tenantId))!;

    // Verify action exists
    const availableActions = executor.getActions();
    const actionDef = availableActions.find((a) => a.slug === action);
    if (!actionDef) {
      return NextResponse.json(
        {
          error: "Unknown action",
          available: availableActions.map((a) => a.slug),
        },
        { status: 400 },
      );
    }

    // Execute action
    const result = await executor.executeAction(
      tenantId,
      action,
      actionParams || {},
    );

    // Log action execution (ignore errors - table might not exist yet)
    try {
      await supabase.from("exo_mod_action_log").insert({
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
      return NextResponse.json(
        { error: result.error, success: false },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      result: result.result,
    });
  } catch (error) {
    console.error("[Mods API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to execute action", details: (error as Error).message },
      { status: 500 },
    );
  }
});
