/**
 * System Events — Inter-component messaging and health snapshot
 *
 * Fire-and-forget event emitter for system self-awareness.
 * Events with severity >= warn auto-bridge to Petla event bus.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type SystemEventType =
  | "component_started"
  | "component_stopped"
  | "component_error"
  | "health_check_passed"
  | "health_check_failed"
  | "circuit_breaker_opened"
  | "circuit_breaker_closed"
  | "integration_degraded"
  | "integration_recovered"
  | "build_completed"
  | "build_failed"
  | "maintenance_completed"
  | "maintenance_failed"
  | "config_changed"
  | "threshold_exceeded"
  | "ralph_cycle_completed"
  | "cron_completed"
  | "cron_failed";

export type Severity = "debug" | "info" | "warn" | "error" | "critical";

export interface SystemEvent {
  id: string;
  tenant_id: string | null;
  event_type: SystemEventType;
  component: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  correlation_id: string | null;
  created_at: string;
}

export interface SubsystemHealth {
  status: "healthy" | "degraded" | "down";
  details: Record<string, unknown>;
}

export interface SystemHealthSnapshot {
  overall_status: "healthy" | "degraded" | "critical";
  subsystems: {
    crons: SubsystemHealth;
    integrations: SubsystemHealth;
    tools: SubsystemHealth;
    apps: SubsystemHealth;
    ralph: SubsystemHealth;
    mapek: SubsystemHealth;
  };
  recent_events: SystemEvent[];
  alerts: string[];
  timestamp: string;
}

// ============================================================================
// EMIT EVENT (fire-and-forget)
// ============================================================================

export function emitSystemEvent(params: {
  tenantId?: string;
  eventType: SystemEventType;
  component: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
}): void {
  // Fire-and-forget — never block caller
  Promise.resolve().then(async () => {
    try {
      const supabase = getServiceSupabase();

      await supabase.from("exo_system_events").insert({
        tenant_id: params.tenantId || null,
        event_type: params.eventType,
        component: params.component,
        severity: params.severity,
        message: params.message,
        details: params.details || {},
        correlation_id: params.correlationId || null,
      });

      // Bridge to Petla event bus for warn/error/critical
      if (
        params.tenantId &&
        (params.severity === "warn" ||
          params.severity === "error" ||
          params.severity === "critical")
      ) {
        const priority =
          params.severity === "critical"
            ? 0
            : params.severity === "error"
              ? 2
              : 4;
        const eventType =
          params.severity === "critical" ? "crisis" : "optimization_signal";

        await supabase.rpc("emit_petla_event", {
          p_tenant_id: params.tenantId,
          p_event_type: eventType,
          p_priority: priority,
          p_source: `system_event:${params.component}`,
          p_payload: {
            system_event_type: params.eventType,
            message: params.message,
            details: params.details,
          },
          p_dedup_key: `sys:${params.component}:${params.eventType}`,
          p_expires_minutes: 120,
        });
      }
    } catch (error) {
      // Never throw from fire-and-forget
      logger.error("[SystemEvents] Failed to emit:", {
        component: params.component,
        error: error instanceof Error ? error.message : error,
      });
    }
  });
}

// ============================================================================
// QUERY EVENTS
// ============================================================================

export async function getRecentSystemEvents(params: {
  tenantId?: string;
  component?: string;
  severity?: Severity;
  limit?: number;
  since?: Date;
}): Promise<SystemEvent[]> {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("exo_system_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit || 50);

  if (params.tenantId) query = query.eq("tenant_id", params.tenantId);
  if (params.component) query = query.eq("component", params.component);
  if (params.severity) query = query.eq("severity", params.severity);
  if (params.since) query = query.gte("created_at", params.since.toISOString());

  const { data, error } = await query;
  if (error) {
    logger.error("[SystemEvents] Query failed:", { error: error.message });
    return [];
  }
  return (data as SystemEvent[]) || [];
}

// ============================================================================
// HEALTH SNAPSHOT
// ============================================================================

export async function getSystemHealthSnapshot(
  tenantId?: string,
): Promise<SystemHealthSnapshot> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const h2ago = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const [
    cronRuns,
    integrationHealth,
    toolFailures,
    toolTotal,
    appStatus,
    systemEvents,
    ralphJournal,
    loopConfigs,
  ] = await Promise.all([
    // 1. CRON health — last 24h runs
    supabase
      .from("admin_cron_runs")
      .select("cron_name, status, started_at, error_message")
      .gte("started_at", h24ago)
      .order("started_at", { ascending: false })
      .limit(200),

    // 2. Integration health
    tenantId
      ? supabase
          .from("exo_integration_health")
          .select("*")
          .eq("tenant_id", tenantId)
      : supabase
          .from("exo_integration_health")
          .select("*")
          .eq("status", "down"),

    // 3. Tool failures last 24h
    supabase
      .from("exo_tool_executions")
      .select("tool_name, error_message")
      .eq("success", false)
      .gte("created_at", h24ago)
      .limit(100),

    // 4. Total tool executions last 24h
    supabase
      .from("exo_tool_executions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", h24ago),

    // 5. App status
    tenantId
      ? supabase
          .from("exo_generated_apps")
          .select("slug, name, status")
          .eq("tenant_id", tenantId)
      : supabase
          .from("exo_generated_apps")
          .select("slug, name, status")
          .eq("status", "active"),

    // 6. Recent system events
    supabase
      .from("exo_system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),

    // 7. Ralph journal last 24h
    supabase
      .from("exo_dev_journal")
      .select("entry_type, outcome, title, created_at")
      .gte("created_at", h24ago)
      .order("created_at", { ascending: false })
      .limit(20),

    // 8. MAPEK loop configs
    supabase
      .from("exo_tenant_loop_config")
      .select("tenant_id, next_eval_at, cycles_today")
      .limit(50),
  ]);

  const alerts: string[] = [];

  // -- CRON subsystem --
  const cronData = cronRuns.data || [];
  const recentFailedCrons = cronData.filter(
    (c) => c.status === "failed" && c.started_at >= h2ago,
  );
  const cronStatus: SubsystemHealth = {
    status:
      recentFailedCrons.length > 2
        ? "down"
        : recentFailedCrons.length > 0
          ? "degraded"
          : "healthy",
    details: {
      total24h: cronData.length,
      failed24h: cronData.filter((c) => c.status === "failed").length,
      recentFailures: recentFailedCrons.map((c) => c.cron_name),
    },
  };
  if (recentFailedCrons.length > 0) {
    alerts.push(
      `${recentFailedCrons.length} CRONs failed in last 2h: ${recentFailedCrons.map((c) => c.cron_name).join(", ")}`,
    );
  }

  // -- Integration subsystem --
  const intData = integrationHealth.data || [];
  const downIntegrations = intData.filter(
    (i) => (i as Record<string, unknown>).status === "down",
  );
  const degradedIntegrations = intData.filter(
    (i) => (i as Record<string, unknown>).status === "degraded",
  );
  const integrationStatus: SubsystemHealth = {
    status:
      downIntegrations.length > 0
        ? "down"
        : degradedIntegrations.length > 0
          ? "degraded"
          : "healthy",
    details: {
      total: intData.length,
      healthy: intData.filter(
        (i) => (i as Record<string, unknown>).status === "healthy",
      ).length,
      degraded: degradedIntegrations.length,
      down: downIntegrations.length,
    },
  };
  if (downIntegrations.length > 0) {
    alerts.push(`${downIntegrations.length} integrations DOWN`);
  }

  // -- Tools subsystem --
  const failureCount = toolFailures.data?.length || 0;
  const totalCount = toolTotal.count || 1;
  const failureRate = failureCount / Math.max(totalCount, 1);
  const toolStatus: SubsystemHealth = {
    status:
      failureRate > 0.3 ? "down" : failureRate > 0.1 ? "degraded" : "healthy",
    details: {
      total24h: totalCount,
      failures24h: failureCount,
      failureRate: Math.round(failureRate * 100),
    },
  };
  if (failureRate > 0.1) {
    alerts.push(`Tool failure rate: ${Math.round(failureRate * 100)}%`);
  }

  // -- Apps subsystem --
  const appsData = appStatus.data || [];
  const appStatusHealth: SubsystemHealth = {
    status: "healthy",
    details: {
      total: appsData.length,
      active: appsData.filter((a) => a.status === "active").length,
    },
  };

  // -- Ralph subsystem --
  const ralphData = ralphJournal.data || [];
  const ralphFailed = ralphData.filter((r) => r.outcome === "failed");
  const ralphStatus: SubsystemHealth = {
    status: ralphFailed.length > 3 ? "degraded" : "healthy",
    details: {
      cycles24h: ralphData.length,
      successes: ralphData.filter((r) => r.outcome === "success").length,
      failures: ralphFailed.length,
    },
  };

  // -- MAPEK subsystem --
  const mapekData = loopConfigs.data || [];
  const mapekStatus: SubsystemHealth = {
    status: mapekData.length === 0 ? "degraded" : "healthy",
    details: {
      configuredTenants: mapekData.length,
      totalCyclesToday: mapekData.reduce(
        (sum, c) => sum + ((c.cycles_today as number) || 0),
        0,
      ),
    },
  };

  // -- Overall status --
  const subsystems = {
    crons: cronStatus,
    integrations: integrationStatus,
    tools: toolStatus,
    apps: appStatusHealth,
    ralph: ralphStatus,
    mapek: mapekStatus,
  };

  const hasDown = Object.values(subsystems).some((s) => s.status === "down");
  const hasDegraded = Object.values(subsystems).some(
    (s) => s.status === "degraded",
  );

  return {
    overall_status: hasDown ? "critical" : hasDegraded ? "degraded" : "healthy",
    subsystems,
    recent_events: ((systemEvents.data as SystemEvent[]) || []).slice(0, 20),
    alerts,
    timestamp: now.toISOString(),
  };
}
