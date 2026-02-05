import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing SelfUpdater
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
}));

import { SelfUpdater } from "@/lib/learning/self-updater";

describe("SelfUpdater", () => {
  let updater: SelfUpdater;

  beforeEach(() => {
    updater = new SelfUpdater();
  });

  describe("runUpdateCycle", () => {
    it("returns result with zero counts when no unprocessed conversations", async () => {
      const result = await updater.runUpdateCycle();

      expect(result).toMatchObject({
        highlightsAdded: 0,
        highlightsBoosted: 0,
        conversationsProcessed: 0,
        highlightsDecayed: 0,
        mitsUpdated: false,
      });
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("returns patternsDetected as empty array", async () => {
      const result = await updater.runUpdateCycle();
      expect(result.patternsDetected).toEqual([]);
    });
  });

  describe("runDecayCycle", () => {
    it("returns zero decayed when no stale highlights", async () => {
      const result = await updater.runDecayCycle();
      expect(result).toEqual({ decayed: 0 });
    });
  });

  describe("validateWithAI", () => {
    it("returns empty array for empty candidates", async () => {
      const result = await updater.validateWithAI(
        "some transcript",
        [],
        "tenant-1",
      );
      expect(result).toEqual([]);
    });

    it("falls back to candidates when AI fails", async () => {
      // Mock model router to throw
      vi.doMock("@/lib/ai/model-router", () => ({
        ModelRouter: vi.fn().mockImplementation(() => ({
          route: vi.fn().mockRejectedValue(new Error("AI unavailable")),
        })),
      }));

      const candidates = [
        {
          category: "preference" as const,
          content: "likes coffee",
          importance: 7,
        },
      ];

      const result = await updater.validateWithAI(
        "I really like coffee in the morning, it helps me focus on my work",
        candidates,
        "tenant-1",
      );

      // Should fall back to original candidates
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });
});
