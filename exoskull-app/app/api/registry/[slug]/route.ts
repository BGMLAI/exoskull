import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/registry/[slug] - Get single item details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    // Get registry item
    const { data: item, error } = await supabase
      .from("exo_registry")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // If it's a mod, get info about required rigs
    let required_rigs_info = null;
    if (item.type === "mod" && item.requires_rigs?.length > 0) {
      const { data: rigs } = await supabase
        .from("exo_registry")
        .select("slug, name, icon, description")
        .in("slug", item.requires_rigs);

      required_rigs_info = rigs;
    }

    // Check if user is authenticated and get their installation status
    const auth = await verifyTenantAuth(request);
    let installation = null;
    let connection = null;

    if (auth.ok) {
      const tenantId = auth.tenantId;
      // Check if installed
      const { data: inst } = await supabase
        .from("exo_user_installations")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("registry_id", item.id)
        .single();

      installation = inst;

      // If it's a rig, check connection status
      if (item.type === "rig") {
        const { data: conn } = await supabase
          .from("exo_rig_connections")
          .select(
            "id, rig_slug, last_sync_at, sync_status, sync_error, metadata",
          )
          .eq("tenant_id", tenantId)
          .eq("rig_slug", slug)
          .single();

        connection = conn;
      }
    }

    return NextResponse.json({
      item,
      required_rigs_info,
      user_status: {
        is_authenticated: auth.ok,
        installation,
        connection,
      },
    });
  } catch (error) {
    console.error("[Registry] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
