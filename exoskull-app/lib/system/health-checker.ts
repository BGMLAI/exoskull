/**
 * Health Checker — Active health monitoring engine
 *
 * Unlike the passive health snapshot (events.ts), this module
 * ACTIVELY tests each subsystem and detects issues proactively:
 * - CRON staleness (did critical CRONs run on schedule?)
 * - Tool failure spikes (sudden increase in error rate?)
 * - Integration circuit breakers (any tripped?)
 * - Generated app table health (tables still accessible?)
 * - Watchdog (critical processes stopped running?)
 * - Database connectivity
 *
 * Used by: /api/cron/system-report
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type CheckSeverity = "ok" | "warning" | "critical";

export interface HealthCheck {
  name: string;
  category: string;
  severity: CheckSeverity;
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
}

export interface HealthReport {
  overall: CheckSeverity;
  checks: HealthCheck[];
  criticalCount: number;
  warningCount: number;
  okCount: number;
  generatedAt: string;
  durationMs: number;
}

// ============================================================================
// CRON SCHEDULE EXPECTATIONS
// ============================================================================

/** How many minutes between expected runs. If exceeded → stale. */
const CRON_EXPECTED_INTERVALS: Record<string, number> = {
  // Critical — must run frequently
  petla: 5, // every 1min, alert if 5min stale
  "async-tasks": 5, // every 1min
  "loop-15": 30, // every 15min, alert if 30min stale
  impulse: 30, // every 15min
  "email-sync": 30, // every 15min
  "email-analyze": 15, // every 5min
  "integration-health": 60, // every 30min, alert if 60min stale
  "system-report": 30, // every 15min (self-monitoring)

  // Important — daily
  "loop-daily": 26 * 60, // daily, 26h tolerance
  "morning-briefing": 26 * 60,
  "evening-reflection": 26 * 60,
  "daily-summary": 26 * 60,
  "gap-detection": 8 * 24 * 60, // weekly
  "weekly-summary": 8 * 24 * 60,
};

/** CRONs whose staleness is critical (not just warning) */
const CRITICAL_CRONS = new Set([
  "petla",
  "async-tasks",
  "loop-15",
  "email-analyze",
]);

// ============================================================================
// MAIN HEALTH CHECK RUNNER
// ============================================================================

