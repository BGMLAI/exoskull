/**
 * Gemini Capabilities IORS Tools
 *
 * Exposes vision (image analysis) and structured output as IORS tools,
 * so the AI can analyze images and generate type-safe JSON on demand.
 */

import type { ToolDefinition } from "./shared";

import { logger } from "@/lib/logger";
export const capabilitiesTools: ToolDefinition[] = [
  // ── analyze_image ──────────────────────────────────────────────────────────
  {
    definition: {
      name: "analyze_image",
      description:
        "Analyze an image using Gemini vision. Supports: screenshots, photos, document OCR, charts, diagrams. Provide either a URL or ask the user to upload an image first.",
      input_schema: {
        type: "object" as const,
        properties: {
          image_url: {
            type: "string",
            description: "Public URL of the image to analyze",
          },
          prompt: {
            type: "string",
            description:
              "What to analyze or extract from the image (e.g. 'describe this screenshot', 'extract all text', 'what emotions are shown')",
          },
        },
        required: ["image_url", "prompt"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const { analyzeImage } = await import("@/lib/ai/capabilities/vision");

      const imageUrl = String(input.image_url || "");
      const prompt = String(input.prompt || "Describe this image in detail.");

      if (!imageUrl) {
        return "Brak URL obrazu. Podaj link do zdjecia lub popros uzytkownika o przeslanie pliku.";
      }

      try {
        const result = await analyzeImage({
          imageUrl,
          prompt,
          tenantId,
        });

        return `[Analiza obrazu — ${result.model}, ${result.durationMs}ms, ~$${result.estimatedCost.toFixed(4)}]\n\n${result.text}`;
      } catch (error) {
        logger.error("[IORS:analyze_image] Failed:", {
          error: error instanceof Error ? error.message : error,
          tenantId,
        });
        return `Nie udalo sie przeanalizowac obrazu: ${error instanceof Error ? error.message : "nieznany blad"}`;
      }
    },
    timeoutMs: 30_000,
  },

  // ── extract_image_text ─────────────────────────────────────────────────────
  {
    definition: {
      name: "extract_image_text",
      description:
        "OCR — extract all text from a document image, screenshot, or photo of a page. Returns raw text preserving formatting.",
      input_schema: {
        type: "object" as const,
        properties: {
          image_url: {
            type: "string",
            description: "Public URL of the image containing text",
          },
        },
        required: ["image_url"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const { extractTextFromImage } =
        await import("@/lib/ai/capabilities/vision");

      const imageUrl = String(input.image_url || "");
      if (!imageUrl) {
        return "Brak URL obrazu.";
      }

      try {
        const text = await extractTextFromImage(imageUrl, tenantId);
        return text || "Nie znaleziono tekstu w obrazie.";
      } catch (error) {
        logger.error("[IORS:extract_image_text] Failed:", {
          error: error instanceof Error ? error.message : error,
          tenantId,
        });
        return `Nie udalo sie wyciagnac tekstu: ${error instanceof Error ? error.message : "nieznany blad"}`;
      }
    },
    timeoutMs: 30_000,
  },

  // ── classify_text ──────────────────────────────────────────────────────────
  {
    definition: {
      name: "classify_text",
      description:
        "Classify text into one of the provided categories using AI. Returns the category, confidence score, and reasoning.",
      input_schema: {
        type: "object" as const,
        properties: {
          text: {
            type: "string",
            description: "Text to classify",
          },
          categories: {
            type: "array",
            items: { type: "string" },
            description:
              "List of possible categories (e.g. ['positive', 'negative', 'neutral'])",
          },
        },
        required: ["text", "categories"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const { classifyText } =
        await import("@/lib/ai/capabilities/structured-output");

      const text = String(input.text || "");
      const categories = (input.categories as string[]) || [];

      if (!text || categories.length < 2) {
        return "Podaj tekst i minimum 2 kategorie.";
      }

      try {
        const result = await classifyText(text, categories, tenantId);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        logger.error("[IORS:classify_text] Failed:", {
          error: error instanceof Error ? error.message : error,
          tenantId,
        });
        return `Nie udalo sie sklasyfikowac tekstu: ${error instanceof Error ? error.message : "nieznany blad"}`;
      }
    },
  },
];
