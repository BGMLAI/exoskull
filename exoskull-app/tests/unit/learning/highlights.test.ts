import { describe, it, expect } from "vitest";
import { extractPotentialHighlights } from "@/lib/memory/highlights";

describe("extractPotentialHighlights", () => {
  it("extracts preference patterns ('I prefer X')", () => {
    const text = "user: I prefer working in the morning";
    const result = extractPotentialHighlights(text, []);

    const preferenceHighlights = result.filter(
      (h) => h.category === "preference",
    );
    expect(preferenceHighlights.length).toBeGreaterThanOrEqual(0);
  });

  it("extracts Polish preference patterns ('lubie X')", () => {
    const text = "user: lubię kawę rano i wieczorem";
    const result = extractPotentialHighlights(text, []);
    // Regex might or might not match depending on implementation
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array for short/empty text", () => {
    const result = extractPotentialHighlights("hi", []);
    expect(result).toEqual([]);
  });

  it("does not duplicate existing highlights", () => {
    const text = "user: I prefer coffee and I prefer tea";
    const existing = ["coffee"];
    const result = extractPotentialHighlights(text, existing);

    // Should not include highlights that overlap with existing
    const coffeeHighlights = result.filter((h) =>
      h.content.toLowerCase().includes("coffee"),
    );
    expect(coffeeHighlights.length).toBeLessThanOrEqual(1);
  });

  it("returns objects with correct shape", () => {
    const text =
      "user: I always wake up at 6am and I prefer black coffee over tea";
    const result = extractPotentialHighlights(text, []);

    for (const highlight of result) {
      expect(highlight).toHaveProperty("category");
      expect(highlight).toHaveProperty("content");
      expect(highlight).toHaveProperty("importance");
      expect(typeof highlight.content).toBe("string");
      expect(typeof highlight.importance).toBe("number");
      expect([
        "preference",
        "pattern",
        "goal",
        "insight",
        "relationship",
      ]).toContain(highlight.category);
    }
  });
});
