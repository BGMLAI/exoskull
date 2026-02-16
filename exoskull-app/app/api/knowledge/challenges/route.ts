/**
 * Challenges API
 *
 * Specific tasks/challenges that can belong to a Mission or Quest.
 * Supports difficulty levels and recurrence patterns.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

// ============================================================================
// GET - List challenges
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get("missionId");
    const questId = searchParams.get("questId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("user_challenges")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (missionId) query = query.eq("mission_id", missionId);
    if (questId) query = query.eq("quest_id", questId);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      console.error("[Challenges API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      challenges: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Challenges API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST - Create challenge
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = getServiceSupabase();
    const body = await request.json();
    const {
      title,
      description,
      missionId,
      questId,
      status,
      difficulty,
      dueDate,
      recurrencePattern,
    } = body;

    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_challenges")
      .insert({
        tenant_id: tenantId,
        mission_id: missionId,
        quest_id: questId,
        title,
        description,
        status: status || "active",
        difficulty: difficulty,
        due_date: dueDate,
        recurrence_pattern: recurrencePattern,
      })
      .select()
      .single();

    if (error) {
      console.error("[Challenges API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, challenge: data });
  } catch (error) {
    console.error("[Challenges API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Update challenge
// ============================================================================

export async function PATCH(request: NextRequest) {
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
    if (updates.difficulty !== undefined)
      dbUpdates.difficulty = updates.difficulty;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.recurrencePattern !== undefined)
      dbUpdates.recurrence_pattern = updates.recurrencePattern;

    const { data, error } = await supabase
      .from("user_challenges")
      .update(dbUpdates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Challenges API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, challenge: data });
  } catch (error) {
    console.error("[Challenges API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE - Delete challenge
// ============================================================================

export async function DELETE(request: NextRequest) {
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
      .from("user_challenges")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Challenges API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Challenges API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
