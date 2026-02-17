/**
 * Values API — Core life values (top of hierarchy)
 *
 * CRUD for exo_values. Values sit above loops/areas in the Tyrolka hierarchy.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// GET - List values
// ============================================================================

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const withStats = searchParams.get("withStats") === "true";

    const { data, error } = await supabase
      .from("exo_values")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (error) {
      console.error("[Values API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (withStats && data) {
      const valuesWithStats = await Promise.all(
        data.map(async (value) => {
          const { data: loops, count } = await supabase
            .from("user_loops")
            .select("id, name, slug, icon, color", { count: "exact" })
            .eq("tenant_id", tenantId)
            .eq("value_id", value.id)
            .eq("is_active", true);

          return {
            ...value,
            stats: { linkedLoops: count || 0 },
            loops: loops || [],
          };
        }),
      );

      return NextResponse.json({ values: valuesWithStats });
    }

    return NextResponse.json({ values: data });
  } catch (error) {
    console.error("[Values API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// POST - Create value (or initialize defaults)
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { name, description, icon, color, priority, initDefaults } = body;

    // Initialize default values + link to loops
    if (initDefaults) {
      await supabase.rpc("create_default_values", { p_tenant_id: tenantId });
      await supabase.rpc("link_default_values_to_loops", {
        p_tenant_id: tenantId,
      });

      const { data: values } = await supabase
        .from("exo_values")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: false });

      return NextResponse.json({ success: true, values });
    }

    // Create custom value
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("exo_values")
      .insert({
        tenant_id: tenantId,
        name,
        description: description || null,
        icon: icon || null,
        color: color || null,
        priority: priority || 5,
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Value with this name already exists" },
          { status: 409 },
        );
      }
      console.error("[Values API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, value: data });
  } catch (error) {
    console.error("[Values API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// PATCH - Update value
// ============================================================================

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { valueId, ...updates } = body;

    if (!valueId) {
      return NextResponse.json({ error: "valueId required" }, { status: 400 });
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data, error } = await supabase
      .from("exo_values")
      .update(dbUpdates)
      .eq("id", valueId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Values API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, value: data });
  } catch (error) {
    console.error("[Values API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// DELETE - Delete value (only custom, not default)
// ============================================================================

export const DELETE = withApiLog(async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const valueId = searchParams.get("valueId");

    if (!valueId) {
      return NextResponse.json({ error: "valueId required" }, { status: 400 });
    }

    const { data: value } = await supabase
      .from("exo_values")
      .select("is_default")
      .eq("id", valueId)
      .eq("tenant_id", tenantId)
      .single();

    if (value?.is_default) {
      return NextResponse.json(
        { error: "Cannot delete default values" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("exo_values")
      .delete()
      .eq("id", valueId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Values API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Values API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
