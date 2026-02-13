/**
 * Inter-System Bus — Communication backbone for all ExoSkull components
 *
 * Event-driven messaging bus that connects:
 * - Ralph Loop (autonomous dev cycles)
 * - Agent Swarm (multi-agent coordination)
 * - GOTCHA Engine (framework execution)
 * - ATLAS Pipeline (app building)
 * - Health Checker (monitoring)
 * - System Manifest (self-awareness)
 * - Self-Builder (self-modification)
 * - Canvas/Dashboard (UI)
 *
 * Features:
 * - In-process pub/sub (no external dependencies)
 * - Typed events with discriminated union
 * - Wildcard subscriptions (e.g. "ralph.*")
 * - Auto-bridge to persistent system events (DB)
 * - Circular dependency detection
 * - Max listeners safety
 */

import { emitSystemEvent, type Severity } from "@/lib/system/events";
import { logger } from "@/lib/logger";

// ============================================================================
// EVENT TYPES
// ============================================================================

export type BusEventType =
  // Ralph Loop lifecycle
  | "ralph.cycle.started"
  | "ralph.cycle.completed"
  | "ralph.cycle.failed"
  | "ralph.action.started"
  | "ralph.action.completed"
  // Agent Swarm
  | "swarm.session.created"
  | "swarm.session.completed"
  | "swarm.agent.started"
  | "swarm.agent.completed"
  | "swarm.agent.stuck"
  // GOTCHA Engine
  | "gotcha.context.loaded"
  | "gotcha.cycle.executed"
  // ATLAS Pipeline
  | "atlas.pipeline.started"
  | "atlas.stage.completed"
  | "atlas.pipeline.completed"
  | "atlas.pipeline.failed"
  // Health & Monitoring
  | "health.check.completed"
  | "health.alert.triggered"
  | "health.subsystem.degraded"
  | "health.subsystem.recovered"
  // Self-Builder
  | "self.widget.added"
  | "self.widget.removed"
  | "self.layout.changed"
  | "self.config.updated"
  // Integration
  | "integration.connected"
  | "integration.disconnected"
  | "integration.error"
  // Generic
  | "system.startup"
  | "system.shutdown"
  | "system.error";

export interface BusEvent<T = Record<string, unknown>> {
  type: BusEventType;
  source: string;
  tenantId?: string;
  timestamp: number;
  correlationId?: string;
  data: T;
}

export type BusHandler<T = Record<string, unknown>> = (
  event: BusEvent<T>,
) => void | Promise<void>;

interface Subscription {
  id: string;
  pattern: string;
  handler: BusHandler;
  source: string;
  createdAt: number;
}

// ============================================================================
// BUS IMPLEMENTATION
// ============================================================================

const MAX_LISTENERS_PER_PATTERN = 50;
const MAX_EMIT_DEPTH = 10; // Circular dependency guard

class SystemBus {
  private subscriptions = new Map<string, Subscription[]>();
  private wildcardSubscriptions: Subscription[] = [];
  private emitDepth = 0;
  private emitHistory: string[] = [];
  private eventCount = 0;
  private lastEmittedAt = 0;

  /**
   * Subscribe to events matching a pattern.
   * Supports exact match ("ralph.cycle.completed") or
   * wildcard ("ralph.*", "*.completed").
   */
  subscribe(
    pattern: string,
    handler: BusHandler,
    source: string = "unknown",
  ): () => void {
    const sub: Subscription = {
      id: `sub_${++this.eventCount}_${Date.now()}`,
      pattern,
      handler,
      source,
      createdAt: Date.now(),
    };

    if (pattern.includes("*")) {
      // Check max listeners
      if (this.wildcardSubscriptions.length >= MAX_LISTENERS_PER_PATTERN) {
        logger.warn("[SystemBus] Too many wildcard listeners, skipping", {
          pattern,
          source,
          count: this.wildcardSubscriptions.length,
        });
        return () => {};
      }
      this.wildcardSubscriptions.push(sub);
    } else {
      const existing = this.subscriptions.get(pattern) || [];
      if (existing.length >= MAX_LISTENERS_PER_PATTERN) {
        logger.warn("[SystemBus] Too many listeners for pattern", {
          pattern,
          source,
          count: existing.length,
        });
        return () => {};
      }
      existing.push(sub);
      this.subscriptions.set(pattern, existing);
    }

    // Return unsubscribe function
    return () => {
      if (pattern.includes("*")) {
        this.wildcardSubscriptions = this.wildcardSubscriptions.filter(
          (s) => s.id !== sub.id,
        );
      } else {
        const subs = this.subscriptions.get(pattern);
        if (subs) {
          this.subscriptions.set(
            pattern,
            subs.filter((s) => s.id !== sub.id),
          );
        }
      }
    };
  }

