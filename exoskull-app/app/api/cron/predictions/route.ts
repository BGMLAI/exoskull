/**
 * CRON: Health Predictions
 *
 * Runs daily at 06:00 UTC.
 * Analyzes last 14 days of health data per tenant,
 * generates predictions, and creates interventions for high-confidence ones.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";
import {
  runPredictions,
  storePredictions,
  createInterventionsFromPredictions,
} from "@/lib/predictions/prediction-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  const results = {
    processed: 0,
    predictions_generated: 0,
    interventions_created: 0,
    skipped_no_data: 0,
    errors: [] as string[],
  };

  try {
    // Find tenants with recent health data (last 14 days)
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const { data: tenantRows, error: tenantError } = await supabase
      .from("exo_health_metrics")
      .select("tenant_id")
      .gte("recorded_at", since.toISOString())
      .limit(1000);

    if (tenantError) {
      logger.error("[PredictionsCron] Failed to fetch tenants:", {
        error: tenantError.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: tenantError.message,
          timestamp: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        },
        { status: 500 },
      );
    }

    // Deduplicate tenant IDs
    const tenantIds = [...new Set((tenantRows || []).map((r) => r.tenant_id))];

    logger.info(
      `[PredictionsCron] Processing ${tenantIds.length} tenants with health data`,
    );

    for (const tenantId of tenantIds) {
      results.processed++;

      try {
        const predictions = await runPredictions(tenantId);

        if (predictions.length === 0) {
          results.skipped_no_data++;
          continue;
        }

        results.predictions_generated += predictions.length;

        await storePredictions(predictions);

        const interventionsCreated =
          await createInterventionsFromPredictions(predictions);
        results.interventions_created += interventionsCreated;

        // Send immediate SMS for high-confidence urgent predictions
        const urgent = predictions.filter(
          (p) =>
            p.confidence >= 0.7 &&
            (p.severity === "high" || p.severity === "critical"),
        );
        if (urgent.length > 0) {
          const messages = urgent
            .map((p) => p.message_pl || p.message_en || p.metric)
            .join("\n");
          await sendProactiveMessage(
            tenantId,
            `Predykcja zdrowotna:\n${messages}\n\nChcesz omówić plan działania?`,
            "health_prediction",
            "predictions-cron",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${tenantId}: ${msg}`);
        logger.error("[PredictionsCron] Error for tenant:", {
          tenantId,
          error: msg,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info("[PredictionsCron] Completed:", { ...results, durationMs });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      results: {
        ...results,
        error_count: results.errors.length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error("[PredictionsCron] Fatal error:", msg);

    return NextResponse.json(
      {
        success: false,
        error: msg,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        results,
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "predictions" }, handler);
