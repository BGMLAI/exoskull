/**
 * GET /api/canvas/activity-feed — Recent IORS activity log
 *
 * Returns chronological activity entries for the authenticated user.
 * Powers the Activity Feed widget on the canvas.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10),
      100,
    );
    const actionType = url.searchParams.get("type"); // optional filter

    let query = supabase
      .from("exo_activity_log")
      .select(
        "id, action_type, action_name, description, status, source, metadata, created_at",
      )
      .eq("tenant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (actionType) {
      query = query.eq("action_type", actionType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[ActivityFeed] Query failed:", {
        error: error.message,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Failed to fetch activity" },
        { status: 500 },
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("[ActivityFeed] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
