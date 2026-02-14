/**
 * Vision / Image Analysis Capability
 *
 * Uses Gemini 3 Flash with multimodal input to analyze images.
 * Supports: screenshots, document OCR, photo understanding, chart reading.
 *
 * Usage:
 *   const result = await analyzeImage({
 *     imageUrl: "https://example.com/image.png",
 *     prompt: "What does this show?",
 *     tenantId: "user-uuid",
 *   });
 *
 * Can also be used as IORS tool: `analyze_image`
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface ImageAnalysisOptions {
  /** URL of the image to analyze */
  imageUrl?: string;
  /** Base64-encoded image data (alternative to URL) */
  imageBase64?: string;
  /** MIME type (auto-detected from URL if not provided) */
  mimeType?: string;
  /** Analysis prompt */
  prompt: string;
  /** Tenant ID for tracking */
  tenantId: string;
  /** Model override (default: gemini-3-flash-preview) */
  model?: string;
  /** Max output tokens (default: 2048) */
  maxTokens?: number;
}

export interface ImageAnalysisResult {
  /** Analysis text */
  text: string;
  /** Model used */
  model: string;
  /** Processing duration in ms */
  durationMs: number;
  /** Estimated cost */
  estimatedCost: number;
}

// ============================================================================
// MIME TYPE DETECTION
// ============================================================================

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

function detectMimeType(url: string): string {
  const lower = url.toLowerCase();
  for (const [ext, mime] of Object.entries(EXTENSION_MIME_MAP)) {
    if (lower.includes(ext)) return mime;
  }
  return "image/jpeg"; // Safe default
}

// ============================================================================
// IMAGE FETCHING
// ============================================================================

/**
 * Fetch image and return as base64 with MIME type.
 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ExoSkull/1.0 VisionAnalysis" },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Get MIME type from response headers or URL
    const contentType = response.headers.get("content-type");
    const mimeType = contentType?.split(";")[0] || detectMimeType(url);

    return { base64, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze an image using Gemini 3 Flash vision capabilities.
 *
 * Accepts either a URL (fetched server-side) or base64 data.
 * Returns structured text analysis.
 */
export async function analyzeImage(
  opts: ImageAnalysisOptions,
): Promise<ImageAnalysisResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("[Vision] GOOGLE_AI_API_KEY not configured");
  }

  const model = opts.model || "gemini-3-flash-preview";
  const startTime = Date.now();

  logger.info("[Vision] Analyzing image:", {
    hasUrl: !!opts.imageUrl,
    hasBase64: !!opts.imageBase64,
    model,
    tenantId: opts.tenantId,
    prompt: opts.prompt.substring(0, 80),
  });

  // Get image data
  let imageBase64: string;
  let mimeType: string;

  if (opts.imageBase64) {
    imageBase64 = opts.imageBase64;
    mimeType = opts.mimeType || "image/jpeg";
  } else if (opts.imageUrl) {
    const fetched = await fetchImageAsBase64(opts.imageUrl);
    imageBase64 = fetched.base64;
    mimeType = opts.mimeType || fetched.mimeType;
  } else {
    throw new Error("[Vision] Either imageUrl or imageBase64 is required");
  }

  // Call Gemini with multimodal input
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: opts.prompt },
        ],
      },
    ],
    config: {
      maxOutputTokens: opts.maxTokens || 2048,
      temperature: 0.3, // Lower temperature for factual analysis
    },
  });

  const text = response.text || "";
  const durationMs = Date.now() - startTime;

  // Rough cost estimate (Gemini 3 Flash: $0.50/1M input, $3.00/1M output)
  // Image ~258 tokens for small, ~1000 for large
  const estimatedInputTokens = 500 + opts.prompt.length / 4;
  const estimatedOutputTokens = text.length / 4;
  const estimatedCost =
    (estimatedInputTokens / 1_000_000) * 0.5 +
    (estimatedOutputTokens / 1_000_000) * 3.0;

  logger.info("[Vision] Analysis complete:", {
    model,
    durationMs,
    textLength: text.length,
    estimatedCost,
    tenantId: opts.tenantId,
  });

  return {
    text,
    model,
    durationMs,
    estimatedCost,
  };
}

/**
 * Quick image description (one-liner).
 * Useful for thumbnails, previews, accessibility.
 */
export async function describeImage(
  imageUrl: string,
  tenantId: string,
): Promise<string> {
  const result = await analyzeImage({
    imageUrl,
    prompt:
      "Describe this image in one sentence. Be specific about what you see.",
    tenantId,
    maxTokens: 256,
  });
  return result.text;
}

/**
 * OCR — extract text from document image.
 */
export async function extractTextFromImage(
  imageUrl: string,
  tenantId: string,
): Promise<string> {
  const result = await analyzeImage({
    imageUrl,
    prompt:
      "Extract ALL text visible in this image. Preserve formatting, headers, and structure. If this is a document, extract the full content. Output the raw text only.",
    tenantId,
    maxTokens: 4096,
  });
  return result.text;
}
