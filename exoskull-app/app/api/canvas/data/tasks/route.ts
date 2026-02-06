/**
 * Canvas Tasks Data API
 *
 * GET /api/canvas/data/tasks — Returns TaskStats for the TasksWidget.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Count tasks by status
    const { data: tasks } = await supabase
      .from("exo_tasks")
      .select("status")
      .eq("tenant_id", user.id);

    const stats = {
      total: tasks?.length || 0,
      pending: tasks?.filter((t) => t.status === "pending").length || 0,
      in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
      done: tasks?.filter((t) => t.status === "done").length || 0,
      blocked: tasks?.filter((t) => t.status === "blocked").length || 0,
    };

    return NextResponse.json({ stats, series: [] });
  } catch (error) {
    console.error("[Canvas] Tasks data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