  /**
   * Emit an event on the bus. Fire-and-forget.
   * Handlers that throw are caught and logged.
   */
  emit<T = Record<string, unknown>>(event: BusEvent<T>): void {
    // Circular dependency guard
    if (this.emitDepth >= MAX_EMIT_DEPTH) {
      logger.error("[SystemBus] Circular emit detected!", {
        type: event.type,
        depth: this.emitDepth,
        history: this.emitHistory.slice(-5),
      });
      return;
    }

    this.emitDepth++;
    this.emitHistory.push(event.type);
    if (this.emitHistory.length > 20) this.emitHistory.shift();
    this.eventCount++;
    this.lastEmittedAt = Date.now();

    try {
      // Exact match handlers
      const exactHandlers = this.subscriptions.get(event.type) || [];

      // Wildcard handlers
      const matchedWildcards = this.wildcardSubscriptions.filter((sub) =>
        matchPattern(sub.pattern, event.type),
      );

      const allHandlers = [...exactHandlers, ...matchedWildcards];

      for (const sub of allHandlers) {
        try {
          const result = sub.handler(event as BusEvent);
          // If handler returns a promise, don't await — fire and forget
          if (result instanceof Promise) {
            result.catch((err) => {
              logger.error("[SystemBus] Async handler error", {
                type: event.type,
                handler: sub.source,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          logger.error("[SystemBus] Sync handler error", {
            type: event.type,
            handler: sub.source,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Auto-bridge important events to persistent system events
      this.bridgeToPersistent(event as BusEvent);
    } finally {
      this.emitDepth--;
    }
  }

  /**
   * Get bus statistics for monitoring.
   */
  getStats(): {
    subscriptionCount: number;
    wildcardCount: number;
    totalEvents: number;
    lastEmittedAt: number;
    patternCounts: Record<string, number>;
  } {
    const patternCounts: Record<string, number> = {};
    for (const [pattern, subs] of this.subscriptions) {
      patternCounts[pattern] = subs.length;
    }
    patternCounts["*"] = this.wildcardSubscriptions.length;

    return {
      subscriptionCount: Array.from(this.subscriptions.values()).reduce(
        (sum, subs) => sum + subs.length,
        0,
      ),
      wildcardCount: this.wildcardSubscriptions.length,
      totalEvents: this.eventCount,
      lastEmittedAt: this.lastEmittedAt,
      patternCounts,
    };
  }

  /**
   * Clear all subscriptions (used in tests).
   */
  reset(): void {
    this.subscriptions.clear();
    this.wildcardSubscriptions = [];
    this.emitDepth = 0;
    this.emitHistory = [];
    this.eventCount = 0;
  }

  /**
   * Bridge select bus events to persistent exo_system_events table.
   * Only bridges events that are significant enough for the DB.
   */
  private bridgeToPersistent(event: BusEvent): void {
    const bridgeMap: Partial<
      Record<BusEventType, { severity: Severity; component: string }>
    > = {
      "ralph.cycle.completed": {
        severity: "info",
        component: "ralph_loop",
      },
      "ralph.cycle.failed": {
        severity: "warn",
        component: "ralph_loop",
      },
      "swarm.session.completed": {
        severity: "info",
        component: "agent_swarm",
      },
      "swarm.agent.stuck": {
        severity: "warn",
        component: "agent_swarm",
      },
      "atlas.pipeline.completed": {
        severity: "info",
        component: "atlas_pipeline",
      },
      "atlas.pipeline.failed": {
        severity: "warn",
        component: "atlas_pipeline",
      },
      "health.alert.triggered": {
        severity: "warn",
        component: "health_checker",
      },
      "health.subsystem.degraded": {
        severity: "warn",
        component: "health_checker",
      },
      "self.widget.added": {
        severity: "info",
        component: "self_builder",
      },
      "integration.error": {
        severity: "warn",
        component: "integration_hub",
      },
      "system.error": {
        severity: "error",
        component: "system",
      },
    };

    const config = bridgeMap[event.type];
    if (!config) return;

    emitSystemEvent({
      tenantId: event.tenantId,
      eventType: mapBusEventToSystemEvent(event.type),
      component: config.component,
      severity: config.severity,
      message: `[Bus] ${event.type}: ${summarizeEventData(event.data)}`,
      details: event.data as Record<string, unknown>,
      correlationId: event.correlationId,
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function matchPattern(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;

  const patternParts = pattern.split(".");
  const typeParts = eventType.split(".");

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === "*") continue;
    if (patternParts[i] !== typeParts[i]) return false;
  }

  return patternParts.length <= typeParts.length;
}

function mapBusEventToSystemEvent(
  busType: BusEventType,
):
  | "ralph_cycle_completed"
  | "build_completed"
  | "build_failed"
  | "config_changed"
  | "health_check_failed"
  | "integration_degraded"
  | "component_error" {
  if (busType.startsWith("ralph.")) return "ralph_cycle_completed";
  if (busType.includes("completed")) return "build_completed";
  if (busType.includes("failed")) return "build_failed";
  if (busType.includes("config")) return "config_changed";
  if (busType.includes("health") || busType.includes("degraded"))
    return "health_check_failed";
  if (busType.includes("integration")) return "integration_degraded";
  return "component_error";
}

function summarizeEventData(data: unknown): string {
  if (!data || typeof data !== "object") return String(data || "");
  const d = data as Record<string, unknown>;
  if (d.message) return String(d.message);
  if (d.description) return String(d.description);
  if (d.progress) return String(d.progress);
  if (d.status) return `status=${d.status}`;
  return JSON.stringify(data).slice(0, 200);
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/** Global system bus instance. Import and use from any component. */
export const systemBus = new SystemBus();

// ============================================================================
// CONVENIENCE EMITTERS
// ============================================================================

/** Emit a Ralph Loop event */
export function emitRalphEvent(
  type:
    | "cycle.started"
    | "cycle.completed"
    | "cycle.failed"
    | "action.started"
    | "action.completed",
  tenantId: string,
  data: Record<string, unknown>,
  correlationId?: string,
): void {
  systemBus.emit({
    type: `ralph.${type}` as BusEventType,
    source: "ralph_loop",
    tenantId,
    timestamp: Date.now(),
    correlationId,
    data,
  });
}

/** Emit a Swarm event */
export function emitSwarmEvent(
  type:
    | "session.created"
    | "session.completed"
    | "agent.started"
    | "agent.completed"
    | "agent.stuck",
  tenantId: string,
  data: Record<string, unknown>,
  correlationId?: string,
): void {
  systemBus.emit({
    type: `swarm.${type}` as BusEventType,
    source: "agent_swarm",
    tenantId,
    timestamp: Date.now(),
    correlationId,
    data,
  });
}

/** Emit an ATLAS Pipeline event */
export function emitAtlasEvent(
  type:
    | "pipeline.started"
    | "stage.completed"
    | "pipeline.completed"
    | "pipeline.failed",
  tenantId: string,
  data: Record<string, unknown>,
  correlationId?: string,
): void {
  systemBus.emit({
    type: `atlas.${type}` as BusEventType,
    source: "atlas_pipeline",
    tenantId,
    timestamp: Date.now(),
    correlationId,
    data,
  });
}

/** Emit a health event */
export function emitHealthEvent(
  type:
    | "check.completed"
    | "alert.triggered"
    | "subsystem.degraded"
    | "subsystem.recovered",
  data: Record<string, unknown>,
  tenantId?: string,
): void {
  systemBus.emit({
    type: `health.${type}` as BusEventType,
    source: "health_checker",
    tenantId,
    timestamp: Date.now(),
    data,
  });
}

/** Emit a self-builder event */
export function emitSelfBuilderEvent(
  type: "widget.added" | "widget.removed" | "layout.changed" | "config.updated",
  tenantId: string,
  data: Record<string, unknown>,
): void {
  systemBus.emit({
    type: `self.${type}` as BusEventType,
    source: "self_builder",
    tenantId,
    timestamp: Date.now(),
    data,
  });
}
