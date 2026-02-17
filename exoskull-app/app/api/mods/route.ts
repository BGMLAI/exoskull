/**
 * GET /api/mods - List installed Mods for the current user
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exo_tenant_mods")
      .select(
        `
        id,
        active,
        installed_at,
        mod:exo_mod_registry (
          id, slug, name, description, icon, category, config
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("active", true);

    if (error) {
      console.error("[Mods API] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch mods" },
        { status: 500 },
      );
    }

    return NextResponse.json({ mods: data || [] });
  } catch (error) {
    console.error("[Mods API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
