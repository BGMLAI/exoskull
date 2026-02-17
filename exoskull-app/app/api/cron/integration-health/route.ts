/**
 * CRON: Integration Health Monitor
 * Schedule: Every 5 minutes
 * Purpose: Check health of all integrations (Gmail, Outlook, Twilio, etc.)
 *          Auto-disable after 3 failures (circuit breaker)
 *          Alert user when integration degrades/fails
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { createClient } from "@/lib/supabase/server";
import {
  runAllHealthChecks,
  getDegradedIntegrations,
} from "@/lib/autonomy/integration-health";
import { checkAndRefreshExpiring } from "@/lib/autonomy/token-refresh";
import { dispatchReport } from "@/lib/reports/report-dispatcher";

import { logger } from "@/lib/logger";
async function handler(_req: NextRequest) {
  const supabase = await createClient();

  // STEP 1: Proactive token refresh (before health checks)
  // Refresh any OAuth tokens expiring in next 5 minutes
  const refreshResults = await checkAndRefreshExpiring();
  const tokensRefreshed = refreshResults.filter((r) => r.success).length;
  const refreshFailed = refreshResults.filter((r) => !r.success).length;

  logger.info("[IntegrationHealthCRON] Token refresh:", {
    refreshed: tokensRefreshed,
    failed: refreshFailed,
  });

  // STEP 2: Get all active tenants
  const { data: tenants, error } = await supabase
    .from("exo_tenants")
    .select("id, name, email")
    .eq("subscription_status", "active")
    .limit(1000);

  if (error) {
    logger.error(
      "[IntegrationHealthCRON] Failed to fetch tenants:",
      error.message,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    tenantId: string;
    tenantName: string;
    checksRun: number;
    degraded: number;
    down: number;
    alertSent: boolean;
  }> = [];

  // Run health checks for each tenant
  for (const tenant of tenants || []) {
    try {
      // Run all health checks (Gmail, Outlook, Twilio, etc.)
      await runAllHealthChecks(tenant.id);

      // Check for degraded/down integrations
      const degradedIntegrations = await getDegradedIntegrations(tenant.id);

      const degradedCount = degradedIntegrations.filter(
        (i) => i.status === "degraded",
      ).length;
      const downCount = degradedIntegrations.filter(
        (i) => i.status === "down",
      ).length;

      let alertSent = false;

      // Send proactive alert if any integration is down
      if (downCount > 0) {
        const downIntegrations = degradedIntegrations
          .filter((i) => i.status === "down")
          .map((i) => i.integration_type)
          .join(", ");

        const message = `⚠️ Integration Failed\n\n${downCount} integration(s) are down: ${downIntegrations}. Please check your connections.\n\nGo to: /dashboard/settings/integrations`;
        await dispatchReport(tenant.id, message, "insight");

        alertSent = true;
      }

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name || tenant.email,
        checksRun: 1, // At least 1 check per tenant (more if multiple integrations)
        degraded: degradedCount,
        down: downCount,
        alertSent,
      });
    } catch (error) {
      logger.error(
        `[IntegrationHealthCRON] Error checking tenant ${tenant.id}:`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name || tenant.email,
        checksRun: 0,
        degraded: 0,
        down: 0,
        alertSent: false,
      });
    }
  }

  const totalDegraded = results.reduce((sum, r) => sum + r.degraded, 0);
  const totalDown = results.reduce((sum, r) => sum + r.down, 0);
  const totalAlerts = results.filter((r) => r.alertSent).length;

  return NextResponse.json({
    tokenRefresh: {
      refreshed: tokensRefreshed,
      failed: refreshFailed,
    },
    healthChecks: {
      tenantsChecked: tenants?.length || 0,
      totalDegraded,
      totalDown,
      alertsSent: totalAlerts,
    },
    results,
  });
}

export const GET = withCronGuard({ name: "integration-health" }, handler);
