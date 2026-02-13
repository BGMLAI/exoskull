/**
 * CRON: System Health Report
 * Schedule: Every 15 minutes
 * Purpose: Actively check all subsystems and alert users on critical issues.
 *
 * Checks:
 * - CRON staleness (did critical CRONs run on schedule?)
 * - Tool failure spikes (sudden increase in error rate?)
 * - Integration circuit breakers (any tripped?)
 * - Generated app table health (tables still accessible?)
 * - Database connectivity & latency
 * - Watchdog (MAPEK config, error storms, silent failures)
 *
 * Alerts:
 * - Critical issues → proactive message to all active tenants
 * - Dedup: same alert not sent twice within 1 hour
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  runHealthChecks,
  formatHealthAlert,
} from "@/lib/system/health-checker";
import { emitSystemEvent } from "@/lib/system/events";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

/** Don't re-alert on same issue within this window (ms) */
const ALERT_DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function handler(_req: NextRequest) {
  const report = await runHealthChecks();

  logger.info("[SystemReport] Health check complete:", {
    overall: report.overall,
    critical: report.criticalCount,
    warnings: report.warningCount,
    ok: report.okCount,
    durationMs: report.durationMs,
  });

  // Emit system event
  emitSystemEvent({
    eventType:
      report.overall === "ok" ? "health_check_passed" : "health_check_failed",
    component: "system_report",
    severity:
      report.overall === "critical"
        ? "error"
        : report.overall === "warning"
          ? "warn"
          : "info",
    message: `System health: ${report.overall} (${report.criticalCount} critical, ${report.warningCount} warnings)`,
    details: {
      overall: report.overall,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      okCount: report.okCount,
      durationMs: report.durationMs,
      checks: report.checks
        .filter((c) => c.severity !== "ok")
        .map((c) => ({
          name: c.name,
          severity: c.severity,
          message: c.message,
        })),
    },
  });

  // If critical → alert tenants
  let alertsSent = 0;
  if (report.criticalCount > 0) {
    alertsSent = await alertActiveTenants(report);
  }

  return NextResponse.json({
    overall: report.overall,
    criticalCount: report.criticalCount,
    warningCount: report.warningCount,
    okCount: report.okCount,
    totalChecks: report.checks.length,
    durationMs: report.durationMs,
    alertsSent,
    issues: report.checks
      .filter((c) => c.severity !== "ok")
      .map((c) => ({
        name: c.name,
        severity: c.severity,
        message: c.message,
      })),
  });
}

/**
 * Send proactive alert to active tenants when critical issues detected.
 * Deduplicates: won't send same alert type within 1 hour.
 */
async function alertActiveTenants(
  report: ReturnType<typeof runHealthChecks> extends Promise<infer R>
    ? R
    : never,
): Promise<number> {
  const supabase = getServiceSupabase();

  // Get active tenants (admin-level — we alert all tenants about system issues)
  const { data: tenants } = await supabase
    .from("exo_tenants")
    .select("id")
    .not("phone", "is", null)
    .limit(100);

  if (!tenants || tenants.length === 0) return 0;

  // Build dedup key from critical check names
  const criticalCheckNames = report.checks
    .filter((c) => c.severity === "critical")
    .map((c) => c.name)
    .sort()
    .join(",");

  const dedupKey = `system_report:${criticalCheckNames}`;

  // Check if we already alerted recently
  const dedupSince = new Date(Date.now() - ALERT_DEDUP_WINDOW_MS).toISOString();

  const { data: recentAlerts } = await supabase
    .from("exo_proactive_log")
    .select("id")
    .eq("trigger_type", dedupKey)
    .gte("created_at", dedupSince)
    .limit(1);

  if (recentAlerts && recentAlerts.length > 0) {
    logger.info("[SystemReport] Alert already sent recently, skipping dedup:", {
      dedupKey,
    });
    return 0;
  }

  // Format alert message
  const alertMessage = `🏥 Raport Zdrowia Systemu\n\n${formatHealthAlert(report)}`;

  let sent = 0;
  for (const tenant of tenants) {
    try {
      await sendProactiveMessage(
        tenant.id,
        alertMessage,
        dedupKey,
        "system-report",
      );
      sent++;
    } catch (err) {
      logger.error("[SystemReport] Failed to alert tenant:", {
        tenantId: tenant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return sent;
}

export const GET = withCronGuard({ name: "system-report" }, handler);
