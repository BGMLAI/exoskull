/**
 * Campaigns API
 *
 * Major initiatives grouping multiple Quests.
 * Linked to Objectives (MITs).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// GET - List campaigns
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const loopSlug = searchParams.get("loop");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    let query = supabase
      .from("user_campaigns")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (loopSlug) query = query.eq("loop_slug", loopSlug);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;

    if (error) {
      console.error("[Campaigns API] GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({
      campaigns: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Campaigns API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST - Create campaign
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const {
      tenantId,
      title,
      vision,
      loopSlug,
      objectiveIds,
      startDate,
      targetDate,
    } = body;

    if (!tenantId || !title) {
      return NextResponse.json(
        { error: "tenantId and title required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_campaigns")
      .insert({
        tenant_id: tenantId,
        title,
        vision,
        loop_slug: loopSlug,
        objective_ids: objectiveIds || [],
        start_date: startDate,
        target_date: targetDate,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("[Campaigns API] POST error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaign: data });
  } catch (error) {
    console.error("[Campaigns API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PATCH - Update campaign
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { campaignId, tenantId, ...updates } = body;

    if (!campaignId || !tenantId) {
      return NextResponse.json(
        { error: "campaignId and tenantId required" },
        { status: 400 },
      );
    }

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.vision !== undefined) dbUpdates.vision = updates.vision;
    if (updates.loopSlug !== undefined) dbUpdates.loop_slug = updates.loopSlug;
    if (updates.objectiveIds !== undefined)
      dbUpdates.objective_ids = updates.objectiveIds;
    if (updates.startDate !== undefined)
      dbUpdates.start_date = updates.startDate;
    if (updates.targetDate !== undefined)
      dbUpdates.target_date = updates.targetDate;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    const { data, error } = await supabase
      .from("user_campaigns")
      .update(dbUpdates)
      .eq("id", campaignId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[Campaigns API] PATCH error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaign: data });
  } catch (error) {
    console.error("[Campaigns API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// DELETE - Delete campaign
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const tenantId = searchParams.get("tenantId");

    if (!campaignId || !tenantId) {
      return NextResponse.json(
        { error: "campaignId and tenantId required" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("user_campaigns")
      .delete()
      .eq("id", campaignId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[Campaigns API] DELETE error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Campaigns API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
