/**
 * Canvas Tasks Data API
 *
 * GET /api/canvas/data/tasks — Returns TaskStats for the TasksWidget.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTaskStats } from "@/lib/tasks/task-service";

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

    // Count tasks by status via dual-read service
    const stats = await getTaskStats(user.id);

    return NextResponse.json({ stats, series: [] });
  } catch (error) {
    console.error("[Canvas] Tasks data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