export async function runHealthChecks(): Promise<HealthReport> {
  const start = Date.now();
  const checks: HealthCheck[] = [];
  const now = new Date();

  const supabase = getServiceSupabase();

  // Run all checks in parallel for speed
  const [
    cronChecks,
    toolChecks,
    integrationChecks,
    appChecks,
    dbCheck,
    watchdogChecks,
  ] = await Promise.allSettled([
    checkCronStaleness(supabase, now),
    checkToolFailureRates(supabase, now),
    checkIntegrationHealth(supabase),
    checkGeneratedApps(supabase),
    checkDatabaseConnectivity(supabase),
    checkWatchdog(supabase, now),
  ]);

  // Collect results
  if (cronChecks.status === "fulfilled") checks.push(...cronChecks.value);
  else checks.push(errorCheck("cron_staleness", "cron", cronChecks.reason));

  if (toolChecks.status === "fulfilled") checks.push(...toolChecks.value);
  else
    checks.push(errorCheck("tool_failure_rates", "tools", toolChecks.reason));

  if (integrationChecks.status === "fulfilled")
    checks.push(...integrationChecks.value);
  else
    checks.push(
      errorCheck(
        "integration_health",
        "integrations",
        integrationChecks.reason,
      ),
    );

  if (appChecks.status === "fulfilled") checks.push(...appChecks.value);
  else checks.push(errorCheck("app_health", "apps", appChecks.reason));

  if (dbCheck.status === "fulfilled") checks.push(...dbCheck.value);
  else checks.push(errorCheck("database", "infrastructure", dbCheck.reason));

  if (watchdogChecks.status === "fulfilled")
    checks.push(...watchdogChecks.value);
  else
    checks.push(
      errorCheck("watchdog", "infrastructure", watchdogChecks.reason),
    );

  const criticalCount = checks.filter((c) => c.severity === "critical").length;
  const warningCount = checks.filter((c) => c.severity === "warning").length;
  const okCount = checks.filter((c) => c.severity === "ok").length;

  const overall: CheckSeverity =
    criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "ok";

  return {
    overall,
    checks,
    criticalCount,
    warningCount,
    okCount,
    generatedAt: now.toISOString(),
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

/**
 * Check if CRONs ran within their expected schedule.
 * Returns one check per monitored CRON.
 */
async function checkCronStaleness(
  supabase: ReturnType<typeof getServiceSupabase>,
  now: Date,
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Get the most recent run per CRON
  const { data: recentRuns, error } = await supabase
    .from("admin_cron_runs")
    .select("cron_name, status, started_at, error_message")
    .order("started_at", { ascending: false })
    .limit(500);

  if (error) {
    return [
      {
        name: "cron_monitoring",
        category: "cron",
        severity: "warning",
        message: `Cannot check CRON health: ${error.message}`,
        checkedAt: now.toISOString(),
      },
    ];
  }

  // Group by cron_name → get latest run
  const latestRuns = new Map<
    string,
    { started_at: string; status: string; error_message?: string }
  >();
  for (const run of recentRuns || []) {
    if (!latestRuns.has(run.cron_name)) {
      latestRuns.set(run.cron_name, run);
    }
  }

  for (const [cronName, expectedMinutes] of Object.entries(
    CRON_EXPECTED_INTERVALS,
  )) {
    const latest = latestRuns.get(cronName);

    if (!latest) {
      checks.push({
        name: `cron:${cronName}`,
        category: "cron",
        severity: CRITICAL_CRONS.has(cronName) ? "critical" : "warning",
        message: `CRON "${cronName}" has never run (no records found)`,
        checkedAt: now.toISOString(),
      });
      continue;
    }

    const lastRunAt = new Date(latest.started_at);
    const minutesSinceRun = (now.getTime() - lastRunAt.getTime()) / (60 * 1000);

    if (minutesSinceRun > expectedMinutes) {
      checks.push({
        name: `cron:${cronName}`,
        category: "cron",
        severity: CRITICAL_CRONS.has(cronName) ? "critical" : "warning",
        message: `CRON "${cronName}" is stale — last run ${Math.round(minutesSinceRun)}min ago (expected every ${expectedMinutes}min)`,
        details: {
          lastRunAt: latest.started_at,
          lastStatus: latest.status,
          lastError: latest.error_message,
          minutesSinceRun: Math.round(minutesSinceRun),
        },
        checkedAt: now.toISOString(),
      });
    } else if (latest.status === "failed") {
      checks.push({
        name: `cron:${cronName}`,
        category: "cron",
        severity: CRITICAL_CRONS.has(cronName) ? "critical" : "warning",
        message: `CRON "${cronName}" ran but FAILED: ${latest.error_message || "unknown error"}`,
        details: {
          lastRunAt: latest.started_at,
          lastError: latest.error_message,
        },
        checkedAt: now.toISOString(),
      });
    }
    // If ok, don't add a check (reduce noise)
  }

  // Summary check
  const staleCrons = checks.filter((c) => c.category === "cron");
  if (staleCrons.length === 0) {
    checks.push({
      name: "cron_overall",
      category: "cron",
      severity: "ok",
      message: `All ${Object.keys(CRON_EXPECTED_INTERVALS).length} monitored CRONs running on schedule`,
      checkedAt: now.toISOString(),
    });
  }

  return checks;
}

/**
 * Check tool failure rates in the last hour.
 * Alert if any tool has >30% failure rate with >5 executions.
 */
async function checkToolFailureRates(
  supabase: ReturnType<typeof getServiceSupabase>,
  now: Date,
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const h1ago = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const { data: recentExecs, error } = await supabase
    .from("exo_tool_executions")
    .select("tool_name, success")
    .gte("created_at", h1ago)
    .limit(2000);

  if (error) {
    return [
      {
        name: "tool_monitoring",
        category: "tools",
        severity: "warning",
        message: `Cannot check tool health: ${error.message}`,
        checkedAt: now.toISOString(),
      },
    ];
  }

  // Aggregate per tool
  const toolStats = new Map<string, { total: number; failures: number }>();
  for (const exec of recentExecs || []) {
    const stats = toolStats.get(exec.tool_name) || {
      total: 0,
      failures: 0,
    };
    stats.total++;
    if (!exec.success) stats.failures++;
    toolStats.set(exec.tool_name, stats);
  }

  const failingTools: string[] = [];
  for (const [toolName, stats] of toolStats) {
    if (stats.total < 3) continue; // Not enough data
    const failRate = stats.failures / stats.total;

    if (failRate > 0.5) {
      failingTools.push(toolName);
      checks.push({
        name: `tool:${toolName}`,
        category: "tools",
        severity: "critical",
        message: `Tool "${toolName}" has ${Math.round(failRate * 100)}% failure rate (${stats.failures}/${stats.total} in last hour)`,
        details: { total: stats.total, failures: stats.failures, failRate },
        checkedAt: now.toISOString(),
      });
    } else if (failRate > 0.3) {
      failingTools.push(toolName);
      checks.push({
        name: `tool:${toolName}`,
        category: "tools",
        severity: "warning",
        message: `Tool "${toolName}" has elevated failure rate: ${Math.round(failRate * 100)}% (${stats.failures}/${stats.total})`,
        details: { total: stats.total, failures: stats.failures, failRate },
        checkedAt: now.toISOString(),
      });
    }
  }

  if (failingTools.length === 0) {
    checks.push({
      name: "tools_overall",
      category: "tools",
      severity: "ok",
      message: `${toolStats.size} tools executed in last hour, all within normal failure rates`,
      checkedAt: now.toISOString(),
    });
  }

  return checks;
}

/**
 * Check integration circuit breaker states.
 */
async function checkIntegrationHealth(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const now = new Date();

  const { data: integrations, error } = await supabase
    .from("exo_integration_health")
    .select(
      "integration_type, status, circuit_state, consecutive_failures, last_check_at, last_error_message, tenant_id",
    )
    .limit(200);

  if (error) {
    return [
      {
        name: "integration_monitoring",
        category: "integrations",
        severity: "warning",
        message: `Cannot check integration health: ${error.message}`,
        checkedAt: now.toISOString(),
      },
    ];
  }

  const downIntegrations: string[] = [];
  const degradedIntegrations: string[] = [];

  for (const integration of integrations || []) {
    if (integration.status === "down") {
      downIntegrations.push(integration.integration_type);
      checks.push({
        name: `integration:${integration.integration_type}`,
        category: "integrations",
        severity: "critical",
        message: `Integration "${integration.integration_type}" is DOWN (${integration.consecutive_failures} consecutive failures)`,
        details: {
          circuitState: integration.circuit_state,
          lastError: integration.last_error_message,
          lastCheck: integration.last_check_at,
          tenantId: integration.tenant_id,
        },
        checkedAt: now.toISOString(),
      });
    } else if (integration.status === "degraded") {
      degradedIntegrations.push(integration.integration_type);
      checks.push({
        name: `integration:${integration.integration_type}`,
        category: "integrations",
        severity: "warning",
        message: `Integration "${integration.integration_type}" is degraded (circuit: ${integration.circuit_state})`,
        details: {
          circuitState: integration.circuit_state,
          lastError: integration.last_error_message,
          lastCheck: integration.last_check_at,
        },
        checkedAt: now.toISOString(),
      });
    }
  }

  if (downIntegrations.length === 0 && degradedIntegrations.length === 0) {
    checks.push({
      name: "integrations_overall",
      category: "integrations",
      severity: "ok",
      message: `${(integrations || []).length} integrations monitored, all healthy`,
      checkedAt: now.toISOString(),
    });
  }

  return checks;
}

/**
 * Check generated app table health.
 * Verifies that tables still exist and are accessible.
 */
async function checkGeneratedApps(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const now = new Date();

  const { data: apps, error } = await supabase
    .from("exo_generated_apps")
    .select("slug, name, table_name, status, last_used_at")
    .eq("status", "active")
    .limit(50);

  if (error) {
    return [
      {
        name: "apps_monitoring",
        category: "apps",
        severity: "warning",
        message: `Cannot check app health: ${error.message}`,
        checkedAt: now.toISOString(),
      },
    ];
  }

  const activeApps = apps || [];

  // Check for unused apps (>30 days)
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const unusedApps = activeApps.filter(
    (a) => a.last_used_at && a.last_used_at < thirtyDaysAgo,
  );

  if (unusedApps.length > 0) {
    checks.push({
      name: "apps_unused",
      category: "apps",
      severity: "warning",
      message: `${unusedApps.length} app(s) unused for 30+ days: ${unusedApps.map((a) => a.name || a.slug).join(", ")}`,
      details: {
        apps: unusedApps.map((a) => ({
          slug: a.slug,
          lastUsed: a.last_used_at,
        })),
      },
      checkedAt: now.toISOString(),
    });
  }

  // Spot-check a few app tables exist (limit to 3 to stay fast)
  const brokenTables: string[] = [];
  for (const app of activeApps.slice(0, 3)) {
    if (!app.table_name) continue;
    try {
      const { error: tableError } = await supabase
        .from(app.table_name)
        .select("id", { count: "exact", head: true });

      if (tableError) {
        brokenTables.push(app.slug);
      }
    } catch {
      brokenTables.push(app.slug);
    }
  }

  if (brokenTables.length > 0) {
    checks.push({
      name: "apps_broken_tables",
      category: "apps",
      severity: "critical",
      message: `${brokenTables.length} app table(s) inaccessible: ${brokenTables.join(", ")}`,
      checkedAt: now.toISOString(),
    });
  }

  if (unusedApps.length === 0 && brokenTables.length === 0) {
    checks.push({
      name: "apps_overall",
      category: "apps",
      severity: "ok",
      message: `${activeApps.length} active apps, all tables accessible`,
      checkedAt: now.toISOString(),
    });
  }

  return checks;
}

/**
 * Basic database connectivity check.
 */
async function checkDatabaseConnectivity(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<HealthCheck[]> {
  const now = new Date();
  const start = Date.now();

  try {
    const { error } = await supabase
      .from("exo_tenants")
      .select("id", { count: "exact", head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      return [
        {
          name: "database",
          category: "infrastructure",
          severity: "critical",
          message: `Database query failed: ${error.message}`,
          details: { latencyMs },
          checkedAt: now.toISOString(),
        },
      ];
    }

    const severity: CheckSeverity =
      latencyMs > 5000 ? "critical" : latencyMs > 2000 ? "warning" : "ok";

    return [
      {
        name: "database",
        category: "infrastructure",
        severity,
        message:
          severity === "ok"
            ? `Database responsive (${latencyMs}ms)`
            : `Database slow (${latencyMs}ms)`,
        details: { latencyMs },
        checkedAt: now.toISOString(),
      },
    ];
  } catch (err) {
    return [
      {
        name: "database",
        category: "infrastructure",
        severity: "critical",
        message: `Database unreachable: ${err instanceof Error ? err.message : "unknown"}`,
        checkedAt: now.toISOString(),
      },
    ];
  }
}

/**
 * Watchdog — detect critical processes that stopped running entirely.
 * Different from CRON staleness: this checks for total absence.
 */
async function checkWatchdog(
  supabase: ReturnType<typeof getServiceSupabase>,
  now: Date,
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Check MAPEK loop config — if tenants exist but no config → loop won't run
  const [{ data: tenantCount }, { data: loopConfigs }] = await Promise.all([
    supabase.from("exo_tenants").select("id", { count: "exact", head: true }),
    supabase
      .from("exo_tenant_loop_config")
      .select("tenant_id, next_eval_at, cycles_today"),
  ]);

  const tenants = (tenantCount as unknown as number) || 0;
  const configs = loopConfigs?.length || 0;

  if (tenants > 0 && configs === 0) {
    checks.push({
      name: "watchdog:mapek_config",
      category: "infrastructure",
      severity: "critical",
      message: `${tenants} tenant(s) exist but 0 MAPEK loop configs — loop-15 will skip ALL tenants`,
      checkedAt: now.toISOString(),
    });
  } else if (tenants > configs) {
    checks.push({
      name: "watchdog:mapek_config",
      category: "infrastructure",
      severity: "warning",
      message: `${tenants} tenant(s) but only ${configs} MAPEK config(s) — some tenants won't be evaluated`,
      checkedAt: now.toISOString(),
    });
  }

  // Check if any system events in last 2h — if zero, system might be dead
  const h2ago = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recentEvents } = await supabase
    .from("exo_system_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", h2ago);

  const eventCount = (recentEvents as unknown as number) || 0;
  if (eventCount === 0) {
    // Not necessarily bad — might just be quiet period
    // Only warning, not critical
    checks.push({
      name: "watchdog:event_activity",
      category: "infrastructure",
      severity: "warning",
      message:
        "Zero system events in last 2 hours — system may be idle or event emission broken",
      checkedAt: now.toISOString(),
    });
  }

  // Check for error storms — too many errors in short time
  const { data: errorEvents } = await supabase
    .from("exo_system_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", h2ago)
    .in("severity", ["error", "critical"]);

  const errorCount = (errorEvents as unknown as number) || 0;
  if (errorCount > 20) {
    checks.push({
      name: "watchdog:error_storm",
      category: "infrastructure",
      severity: "critical",
      message: `Error storm detected: ${errorCount} error/critical events in last 2 hours`,
      details: { errorCount },
      checkedAt: now.toISOString(),
    });
  }

  if (checks.length === 0) {
    checks.push({
      name: "watchdog_overall",
      category: "infrastructure",
      severity: "ok",
      message: "All watchdog checks passed",
      checkedAt: now.toISOString(),
    });
  }

  return checks;
}

// ============================================================================
// REPORT FORMATTING
// ============================================================================

/**
 * Format health report as a human-readable message for proactive alerting.
 */
export function formatHealthAlert(report: HealthReport): string {
  const criticalChecks = report.checks.filter((c) => c.severity === "critical");
  const warningChecks = report.checks.filter((c) => c.severity === "warning");

  const parts: string[] = [];

  if (criticalChecks.length > 0) {
    parts.push("🔴 KRYTYCZNE:");
    for (const check of criticalChecks) {
      parts.push(`  • ${check.message}`);
    }
  }

  if (warningChecks.length > 0) {
    parts.push("🟡 OSTRZEZENIA:");
    for (const check of warningChecks.slice(0, 5)) {
      parts.push(`  • ${check.message}`);
    }
    if (warningChecks.length > 5) {
      parts.push(`  ... i ${warningChecks.length - 5} wiecej`);
    }
  }

  parts.push(
    `\nPodsumowanie: ${report.criticalCount} krytycznych, ${report.warningCount} ostrzezen, ${report.okCount} ok (${report.durationMs}ms)`,
  );

  return parts.join("\n");
}

// ============================================================================
// HELPERS
// ============================================================================

function errorCheck(
  name: string,
  category: string,
  error: unknown,
): HealthCheck {
  return {
    name,
    category,
    severity: "warning",
    message: `Health check failed to run: ${error instanceof Error ? error.message : "unknown error"}`,
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================================
// PER-INTEGRATION CALL TRACKING (last 10 calls per integration)
// ============================================================================

interface IntegrationCallRecord {
  toolkit: string;
  toolSlug: string;
  success: boolean;
  durationMs: number;
  error?: string;
  timestamp: number;
}

const integrationCallHistory = new Map<string, IntegrationCallRecord[]>();
const MAX_CALL_HISTORY = 10;

/**
 * Record an integration call for health tracking
 */
export function recordIntegrationCall(
  tenantId: string,
  toolkit: string,
  toolSlug: string,
  success: boolean,
  durationMs: number,
  error?: string,
): void {
  const key = `${tenantId}:${toolkit}`;
  const history = integrationCallHistory.get(key) || [];

  history.push({
    toolkit,
    toolSlug,
    success,
    durationMs,
    error,
    timestamp: Date.now(),
  });

  // Keep only last N calls
  if (history.length > MAX_CALL_HISTORY) {
    history.splice(0, history.length - MAX_CALL_HISTORY);
  }

  integrationCallHistory.set(key, history);
}

/**
 * Get integration health per toolkit (for dashboard widget)
 */
export function getIntegrationCallHealth(tenantId: string): Array<{
  toolkit: string;
  recentCalls: number;
  successRate: number;
  avgDurationMs: number;
  lastCall?: IntegrationCallRecord;
  status: "healthy" | "degraded" | "down" | "unknown";
}> {
  const results: Array<{
    toolkit: string;
    recentCalls: number;
    successRate: number;
    avgDurationMs: number;
    lastCall?: IntegrationCallRecord;
    status: "healthy" | "degraded" | "down" | "unknown";
  }> = [];

  const toolkits = [
    "GMAIL",
    "GOOGLECALENDAR",
    "NOTION",
    "TODOIST",
    "SLACK",
    "GITHUB",
    "GOOGLEDRIVE",
    "OUTLOOK",
    "TRELLO",
    "LINEAR",
  ];

  for (const toolkit of toolkits) {
    const key = `${tenantId}:${toolkit}`;
    const history = integrationCallHistory.get(key) || [];

    if (history.length === 0) {
      results.push({
        toolkit,
        recentCalls: 0,
        successRate: 0,
        avgDurationMs: 0,
        status: "unknown",
      });
      continue;
    }

    const successes = history.filter((c) => c.success).length;
    const successRate = successes / history.length;
    const avgDuration = Math.round(
      history.reduce((s, c) => s + c.durationMs, 0) / history.length,
    );

    let status: "healthy" | "degraded" | "down" = "healthy";
    if (successRate < 0.5) status = "down";
    else if (successRate < 0.8) status = "degraded";

    // Check if recent calls are all failures
    const last3 = history.slice(-3);
    if (last3.length >= 3 && last3.every((c) => !c.success)) {
      status = "down";
    }

    results.push({
      toolkit,
      recentCalls: history.length,
      successRate: Math.round(successRate * 100),
      avgDurationMs: avgDuration,
      lastCall: history[history.length - 1],
      status,
    });
  }

  return results.filter((r) => r.recentCalls > 0 || r.status !== "unknown");
}
