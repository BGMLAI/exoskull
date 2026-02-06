/**
 * CRON: Health Predictions
 *
 * Runs daily at 06:00 UTC.
 * Analyzes last 14 days of health data per tenant,
 * generates predictions, and creates interventions for high-confidence ones.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron/auth";
import {
  runPredictions,
  storePredictions,
  createInterventionsFromPredictions,
} from "@/lib/predictions/prediction-engine";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

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
      console.error("[PredictionsCron] Failed to fetch tenants:", {
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

    console.log(
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${tenantId}: ${msg}`);
        console.error("[PredictionsCron] Error for tenant:", {
          tenantId,
          error: msg,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    console.log("[PredictionsCron] Completed:", { ...results, durationMs });

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
    console.error("[PredictionsCron] Fatal error:", msg);

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
