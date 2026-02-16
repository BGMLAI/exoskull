/**
 * Ops API (Tasks/Missions)
 *
 * First level of actionable organization.
 * Ops can belong to Quests and be associated with a Loop.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

export const dynamic = "force-dynamic";

type OpStatus = "pending" | "active" | "completed" | "dropped" | "blocked";

// ============================================================================
// GET - List ops
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const questId = searchParams.get("questId");
    const loopSlug = searchParams.get("loop");
    const status = searchParams.get("status") as OpStatus | null;
    const overdue = searchParams.get("overdue");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    let query = supabase
      .from("user_ops")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .range(offset, offset + limit - 1);

    if (questId) query = query.eq("quest_id", questId);
    if (loopSlug) query = query.eq("loop_slug", loopSlug);
    if (status) query = query.eq("status", status);
    if (overdue === "true") {
      query = query
        .lt("due_date", new Date().toISOString())
        .eq("status", "pending");
    }

    // Default sort: overdue first, then by priority, then by due_date
    query = query.order("due_date", { ascending: true, nullsFirst: false });
    query = query.order("priority", { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error("[Ops API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      ops: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Ops API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST - Create op
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await request.json();
    const {
      tenantId,
      title,
      description,
      questId,
      loopSlug,
      priority,
      dueDate,
      scheduledFor,
      estimatedEffort,
      tags,
      isRecurring,
      recurrenceRule,
    } = body;

    if (!tenantId || !title) {
      return NextResponse.json(
        { error: "tenantId and title required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_ops")
      .insert({
        tenant_id: tenantId,
        title,
        description,
        quest_id: questId,
        loop_slug: loopSlug,
        priority: priority || 5,
        due_date: dueDate,
        scheduled_for: scheduledFor,
        estimated_effort: estimatedEffort,
        tags: tags || [],
        is_recurring: isRecurring || false,
        recurrence_rule: recurrenceRule,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[Ops API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, op: data });
  } catch (error) {
    console.error("[Ops API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Update op
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await request.json();
    const { opId, tenantId, ...updates } = body;

    if (!opId || !tenantId) {
      return NextResponse.json(
        { error: "opId and tenantId required" },
        { status: 400 },
      );
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.questId !== undefined) dbUpdates.quest_id = updates.questId;
    if (updates.loopSlug !== undefined) dbUpdates.loop_slug = updates.loopSlug;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.scheduledFor !== undefined)
      dbUpdates.scheduled_for = updates.scheduledFor;
    if (updates.estimatedEffort !== undefined)
      dbUpdates.estimated_effort = updates.estimatedEffort;
    if (updates.actualEffort !== undefined)
      dbUpdates.actual_effort = updates.actualEffort;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;

    // Handle status change
    if (updates.status !== undefined) {
      dbUpdates.status = updates.status;
      if (updates.status === "completed") {
        dbUpdates.completed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("user_ops")
      .update(dbUpdates)
      .eq("id", opId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Ops API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, op: data });
  } catch (error) {
    console.error("[Ops API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE - Delete op
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const opId = searchParams.get("opId");

    if (!opId) {
      return NextResponse.json({ error: "opId required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_ops")
      .delete()
      .eq("id", opId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Ops API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Ops API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
