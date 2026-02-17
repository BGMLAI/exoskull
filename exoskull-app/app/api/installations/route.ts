import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// GET /api/installations - Get user's installed Mods, Rigs, and Quests
export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    // Get installations with registry info
    const { data: installations, error } = await supabase
      .from("exo_user_installations")
      .select(
        `
        *,
        registry:exo_registry(*)
      `,
      )
      .eq("tenant_id", tenantId)
      .order("installed_at", { ascending: false });

    if (error) {
      console.error("[Installations] Error fetching:", error);
      return NextResponse.json(
        { error: "Failed to fetch installations" },
        { status: 500 },
      );
    }

    // Get rig connections for status
    const { data: connections } = await supabase
      .from("exo_rig_connections")
      .select("rig_slug, last_sync_at, sync_status, sync_error")
      .eq("tenant_id", tenantId);

    // Build connection map
    const connectionMap = new Map(
      connections?.map((c) => [c.rig_slug, c]) || [],
    );

    // Enrich installations with connection status
    const enriched = installations?.map((inst) => ({
      ...inst,
      connection:
        inst.registry?.type === "rig"
          ? connectionMap.get(inst.registry.slug)
          : null,
    }));

    // Group by type
    const grouped = {
      mods: enriched?.filter((i) => i.registry?.type === "mod") || [],
      rigs: enriched?.filter((i) => i.registry?.type === "rig") || [],
      quests: enriched?.filter((i) => i.registry?.type === "quest") || [],
    };

    return NextResponse.json({
      installations: enriched,
      grouped,
      counts: {
        total: enriched?.length || 0,
        mods: grouped.mods.length,
        rigs: grouped.rigs.length,
        quests: grouped.quests.length,
        active_quests: grouped.quests.filter(
          (q) => q.started_at && !q.completed_at,
        ).length,
      },
    });
  } catch (error) {
    console.error("[Installations] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

// POST /api/installations - Install a Mod, Rig, or Quest
export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await request.json();
    const { slug, config } = body;

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    // Get registry item
    const { data: registryItem, error: regError } = await supabase
      .from("exo_registry")
      .select("*")
      .eq("slug", slug)
      .single();

    if (regError || !registryItem) {
      return NextResponse.json(
        { error: "Item not found in registry" },
        { status: 404 },
      );
    }

    // Check if already installed
    const { data: existing } = await supabase
      .from("exo_user_installations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("registry_id", registryItem.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Already installed" }, { status: 409 });
    }

    // If it's a mod, check if required rigs are connected
    if (registryItem.type === "mod" && registryItem.requires_rigs?.length > 0) {
      const { data: connections } = await supabase
        .from("exo_rig_connections")
        .select("rig_slug")
        .eq("tenant_id", tenantId)
        .not("access_token", "is", null);

      const connectedRigs = new Set(connections?.map((c) => c.rig_slug) || []);
      const hasRequiredRig = registryItem.requires_rigs.some((r: string) =>
        connectedRigs.has(r),
      );

      if (!hasRequiredRig) {
        return NextResponse.json(
          {
            error: "Missing required Rig connection",
            required_rigs: registryItem.requires_rigs,
            message: `This Mod requires at least one of: ${registryItem.requires_rigs.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    // Create installation
    const { data: installation, error: insertError } = await supabase
      .from("exo_user_installations")
      .insert({
        tenant_id: tenantId,
        registry_id: registryItem.id,
        config: config || {},
        enabled: true,
        // For quests
        started_at:
          registryItem.type === "quest" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Installations] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to install" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      installation,
      message: `${registryItem.name} installed successfully`,
    });
  } catch (error) {
    console.error("[Installations] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
