/**
 * Missions API
 *
 * Actionable objectives within a Quest.
 * Tracks progress via total_ops / completed_ops.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// GET - List missions
// ============================================================================

export const GET = withApiLog(async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const questId = searchParams.get("questId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("user_missions")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (questId) query = query.eq("quest_id", questId);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      console.error("[Missions API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      missions: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Missions API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// POST - Create mission
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { title, description, questId, status, tags, startDate, targetDate } =
      body;

    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_missions")
      .insert({
        tenant_id: tenantId,
        quest_id: questId,
        title,
        description,
        status: status || "active",
        tags: tags || [],
        start_date: startDate,
        target_date: targetDate,
      })
      .select()
      .single();

    if (error) {
      console.error("[Missions API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, mission: data });
  } catch (error) {
    console.error("[Missions API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// PATCH - Update mission
// ============================================================================

export const PATCH = withApiLog(async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
    if (updates.totalOps !== undefined) dbUpdates.total_ops = updates.totalOps;
    if (updates.completedOps !== undefined)
      dbUpdates.completed_ops = updates.completedOps;
    if (updates.startDate !== undefined)
      dbUpdates.start_date = updates.startDate;
    if (updates.targetDate !== undefined)
      dbUpdates.target_date = updates.targetDate;

    const { data, error } = await supabase
      .from("user_missions")
      .update(dbUpdates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Missions API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, mission: data });
  } catch (error) {
    console.error("[Missions API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});

// ============================================================================
// DELETE - Delete mission
// ============================================================================

export const DELETE = withApiLog(async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_missions")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Missions API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Missions API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
