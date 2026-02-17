import { describe, it, expect } from "vitest";
import {
  MODEL_CONFIGS,
  TIER_MODELS,
  CATEGORY_TIERS,
  getModelConfig,
  getModelsForTier,
  getTierForCategory,
  calculateCost,
} from "@/lib/ai/config";

describe("AI Config", () => {
  describe("MODEL_CONFIGS", () => {
    it("should have all declared model IDs", () => {
      const expectedModels = [
        "selfhosted-qwen3-30b",
        "selfhosted-gemma-4b",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gemini-3-pro",
        "claude-3-5-haiku",
        "codex-5-2",
        "claude-sonnet-4-5",
        "kimi-k2.5",
        "claude-opus-4-6",
        "claude-opus-4-5",
      ];
      for (const id of expectedModels) {
        expect(MODEL_CONFIGS[id as keyof typeof MODEL_CONFIGS]).toBeDefined();
      }
    });

    it("should have valid tier values (0-4) for all models", () => {
      for (const [, config] of Object.entries(MODEL_CONFIGS)) {
        expect(config.tier).toBeGreaterThanOrEqual(0);
        expect(config.tier).toBeLessThanOrEqual(4);
      }
    });

    it("self-hosted models should have $0 cost", () => {
      expect(MODEL_CONFIGS["selfhosted-qwen3-30b"].inputCostPer1M).toBe(0);
      expect(MODEL_CONFIGS["selfhosted-qwen3-30b"].outputCostPer1M).toBe(0);
      expect(MODEL_CONFIGS["selfhosted-gemma-4b"].inputCostPer1M).toBe(0);
      expect(MODEL_CONFIGS["selfhosted-gemma-4b"].outputCostPer1M).toBe(0);
    });

    it("higher tier models should generally cost more", () => {
      const tier1Cost = MODEL_CONFIGS["gemini-3-flash"].outputCostPer1M;
      const tier4Cost = MODEL_CONFIGS["claude-opus-4-6"].outputCostPer1M;
      expect(tier4Cost).toBeGreaterThan(tier1Cost);
    });
  });

  describe("TIER_MODELS", () => {
    it("should have models for each tier 0-4", () => {
      for (let tier = 0; tier <= 4; tier++) {
        expect(
          TIER_MODELS[tier as keyof typeof TIER_MODELS].length,
        ).toBeGreaterThan(0);
      }
    });

    it("all referenced models should exist in MODEL_CONFIGS", () => {
      for (const models of Object.values(TIER_MODELS)) {
        for (const modelId of models) {
          expect(
            MODEL_CONFIGS[modelId as keyof typeof MODEL_CONFIGS],
          ).toBeDefined();
        }
      }
    });
  });

  describe("CATEGORY_TIERS", () => {
    it("crisis should route to tier 4", () => {
      expect(CATEGORY_TIERS.crisis).toBe(4);
    });

    it("classification should route to tier 1", () => {
      expect(CATEGORY_TIERS.classification).toBe(1);
    });

    it("code_generation should route to tier 3", () => {
      expect(CATEGORY_TIERS.code_generation).toBe(3);
    });
  });

  describe("helper functions", () => {
    it("getModelConfig returns correct config", () => {
      const config = getModelConfig("gemini-3-flash");
      expect(config.provider).toBe("gemini");
      expect(config.tier).toBe(1);
    });

    it("getModelsForTier returns models for valid tier", () => {
      const models = getModelsForTier(1);
      expect(models).toContain("gemini-3-flash");
    });

    it("getModelsForTier returns empty array for invalid tier", () => {
      const models = getModelsForTier(99 as any);
      expect(models).toEqual([]);
    });

    it("getTierForCategory maps correctly", () => {
      expect(getTierForCategory("crisis")).toBe(4);
      expect(getTierForCategory("extraction")).toBe(1);
    });

    it("calculateCost computes correctly", () => {
      // gemini-3-flash: input $0.5/1M, output $3.0/1M
      const cost = calculateCost(1_000_000, 1_000_000, "gemini-3-flash");
      expect(cost).toBeCloseTo(3.5, 2);
    });

    it("calculateCost returns 0 for self-hosted models", () => {
      const cost = calculateCost(1_000_000, 1_000_000, "selfhosted-qwen3-30b");
      expect(cost).toBe(0);
    });
  });
});
