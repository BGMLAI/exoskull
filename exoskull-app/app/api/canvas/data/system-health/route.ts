/**
 * Canvas System Health Data API
 *
 * GET /api/canvas/data/system-health — Returns user-facing health snapshot
 * for the SystemHealthWidget.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSystemHealthSnapshot } from "@/lib/system/events";

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

    // Get health snapshot scoped to this tenant
    const snapshot = await getSystemHealthSnapshot(user.id);

    return NextResponse.json({
      overall_status: snapshot.overall_status,
      subsystems: snapshot.subsystems,
      alerts: snapshot.alerts,
      timestamp: snapshot.timestamp,
    });
  } catch (error) {
    console.error("[CanvasSystemHealth] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
