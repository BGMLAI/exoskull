/**
 * Daily Insight Push CRON
 *
 * Schedule: Every day at 10:00 UTC
 * Pushes top 1-3 cross-domain insights to each active tenant
 * via their preferred channel (telegram/whatsapp/slack/discord/sms/email).
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { pushInsightsForTenant } from "@/lib/insights/insight-pusher";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const supabase = getServiceSupabase();

  // Fetch all active tenants
  const { data: tenants, error: tenantsErr } = await supabase
    .from("exo_tenants")
    .select("id")
    .in("subscription_status", ["active", "trial"]);

  if (tenantsErr) {
    logger.error("[InsightPush] Failed to fetch tenants:", {
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
    insights_pushed: 0,
    skipped_no_insights: 0,
    errors: [] as string[],
  };

  for (const tenant of activeTenants) {
    // Safety: bail before cron-guard timeout (55s) — leave 10s buffer
    if (Date.now() - startTime > 45_000) {
      logger.warn("[InsightPush] Approaching timeout, stopping early", {
        processed: results.processed,
        remaining: activeTenants.length - results.processed,
      });
      break;
    }

    results.processed++;

    try {
      const pushResult = await pushInsightsForTenant(tenant.id);

      if (pushResult.insightsPushed > 0) {
        results.insights_pushed += pushResult.insightsPushed;
      } else if (pushResult.insightsFound === 0) {
        results.skipped_no_insights++;
      } else if (pushResult.error) {
        results.errors.push(`${tenant.id}: ${pushResult.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[InsightPush] Error for tenant ${tenant.id}:`, {
        error: msg,
      });
      results.errors.push(`${tenant.id}: ${msg}`);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info("[InsightPush] Completed:", {
    ...results,
    durationMs,
    error_count: results.errors.length,
  });

  return NextResponse.json({
    success: results.errors.length === 0,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    results: {
      ...results,
      error_count: results.errors.length,
    },
  });
}

export const GET = withCronGuard({ name: "insight-push" }, handler);
