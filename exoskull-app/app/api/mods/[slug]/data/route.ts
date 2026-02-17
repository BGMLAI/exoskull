/**
 * GET/POST /api/mods/[slug]/data - CRUD for Mod data
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// GET - Fetch recent data entries for a Mod
export const GET = withApiLog(async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { slug } = params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exo_mod_data")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("mod_slug", slug)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[Mod Data] GET error for ${slug}:`, error);
      return NextResponse.json(
        { error: "Failed to fetch data" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("[Mod Data] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

// POST - Add a new data entry for a Mod
export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { slug } = params;
    const body = await request.json();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exo_mod_data")
      .insert({
        tenant_id: tenantId,
        mod_slug: slug,
        data: body,
      })
      .select()
      .single();

    if (error) {
      console.error(`[Mod Data] POST error for ${slug}:`, error);
      return NextResponse.json(
        { error: "Failed to save data" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (error) {
    console.error("[Mod Data] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
