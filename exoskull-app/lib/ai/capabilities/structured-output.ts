/**
 * Structured Output Capability
 *
 * Uses Gemini's native JSON mode to generate type-safe structured responses.
 * Guarantees valid JSON matching a provided schema — no parsing failures.
 *
 * Usage:
 *   const result = await generateStructured<MyType>({
 *     prompt: "Extract data from this text...",
 *     schema: { type: "object", properties: { ... } },
 *   });
 *
 * Used by: app builder (JSON specs), data extraction, form filling.
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface StructuredOutputOptions<T> {
  /** The prompt/instruction */
  prompt: string;
  /** JSON Schema for the expected output */
  schema: Record<string, unknown>;
  /** Optional context/examples */
  context?: string;
  /** Model override (default: gemini-3-flash-preview) */
  model?: string;
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.2 for structured) */
  temperature?: number;
  /** Tenant ID for tracking */
  tenantId?: string;
}

export interface StructuredOutputResult<T> {
  /** Parsed result matching the schema */
  data: T;
  /** Raw JSON string */
  rawJson: string;
  /** Model used */
  model: string;
  /** Processing duration in ms */
  durationMs: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate structured JSON output using Gemini's native JSON mode.
 *
 * The model is constrained to output valid JSON matching the provided schema.
 * This eliminates parsing failures and ensures type safety.
 *
 * @param opts - Configuration including prompt, schema, and optional context
 * @returns Parsed data matching the schema type T
 * @throws Error if generation fails or JSON is invalid
 */
export async function generateStructured<T = Record<string, unknown>>(
  opts: StructuredOutputOptions<T>,
): Promise<StructuredOutputResult<T>> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("[StructuredOutput] GOOGLE_AI_API_KEY not configured");
  }

  const model = opts.model || "gemini-3-flash-preview";
  const startTime = Date.now();

  logger.info("[StructuredOutput] Generating:", {
    model,
    promptLength: opts.prompt.length,
    hasContext: !!opts.context,
    tenantId: opts.tenantId,
  });

  const ai = new GoogleGenAI({ apiKey });

  // Build prompt with optional context
  const fullPrompt = opts.context
    ? `${opts.context}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    config: {
      maxOutputTokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.2,
      responseMimeType: "application/json",
      responseSchema: opts.schema as any,
    },
  });

  const rawJson = response.text || "{}";
  const durationMs = Date.now() - startTime;

  // Parse and validate
  let data: T;
  try {
    data = JSON.parse(rawJson) as T;
  } catch (parseError) {
    logger.error("[StructuredOutput] JSON parse failed:", {
      rawJson: rawJson.substring(0, 200),
      error: parseError instanceof Error ? parseError.message : parseError,
      tenantId: opts.tenantId,
    });
    throw new Error(
      `[StructuredOutput] Invalid JSON response: ${rawJson.substring(0, 100)}`,
    );
  }

  logger.info("[StructuredOutput] Generated:", {
    model,
    durationMs,
    jsonLength: rawJson.length,
    tenantId: opts.tenantId,
  });

  return {
    data,
    rawJson,
    model,
    durationMs,
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Extract structured data from unstructured text.
 * Useful for parsing emails, documents, chat messages.
 */
export async function extractData<T = Record<string, unknown>>(
  text: string,
  schema: Record<string, unknown>,
  instruction?: string,
  tenantId?: string,
): Promise<T> {
  const result = await generateStructured<T>({
    prompt:
      instruction ||
      "Extract the following structured data from the provided text. Be accurate and extract only what's present in the text.",
    context: text,
    schema,
    tenantId,
  });
  return result.data;
}

/**
 * Classify text into predefined categories.
 * Returns the category and confidence score.
 */
export async function classifyText(
  text: string,
  categories: string[],
  tenantId?: string,
): Promise<{ category: string; confidence: number; reasoning: string }> {
  const schema = {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: categories,
        description: "The most fitting category",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0.0-1.0",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation for the classification",
      },
    },
    required: ["category", "confidence", "reasoning"],
  };

  const result = await generateStructured<{
    category: string;
    confidence: number;
    reasoning: string;
  }>({
    prompt: `Classify this text into one of these categories: ${categories.join(", ")}.\n\nText: "${text}"`,
    schema,
    tenantId,
  });

  return result.data;
}

/**
 * Generate a JSON app specification (for app builder).
 * Constrained to the ExoSkull app schema format.
 */
export async function generateAppSpec(
  description: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const appSchema = {
    type: "object",
    properties: {
      name: { type: "string", description: "App name" },
      slug: {
        type: "string",
        description: "URL-safe slug (lowercase, hyphens)",
      },
      description: { type: "string", description: "One-line description" },
      icon: { type: "string", description: "Emoji icon" },
      columns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: [
                "text",
                "integer",
                "numeric",
                "boolean",
                "timestamp",
                "date",
                "jsonb",
              ],
            },
            label: { type: "string" },
            required: { type: "boolean" },
            default_value: { type: "string" },
          },
          required: ["name", "type", "label"],
        },
        description: "Table columns for the app",
      },
      views: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["table", "chart", "form", "calendar", "kanban"],
            },
            title: { type: "string" },
            config: { type: "object" },
          },
          required: ["type", "title"],
        },
        description: "UI views for the app",
      },
    },
    required: ["name", "slug", "description", "icon", "columns"],
  };

  const result = await generateStructured<Record<string, unknown>>({
    prompt: `Design an app based on this description: "${description}"\n\nCreate a practical app specification with appropriate columns and at least one view. Use Polish labels where appropriate.`,
    schema: appSchema,
    tenantId,
    temperature: 0.4, // Slightly creative for app design
  });

  return result.data;
}
