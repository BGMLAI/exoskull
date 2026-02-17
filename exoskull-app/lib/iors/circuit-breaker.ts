import { logger } from "@/lib/logger";
/**
 * Circuit Breaker — Centralized failure tracking per tenant/service
 *
 * Prevents cascading failures by tracking error counts and auto-degrading
 * to rule-based fallbacks after threshold breaches.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 *
 * Usage:
 *   const breaker = CircuitBreaker.for(tenantId, 'composio');
 *   if (!breaker.isAllowed()) return fallback();
 *   try { await action(); breaker.recordSuccess(); }
 *   catch (e) {
 *     logger.error('[MyService] Failed:', { error: e.message, tenantId });
 *     breaker.recordFailure(e.message);
 *     throw e;
 *   }
 */

type CircuitState = "closed" | "open" | "half_open";

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastSuccess: number;
  lastError: string;
  openedAt: number;
}

const DEFAULT_OPTS = {
  /** Number of failures before opening the circuit */
  failureThreshold: 3,
  /** Cooldown before trying again (ms) — 5 minutes */
  cooldownMs: 5 * 60 * 1000,
  /** Successes in half_open needed to close again */
  halfOpenSuccessThreshold: 2,
};

/**
 * In-memory circuit breaker store.
 * Resets on cold start (Vercel function lifecycle), which is fine —
 * we'd rather occasionally retry than persist stale open circuits.
 */
const store = new Map<string, CircuitEntry>();

function key(tenantId: string, service: string): string {
  return `${tenantId}:${service}`;
}

function getEntry(k: string): CircuitEntry {
  if (!store.has(k)) {
    store.set(k, {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: 0,
      lastSuccess: 0,
      lastError: "",
      openedAt: 0,
    });
  }
  return store.get(k)!;
}

export const CircuitBreaker = {
  for(tenantId: string, service: string) {
    const k = key(tenantId, service);

    return {
      /** Check if action is allowed (circuit closed or half_open) */
      isAllowed(): boolean {
        const entry = getEntry(k);

        if (entry.state === "closed") return true;

        if (entry.state === "open") {
          // Check if cooldown has passed → transition to half_open
          if (Date.now() - entry.openedAt >= DEFAULT_OPTS.cooldownMs) {
            entry.state = "half_open";
            entry.successes = 0;
            logger.info(`[CircuitBreaker] ${k} → half_open (cooldown elapsed)`);
            return true;
          }
          return false;
        }

        // half_open — allow limited requests
        return true;
      },

      /** Record a successful call */
      recordSuccess(): void {
        const entry = getEntry(k);
        entry.lastSuccess = Date.now();
        entry.successes++;

        if (entry.state === "half_open") {
          if (entry.successes >= DEFAULT_OPTS.halfOpenSuccessThreshold) {
            entry.state = "closed";
            entry.failures = 0;
            logger.info(`[CircuitBreaker] ${k} → closed (recovered)`);
          }
        } else if (entry.state === "closed") {
          // Reset failure count on success
          entry.failures = 0;
        }
      },

      /** Record a failed call */
      recordFailure(error: string): void {
        const entry = getEntry(k);
        entry.failures++;
        entry.lastFailure = Date.now();
        entry.lastError = error;

        if (
          entry.state === "half_open" ||
          entry.failures >= DEFAULT_OPTS.failureThreshold
        ) {
          entry.state = "open";
          entry.openedAt = Date.now();
          logger.warn(
            `[CircuitBreaker] ${k} → OPEN after ${entry.failures} failures: ${error}`,
          );
        }
      },

      /** Get current state for observability */
      getState(): CircuitEntry & { key: string } {
        return { ...getEntry(k), key: k };
      },
    };
  },

  /** Get all circuits that are currently open or half_open (for monitoring) */
  getOpenCircuits(): Array<CircuitEntry & { key: string }> {
    const open: Array<CircuitEntry & { key: string }> = [];
    for (const [k, entry] of store.entries()) {
      if (entry.state !== "closed") {
        open.push({ ...entry, key: k });
      }
    }
    return open;
  },

  /** Reset a specific circuit (e.g., after manual recovery) */
  reset(tenantId: string, service: string): void {
    store.delete(key(tenantId, service));
  },

  /** Reset all circuits */
  resetAll(): void {
    store.clear();
  },
};
