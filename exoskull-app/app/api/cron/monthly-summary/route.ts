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
    .eq("subscription_status", "active");

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

  for (const tenant of activeTenants) {
    results.processed++;

    try {
      const summary = await generateMonthlySummary(tenant.id);

      if (!summary) {
        results.skipped_empty++;
        continue;
      }

      results.summaries_generated++;

      const dispatchResult = await dispatchReport(
        tenant.id,
        summary,
        "monthly",
      );

      if (dispatchResult.success) {
        results.dispatched++;
      } else {
        results.errors.push(
          `${tenant.id}: dispatch failed — ${dispatchResult.error}`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MonthlySummary] Error for tenant ${tenant.id}:`, {
        error: msg,
      });
      results.errors.push(`${tenant.id}: ${msg}`);
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
