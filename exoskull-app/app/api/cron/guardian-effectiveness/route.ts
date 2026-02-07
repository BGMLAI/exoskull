/**
 * Guardian Effectiveness Cron
 *
 * Runs daily at 06:00 UTC.
 * Measures effectiveness of interventions executed 24h and 7d ago.
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getAlignmentGuardian } from "@/lib/autonomy/guardian";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const guardian = getAlignmentGuardian();

  const supabase = getServiceSupabase();

  try {
    // Find interventions needing 24h measurement
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const twentyFiveHoursAgo = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString();

    const { data: need24h } = await supabase
      .from("exo_intervention_effectiveness")
      .select("intervention_id")
      .is("measured_at_24h", null)
      .lte("created_at", twentyFourHoursAgo)
      .gte("created_at", twentyFiveHoursAgo)
      .limit(50);

    let measured24h = 0;
    for (const record of need24h || []) {
      const result = await guardian.measureEffectiveness(
        record.intervention_id,
      );
      if (result) measured24h++;
    }

    // Find interventions needing 7d measurement
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: need7d } = await supabase
      .from("exo_intervention_effectiveness")
      .select("intervention_id")
      .not("measured_at_24h", "is", null)
      .is("measured_at_7d", null)
      .lte("measured_at_24h", sevenDaysAgo)
      .gte("measured_at_24h", eightDaysAgo)
      .limit(50);

    let measured7d = 0;
    for (const record of need7d || []) {
      const result = await guardian.measureEffectiveness(
        record.intervention_id,
      );
      if (result) measured7d++;
    }

    // Auto-throttle adjustment for all active tenants
    const { data: activeTenants } = await supabase
      .from("exo_tenants")
      .select("id")
      .eq("subscription_status", "active")
      .limit(100);

    let throttleAdjusted = 0;
    for (const tenant of activeTenants || []) {
      const config = await guardian.calculateThrottle(tenant.id);
      if (config.maxInterventionsPerDay < 10) throttleAdjusted++;
    }

    const duration = Date.now() - startTime;

    logger.info("[GuardianEffectiveness] Cron complete:", {
      measured24h,
      measured7d,
      throttleAdjusted,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      measured_24h: measured24h,
      measured_7d: measured7d,
      throttle_adjusted: throttleAdjusted,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GuardianEffectiveness] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "guardian-effectiveness" }, handler);
