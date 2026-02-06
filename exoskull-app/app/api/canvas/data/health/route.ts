/**
 * Canvas Health Data API
 *
 * GET /api/canvas/data/health — Returns HealthSummary for the HealthWidget.
 * Thin wrapper reusing the same queries as the dashboard health page.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { HealthSummary, DataPoint } from "@/lib/dashboard/types";

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

    const today = new Date().toISOString().split("T")[0];

    // Fetch today's health metrics
    const { data: healthData } = await supabase
      .from("exo_daily_health")
      .select("steps, sleep_minutes, hrv_avg")
      .eq("tenant_id", user.id)
      .eq("date", today)
      .maybeSingle();

    // Fetch 7-day sleep series
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: sleepRows } = await supabase
      .from("exo_daily_health")
      .select("date, sleep_minutes")
      .eq("tenant_id", user.id)
      .gte("date", sevenDaysAgo.toISOString().split("T")[0])
      .order("date", { ascending: true });

    const sleepSeries: DataPoint[] = (sleepRows || []).map((r) => ({
      date: r.date,
      value: r.sleep_minutes ? Math.round((r.sleep_minutes / 60) * 10) / 10 : 0,
    }));

    const summary: HealthSummary = {
      steps: healthData?.steps ?? null,
      sleepMinutes: healthData?.sleep_minutes ?? null,
      hrv: healthData?.hrv_avg ?? null,
      sleepSeries,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Canvas] Health data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
