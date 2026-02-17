/**
 * Guardian Values Cron
 *
 * Runs weekly (Sundays at 08:00 UTC).
 * Detects value drift and creates reconfirmation check-ins.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getAlignmentGuardian } from "@/lib/autonomy/guardian";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const guardian = getAlignmentGuardian();

  const supabase = getServiceSupabase();

  try {
    // Get active tenants
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id")
      .in("subscription_status", ["active", "trial"])
      .limit(100);

    let driftsDetected = 0;
    let conflictsFound = 0;
    let reconfirmationsCreated = 0;

    for (const tenant of tenants || []) {
      // 1. Detect value drift
      const driftResult = await guardian.detectValueDrift(tenant.id);

      if (driftResult.driftDetected) {
        driftsDetected++;
      }

      // 2. Create reconfirmation intervention if needed
      if (driftResult.suggestReconfirmation) {
        const driftAreas = driftResult.areas.map((a) => a.area).join(", ");

        await supabase.rpc("propose_intervention", {
          p_tenant_id: tenant.id,
          p_type: "gap_detection",
          p_title: "Sprawdzenie priorytetow",
          p_description: driftAreas
            ? `Zauwazylismy zmiany w Twoich wzorcach dotyczacych: ${driftAreas}. Czy Twoje priorytety sie zmienily?`
            : "Minelo troche czasu od ostatniego sprawdzenia Twoich priorytetow. Czy cos sie zmienilo?",
          p_action_payload: {
            action: "trigger_checkin",
            params: {
              checkinType: "value_reconfirmation",
              areas: driftResult.areas,
            },
          },
          p_priority: "low",
          p_source_agent: "guardian-values-cron",
          p_requires_approval: true,
          p_scheduled_for: null,
        });

        reconfirmationsCreated++;
      }

      // 3. Detect value conflicts
      const conflicts = await guardian.detectValueConflicts(tenant.id);
      conflictsFound += conflicts.length;
    }

    const duration = Date.now() - startTime;

    logger.info("[GuardianValues] Cron complete:", {
      tenantsChecked: tenants?.length || 0,
      driftsDetected,
      conflictsFound,
      reconfirmationsCreated,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      tenants_checked: tenants?.length || 0,
      drifts_detected: driftsDetected,
      conflicts_found: conflictsFound,
      reconfirmations_created: reconfirmationsCreated,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[GuardianValues] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "guardian-values" }, handler);
