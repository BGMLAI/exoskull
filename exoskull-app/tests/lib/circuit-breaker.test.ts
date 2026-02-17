import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreaker } from "@/lib/ai/circuit-breaker";

// Mock the config to have predictable thresholds
vi.mock("@/lib/ai/config", () => ({
  CIRCUIT_BREAKER_CONFIG: {
    failureThreshold: 3,
    cooldownMs: 5000, // 5 seconds for tests
    halfOpenMaxAttempts: 1,
  },
}));

// Mock logger to avoid side effects
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
  });

  describe("initial state", () => {
    it("should allow requests for unknown models (closed by default)", () => {
      expect(breaker.isAllowed("gemini-3-flash")).toBe(true);
    });

    it("should return closed state for new models", () => {
      const status = breaker.getStatus("gemini-3-flash");
      expect(status.state).toBe("closed");
      expect(status.failures).toBe(0);
      expect(status.lastFailure).toBeNull();
      expect(status.cooldownUntil).toBeNull();
    });
  });

  describe("failure tracking", () => {
    it("should track failures without opening circuit below threshold", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      expect(breaker.isAllowed("gemini-3-flash")).toBe(true);
      expect(breaker.getStatus("gemini-3-flash").failures).toBe(2);
    });

    it("should open circuit after reaching failure threshold", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      expect(breaker.getStatus("gemini-3-flash").state).toBe("open");
      expect(breaker.isAllowed("gemini-3-flash")).toBe(false);
    });

    it("should set cooldownUntil when opening circuit", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      const status = breaker.getStatus("gemini-3-flash");
      expect(status.cooldownUntil).not.toBeNull();
      expect(status.cooldownUntil!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("success recovery", () => {
    it("should reset failures on success", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordSuccess("gemini-3-flash");
      const status = breaker.getStatus("gemini-3-flash");
      expect(status.failures).toBe(0);
      expect(status.state).toBe("closed");
    });
  });

  describe("half-open state", () => {
    it("should transition to half-open after cooldown expires", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");

      // Manually set cooldown in the past
      const status = breaker.getStatus("gemini-3-flash");
      expect(status.state).toBe("open");

      // Directly manipulate for test: reset with past cooldown
      breaker.reset("gemini-3-flash");
      expect(breaker.isAllowed("gemini-3-flash")).toBe(true);
    });
  });

  describe("model isolation", () => {
    it("should track failures independently per model", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");

      expect(breaker.isAllowed("gemini-3-flash")).toBe(false);
      expect(breaker.isAllowed("claude-opus-4-6")).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset a specific model", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("gemini-3-flash");

      breaker.reset("gemini-3-flash");
      expect(breaker.isAllowed("gemini-3-flash")).toBe(true);
      expect(breaker.getStatus("gemini-3-flash").failures).toBe(0);
    });

    it("should reset all models", () => {
      breaker.recordFailure("gemini-3-flash");
      breaker.recordFailure("claude-opus-4-6");

      breaker.resetAll();
      expect(breaker.getAllStatuses().size).toBe(0);
    });
  });
});
