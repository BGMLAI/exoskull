/**
 * Canvas Health Data API
 *
 * GET /api/canvas/data/health — Returns HealthSummary for the HealthWidget.
 * Thin wrapper reusing the same queries as the dashboard health page.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import type {
  HealthSummary,
  HealthPrediction,
  DataPoint,
} from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const today = new Date().toISOString().split("T")[0];

    // Fetch today's health metrics
    const { data: healthData } = await supabase
      .from("exo_daily_health")
      .select("steps, sleep_minutes, hrv_avg")
      .eq("tenant_id", tenantId)
      .eq("date", today)
      .maybeSingle();

    // Fetch 7-day sleep series
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: sleepRows } = await supabase
      .from("exo_daily_health")
      .select("date, sleep_minutes")
      .eq("tenant_id", tenantId)
      .gte("date", sevenDaysAgo.toISOString().split("T")[0])
      .order("date", { ascending: true });

    const sleepSeries: DataPoint[] = (sleepRows || []).map((r) => ({
      date: r.date,
      value: r.sleep_minutes ? Math.round((r.sleep_minutes / 60) * 10) / 10 : 0,
    }));

    // Fetch active predictions (not expired, recent)
    const { data: predRows } = await supabase
      .from("exo_predictions")
      .select(
        "metric, probability, confidence, severity, message_pl, message_en",
      )
      .eq("tenant_id", tenantId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(4);

    const predictions: HealthPrediction[] = (predRows || []).map((p) => ({
      metric: p.metric,
      probability: p.probability,
      confidence: p.confidence,
      severity: p.severity,
      message: p.message_pl || p.message_en || p.metric,
    }));

    const summary: HealthSummary = {
      steps: healthData?.steps ?? null,
      sleepMinutes: healthData?.sleep_minutes ?? null,
      hrv: healthData?.hrv_avg ?? null,
      sleepSeries,
      predictions: predictions.length > 0 ? predictions : undefined,
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
