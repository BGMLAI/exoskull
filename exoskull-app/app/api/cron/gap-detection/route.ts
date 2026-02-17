// =====================================================
// CRON: /api/cron/gap-detection
// Runs gap detection for all active tenants (weekly)
// Schedule: Sundays at 09:00 UTC
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { detectGaps } from "@/lib/agents/specialized/gap-detector";
import { logger } from "@/lib/logger";
import {
  executeSwarm,
  getSwarmDefinition,
  collectSwarmContext,
} from "@/lib/ai/swarm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  try {
    // Get active tenants
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id")
      .in("subscription_status", ["active", "trial"])
      .limit(100);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        status: "completed",
        tenants_checked: 0,
        message: "No active tenants",
        duration_ms: Date.now() - startTime,
      });
    }

    let successCount = 0;
    let errorCount = 0;
    let totalGaps = 0;
    const errors: Array<{ tenant_id: string; error: string }> = [];

    for (const tenant of tenants) {
      try {
        const result = await detectGaps(tenant.id, true); // forceRun=true (CRON is the trigger)

        if (result.success) {
          successCount++;
          const data = result.result as Record<string, number> | undefined;
          totalGaps += data?.gapsDetected || 0;
        } else {
          errorCount++;
          errors.push({
            tenant_id: tenant.id,
            error: result.error || "Unknown error",
          });
        }
      } catch (error) {
        errorCount++;
        errors.push({
          tenant_id: tenant.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const gapDuration = Date.now() - startTime;

    logger.info("[GapDetection] Deterministic analysis complete:", {
      tenantsChecked: tenants.length,
      successCount,
      errorCount,
      totalGaps,
      durationMs: gapDuration,
    });

    // =========================================================
    // SWARM ENHANCEMENT: AI-powered synthesis (additive)
    // Run for tenants with significant gaps only
    // =========================================================
    let swarmResults = 0;
    const swarmDefinition = getSwarmDefinition("gap_detection");

    if (swarmDefinition && totalGaps > 0) {
      // Run swarm for up to 5 tenants with gaps (cost control)
      const tenantsWithGaps = tenants.slice(0, 5);

      for (const tenant of tenantsWithGaps) {
        try {
          const context = await collectSwarmContext(
            supabase,
            tenant.id,
            "gap_detection",
          );
          const swarmResult = await executeSwarm(swarmDefinition, context);

          // Store swarm synthesis
          await supabase.from("learning_events").insert({
            tenant_id: tenant.id,
            event_type: "swarm_analysis",
            data: {
              swarmType: "gap_detection",
              synthesis: swarmResult.synthesis,
              agentsSucceeded: swarmResult.agentsSucceeded,
              agentsFailed: swarmResult.agentsFailed,
              totalCost: swarmResult.totalCost,
              cronTriggered: true,
            },
            agent_id: "swarm:gap_detection",
          });

          swarmResults++;
        } catch (swarmError) {
          // Swarm failure is non-critical — existing analysis still works
          logger.warn(
            `[GapDetection] Swarm failed for tenant ${tenant.id}:`,
            swarmError instanceof Error ? swarmError.message : swarmError,
          );
        }
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      status: "completed",
      tenants_checked: tenants.length,
      success_count: successCount,
      error_count: errorCount,
      total_gaps: totalGaps,
      swarm_analyses: swarmResults,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[GapDetection] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "gap-detection" }, handler);
