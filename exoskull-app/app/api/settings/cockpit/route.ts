/**
 * Cockpit Settings API — Save/Load cockpit skin preference & zone widgets
 *
 * GET  /api/settings/cockpit — Load cockpit settings
 * PUT  /api/settings/cockpit — Save cockpit settings
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

// ============================================================================
// GET — Load cockpit settings from tenant metadata
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exo_tenants")
      .select("metadata")
      .eq("id", auth.tenantId)
      .single();

    if (error) {
      console.error("[CockpitSettings] Load failed:", error);
      return NextResponse.json(
        { cockpit_style: "none", zone_widgets: [] },
        { status: 200 },
      );
    }

    const metadata = (data?.metadata as Record<string, unknown>) || {};
    return NextResponse.json({
      cockpit_style: metadata.cockpit_style || "none",
      zone_widgets: metadata.zone_widgets || [],
    });
  } catch (err) {
    console.error("[CockpitSettings] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PUT — Save cockpit settings to tenant metadata
// ============================================================================

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const supabase = await createClient();

    // Fetch current metadata
    const { data: current } = await supabase
      .from("exo_tenants")
      .select("metadata")
      .eq("id", auth.tenantId)
      .single();

    const metadata = (current?.metadata as Record<string, unknown>) || {};

    // Update only cockpit-related fields
    if (body.cockpit_style !== undefined) {
      metadata.cockpit_style = body.cockpit_style;
    }
    if (body.zone_widgets !== undefined) {
      metadata.zone_widgets = body.zone_widgets;
    }

    const { error } = await supabase
      .from("exo_tenants")
      .update({ metadata })
      .eq("id", auth.tenantId);

    if (error) {
      console.error("[CockpitSettings] Save failed:", error);
      return NextResponse.json(
        { error: "Failed to save settings" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CockpitSettings] PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
