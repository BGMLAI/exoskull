/**
 * Monthly Summary CRON
 *
 * Schedule: 1st of every month 09:00 UTC
 * Generates and dispatches a 30-day recap to every active tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { generateMonthlySummary } from "@/lib/reports/summary-generator";
import { dispatchReport } from "@/lib/reports/report-dispatcher";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  const { data: tenants, error: tenantsErr } = await supabase
    .from("exo_tenants")
    .select("id")
    .in("subscription_status", ["active", "trial"]);

  if (tenantsErr) {
    console.error("[MonthlySummary] Failed to fetch tenants:", {
      error: tenantsErr.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch tenants", details: tenantsErr.message },
      { status: 500 },
    );
  }

  const activeTenants = tenants || [];
  const results = {
    processed: 0,
    summaries_generated: 0,
    dispatched: 0,
    skipped_empty: 0,
    errors: [] as string[],
  };

  // Process tenants in parallel batches of 5 (instead of sequential)
  const BATCH_SIZE = 5;
  for (let i = 0; i < activeTenants.length; i += BATCH_SIZE) {
    const batch = activeTenants.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (tenant) => {
        const summary = await generateMonthlySummary(tenant.id);
        if (!summary) return { tenantId: tenant.id, status: "empty" as const };

        const dispatchResult = await dispatchReport(
          tenant.id,
          summary,
          "monthly",
        );
        return {
          tenantId: tenant.id,
          status: dispatchResult.success
            ? ("dispatched" as const)
            : ("dispatch_failed" as const),
          error: dispatchResult.error,
        };
      }),
    );

    for (const result of batchResults) {
      results.processed++;
      if (result.status === "rejected") {
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        results.errors.push(msg);
      } else if (result.value.status === "empty") {
        results.skipped_empty++;
      } else if (result.value.status === "dispatched") {
        results.summaries_generated++;
        results.dispatched++;
      } else {
        results.summaries_generated++;
        results.errors.push(
          `${result.value.tenantId}: dispatch failed — ${result.value.error}`,
        );
      }
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info("[MonthlySummary] Completed:", {
    ...results,
    durationMs,
    errorCount: results.errors.length,
  });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    results: {
      ...results,
      error_count: results.errors.length,
    },
  });
}

export const GET = withCronGuard({ name: "monthly-summary" }, handler);
