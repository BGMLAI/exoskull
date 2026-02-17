/**
 * Circuit Breaker
 *
 * Prevents cascading failures by temporarily disabling
 * failing model providers.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Provider disabled, requests fail fast
 * - HALF-OPEN: Testing if provider recovered
 */

import { ModelId, CircuitBreakerState } from "./types";
import { CIRCUIT_BREAKER_CONFIG } from "./config";

import { logger } from "@/lib/logger";
export class CircuitBreaker {
  private states: Map<ModelId, CircuitBreakerState> = new Map();

  /**
   * Get the state for a model (create if not exists)
   */
  private getState(modelId: ModelId): CircuitBreakerState {
    if (!this.states.has(modelId)) {
      this.states.set(modelId, {
        failures: 0,
        lastFailure: null,
        state: "closed",
        cooldownUntil: null,
      });
    }
    return this.states.get(modelId)!;
  }

  /**
   * Record a failure for a model
   */
  recordFailure(modelId: ModelId, error?: Error): void {
    const state = this.getState(modelId);
    state.failures++;
    state.lastFailure = new Date();

    if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      state.state = "open";
      state.cooldownUntil = new Date(
        Date.now() + CIRCUIT_BREAKER_CONFIG.cooldownMs,
      );

      logger.warn(
        `[CircuitBreaker] OPENED for ${modelId} after ${state.failures} failures`,
        {
          model: modelId,
          cooldownUntil: state.cooldownUntil.toISOString(),
          lastError: error?.message,
        },
      );
    }
  }

  /**
   * Record a success for a model
   */
  recordSuccess(modelId: ModelId): void {
    const state = this.getState(modelId);
    state.failures = 0;
    state.state = "closed";
    state.cooldownUntil = null;

    logger.debug(`[CircuitBreaker] Reset for ${modelId}`);
  }

  /**
   * Check if a model is allowed to be called
   */
  isAllowed(modelId: ModelId): boolean {
    const state = this.getState(modelId);

    switch (state.state) {
      case "closed":
        return true;

      case "open":
        // Check if cooldown has passed
        if (state.cooldownUntil && new Date() >= state.cooldownUntil) {
          state.state = "half-open";
          logger.info(
            `[CircuitBreaker] Half-open for ${modelId}, allowing test request`,
          );
          return true;
        }
        return false;

      case "half-open":
        // In half-open, we allow limited requests to test recovery
        // For simplicity, allow 1 request at a time
        return true;

      default:
        return true;
    }
  }

  /**
   * Get current state for a model
   */
  getStatus(modelId: ModelId): CircuitBreakerState {
    return { ...this.getState(modelId) };
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses(): Map<ModelId, CircuitBreakerState> {
    return new Map(this.states);
  }

  /**
   * Reset a specific model's circuit breaker
   */
  reset(modelId: ModelId): void {
    this.states.set(modelId, {
      failures: 0,
      lastFailure: null,
      state: "closed",
      cooldownUntil: null,
    });
    logger.info(`[CircuitBreaker] Manually reset for ${modelId}`);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.states.clear();
    logger.info("[CircuitBreaker] All circuit breakers reset");
  }
}

// Singleton instance
let circuitBreakerInstance: CircuitBreaker | null = null;

export function getCircuitBreaker(): CircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new CircuitBreaker();
  }
  return circuitBreakerInstance;
}
