/**
 * CRON: Signal Triage — processes ALL incoming signals
 * Schedule: Every 15 minutes
 *
 * Collects signals from emails, messages, calendar, health alerts,
 * classifies them, and proposes actions leading to goal realization.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { processNewSignals } from "@/lib/signals/triage-engine";
import { reviewAllStrategies } from "@/lib/goals/strategy-engine";
import { getActiveTenants } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

async function handler(_req: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Triage new signals
    const triageResult = await processNewSignals(20);

    // 2. Review active goal strategies (execute pending steps)
    const tenants = await getActiveTenants();
    let strategiesReviewed = 0;
    let stepsExecuted = 0;
    let strategiesRegenerated = 0;

    for (const tenant of tenants) {
      try {
        const review = await reviewAllStrategies(tenant.id);
        strategiesReviewed += review.reviewed;
        stepsExecuted += review.stepsExecuted;
        strategiesRegenerated += review.regenerated;
      } catch (error) {
        logger.error("[SignalTriage CRON] Strategy review failed:", {
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info("[SignalTriage CRON] Complete:", {
      signalsProcessed: triageResult.processed,
      urgentSignals: triageResult.urgent,
      goalLinked: triageResult.goalLinked,
      strategiesReviewed,
      stepsExecuted,
      strategiesRegenerated,
      durationMs,
    });

    return NextResponse.json({
      status: "completed",
      signals: triageResult,
      strategies: {
        reviewed: strategiesReviewed,
        stepsExecuted,
        regenerated: strategiesRegenerated,
      },
      duration_ms: durationMs,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[SignalTriage CRON] Failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "signal-triage" }, handler);
