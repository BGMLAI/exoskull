import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RIG_DEFINITIONS } from "@/lib/rigs";

export const dynamic = "force-dynamic";

/**
 * GET /api/rigs — List all available rigs + user connection status
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user's rig connections
    const { data: connections, error } = await supabase
      .from("exo_rig_connections")
      .select("rig_slug, sync_status, last_sync_at, created_at, metadata")
      .eq("tenant_id", user.id);

    if (error) {
      console.error("[RigsAPI] Connections fetch error:", error);
    }

    const connectionMap = new Map(
      (connections || []).map((c) => [c.rig_slug, c]),
    );

    // Build rig list with connection status
    const rigs = Object.values(RIG_DEFINITIONS).map((rig) => {
      const conn = connectionMap.get(rig.slug);
      const connected = conn?.sync_status === "success";
      const connectedAt =
        conn?.metadata?.connected_at || conn?.created_at || null;

      return {
        slug: rig.slug,
        name: rig.name,
        description: rig.description,
        icon: rig.icon,
        category: rig.category,
        connected,
        sync_status: conn?.sync_status || null,
        last_sync_at: conn?.last_sync_at || null,
        connected_at: connectedAt,
        has_oauth: !!rig.oauth,
      };
    });

    return NextResponse.json({
      rigs,
      total: rigs.length,
      connected: rigs.filter((r) => r.connected).length,
    });
  } catch (error) {
    console.error("[RigsAPI] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
