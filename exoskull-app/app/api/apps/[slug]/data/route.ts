/**
 * Dynamic CRUD API for generated apps.
 * GET  /api/apps/[slug]/data — list entries
 * POST /api/apps/[slug]/data — create entry
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Get app config from registry */
async function getAppConfig(tenantId: string, slug: string) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("exo_generated_apps")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const auth = await verifyTenantAuth(_request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const app = await getAppConfig(tenantId, params.slug);
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const supabase = getServiceSupabase();
  const { data: entries, error } = await supabase
    .from(app.table_name)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[AppAPI] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    app: {
      slug: app.slug,
      name: app.name,
      columns: app.columns,
      ui_config: app.ui_config,
    },
    entries: entries || [],
    total: entries?.length || 0,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const auth = await verifyTenantAuth(request);
  if (!auth.ok) return auth.response;
  const tenantId = auth.tenantId;

  const app = await getAppConfig(tenantId, params.slug);
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const body = await request.json();

  // Validate: only allow known columns
  const validColumns = new Set(
    (app.columns as Array<{ name: string }>).map(
      (c: { name: string }) => c.name,
    ),
  );
  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (validColumns.has(key)) {
      cleanData[key] = value;
    }
  }

  const supabase = getServiceSupabase();
  const { data: entry, error } = await supabase
    .from(app.table_name)
    .insert({
      tenant_id: tenantId,
      ...cleanData,
    })
    .select()
    .single();

  if (error) {
    console.error("[AppAPI] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update usage stats (fire and forget)
  supabase
    .from("exo_generated_apps")
    .update({ last_used_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("slug", params.slug)
    .then(() => {});

  return NextResponse.json({ entry }, { status: 201 });
}
