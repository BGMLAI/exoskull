/**
 * Quests API (Projects)
 *
 * Groups of related Ops. Can belong to Campaigns.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// ============================================================================
// GET - List quests
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const campaignId = searchParams.get("campaignId");
    const loopSlug = searchParams.get("loop");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    let query = supabase
      .from("user_quests")
      .select("*, user_ops(count)", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (loopSlug) query = query.eq("loop_slug", loopSlug);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      console.error("[Quests API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      quests: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Quests API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST - Create quest
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await request.json();
    const {
      tenantId,
      title,
      description,
      campaignId,
      loopSlug,
      targetOps,
      startDate,
      deadline,
      tags,
    } = body;

    if (!tenantId || !title) {
      return NextResponse.json(
        { error: "tenantId and title required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_quests")
      .insert({
        tenant_id: tenantId,
        title,
        description,
        campaign_id: campaignId,
        loop_slug: loopSlug,
        target_ops: targetOps,
        start_date: startDate,
        deadline,
        tags: tags || [],
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("[Quests API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, quest: data });
  } catch (error) {
    console.error("[Quests API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Update quest
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const body = await request.json();
    const { questId, tenantId, ...updates } = body;

    if (!questId || !tenantId) {
      return NextResponse.json(
        { error: "questId and tenantId required" },
        { status: 400 },
      );
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.campaignId !== undefined)
      dbUpdates.campaign_id = updates.campaignId;
    if (updates.loopSlug !== undefined) dbUpdates.loop_slug = updates.loopSlug;
    if (updates.targetOps !== undefined)
      dbUpdates.target_ops = updates.targetOps;
    if (updates.startDate !== undefined)
      dbUpdates.start_date = updates.startDate;
    if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    const { data, error } = await supabase
      .from("user_quests")
      .update(dbUpdates)
      .eq("id", questId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Quests API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, quest: data });
  } catch (error) {
    console.error("[Quests API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE - Delete quest
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(request.url);
    const questId = searchParams.get("questId");
    const tenantId = searchParams.get("tenantId");

    if (!questId || !tenantId) {
      return NextResponse.json(
        { error: "questId and tenantId required" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("user_quests")
      .delete()
      .eq("id", questId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Quests API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Quests API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
