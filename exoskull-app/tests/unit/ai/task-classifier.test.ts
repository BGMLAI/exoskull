import { describe, it, expect } from "vitest";
import { classifyTask, estimateTokenCount } from "@/lib/ai/task-classifier";
import { AIRequestOptions } from "@/lib/ai/types";

const makeOptions = (
  userMessage: string,
  systemPrompt = "",
  options: Partial<AIRequestOptions> = {},
): AIRequestOptions => ({
  messages: [
    ...(systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }]
      : []),
    { role: "user" as const, content: userMessage },
  ],
  ...options,
});

describe("classifyTask", () => {
  describe("explicit category", () => {
    it("respects explicit taskCategory", () => {
      const result = classifyTask(
        makeOptions("any message", "", { taskCategory: "classification" }),
      );
      expect(result.category).toBe("classification");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("crisis detection (Tier 4)", () => {
    it("detects suicide keywords", () => {
      const result = classifyTask(
        makeOptions("I've been having thoughts about suicide"),
      );
      expect(result.category).toBe("crisis");
      expect(result.suggestedTier).toBe(4);
      expect(result.complexity).toBe("critical");
    });

    it("detects Polish crisis keywords", () => {
      // Classifier uses partial match "samobójcz" prefix
      const result = classifyTask(
        makeOptions("Mam myśli samobójcze, potrzebuję pomocy"),
      );
      expect(result.category).toBe("crisis");
      expect(result.suggestedTier).toBe(4);
    });
  });

  describe("meta coordination (Tier 4)", () => {
    it("detects strategy keywords", () => {
      const result = classifyTask(
        makeOptions("Let's rethink the entire strategy and coordinate agents"),
      );
      expect(result.category).toBe("meta_coordination");
      expect(result.suggestedTier).toBe(4);
    });
  });

  describe("simple tasks (Tier 1)", () => {
    it("classifies simple yes/no as classification", () => {
      // Classifier looks for "yes/no" or "tak/nie" as combined string
      const result = classifyTask(
        makeOptions("Odpowiedz tak/nie: Czy pada deszcz?"),
      );
      expect(result.suggestedTier).toBe(1);
      expect(result.category).toBe("classification");
    });

    it("classifies greetings as simple response", () => {
      const result = classifyTask(makeOptions("hello there!"));
      expect(result.suggestedTier).toBe(1);
      expect(result.category).toBe("simple_response");
    });

    it("classifies extraction tasks", () => {
      const result = classifyTask(
        makeOptions("extract the email addresses from this text"),
      );
      expect(result.suggestedTier).toBe(1);
      expect(result.category).toBe("extraction");
    });
  });

  describe("complex tasks (Tier 3)", () => {
    it("classifies long context as complex", () => {
      const longText = "a".repeat(11000);
      const result = classifyTask(makeOptions(longText));
      expect(result.suggestedTier).toBe(3);
      expect(result.complexity).toBe("complex");
    });

    it("classifies many tools as complex", () => {
      const result = classifyTask(
        makeOptions("do something", "", {
          tools: [
            { name: "tool1" },
            { name: "tool2" },
            { name: "tool3" },
            { name: "tool4" },
          ],
        }),
      );
      expect(result.suggestedTier).toBe(3);
    });
  });

  describe("summarization (Tier 2)", () => {
    it("detects summarize keywords", () => {
      const result = classifyTask(makeOptions("summarize this text for me"));
      expect(result.suggestedTier).toBe(2);
      expect(result.category).toBe("summarization");
    });

    it("detects Polish summarize keywords", () => {
      const result = classifyTask(makeOptions("podsumuj ten tekst"));
      expect(result.suggestedTier).toBe(2);
      expect(result.category).toBe("summarization");
    });
  });

  describe("default behavior", () => {
    it("defaults to Tier 2 for uncertain tasks", () => {
      const result = classifyTask(
        makeOptions("tell me about the weather in Paris"),
      );
      expect(result.suggestedTier).toBe(2);
      expect(result.confidence).toBe(0.5);
    });
  });
});

describe("estimateTokenCount", () => {
  it("estimates English text (~4 chars/token)", () => {
    const text = "Hello world this is a test";
    const estimate = estimateTokenCount(text);
    expect(estimate).toBeGreaterThan(5);
    expect(estimate).toBeLessThan(15);
  });

  it("estimates Polish text (~3 chars/token)", () => {
    const text = "Cześć świecie, to jest test";
    const estimate = estimateTokenCount(text);
    // Polish has diacritics, so ~3 chars per token
    expect(estimate).toBeGreaterThan(5);
    expect(estimate).toBeLessThan(15);
  });

  it("handles empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});
