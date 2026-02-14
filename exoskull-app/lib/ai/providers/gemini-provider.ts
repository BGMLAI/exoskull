/**
 * Gemini Provider - Tier 1 (Flash) & Tier 2 (Pro)
 *
 * Uses @google/genai SDK (NOT the deprecated @google/generative-ai).
 * Supports: Gemini 2.5 Flash, Gemini 3 Flash, Gemini 3 Pro
 *
 * Capabilities:
 * - Text generation with tool calling
 * - Vision (multimodal image input)
 * - Structured output (JSON schema response)
 */

import { GoogleGenAI } from "@google/genai";
import {
  IAIProvider,
  ModelProvider,
  ModelId,
  AIRequestOptions,
  AIResponse,
  AIToolCall,
  AIProviderError,
} from "../types";
import { calculateCost } from "../config";

// Map our ModelId to actual Gemini API model names
const GEMINI_MODEL_MAP: Record<string, string> = {
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3-pro": "gemini-3-pro-preview",
  "gemini-2.5-flash": "gemini-2.5-flash",
};

export class GeminiProvider implements IAIProvider {
  readonly provider: ModelProvider = "gemini";
  readonly supportedModels: ModelId[] = [
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-2.5-flash",
  ];

  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError(
          "GOOGLE_AI_API_KEY not configured",
          "gemini",
          "gemini-3-flash",
        );
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const client = this.getClient();
      const geminiModel = GEMINI_MODEL_MAP[model];

      if (!geminiModel) {
        throw new AIProviderError(
          `Unknown Gemini model: ${model}`,
          "gemini",
          model,
        );
      }

      // Extract system instruction
      const systemMessage = options.messages.find((m) => m.role === "system");
      const systemInstruction = systemMessage?.content;

      // Convert messages to Gemini format
      const contents = this.convertToGeminiContents(options.messages);

      // Build tools if provided
      const tools = options.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const response = await client.models.generateContent({
        model: geminiModel,
        contents: contents as any,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1024,
          ...(tools && tools.length > 0
            ? { tools: [{ functionDeclarations: tools as any }] }
            : {}),
        },
      });

      const latencyMs = Date.now() - startTime;

      // Extract usage from response
      const usageMetadata = response.usageMetadata;
      const inputTokens = usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;

      // Extract function calls
      const functionCalls = response.functionCalls;
      let toolCalls: AIToolCall[] | undefined;
      if (functionCalls && functionCalls.length > 0) {
        toolCalls = functionCalls.map((fc) => ({
          name: fc.name || "unknown",
          arguments: (fc.args || {}) as Record<string, unknown>,
        }));
      }

      const tier = model === "gemini-3-pro" ? 2 : 1;

      return {
        content: response.text || "",
        model,
        tier,
        provider: "gemini",
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: calculateCost(inputTokens, outputTokens, model),
        },
        toolCalls,
        latencyMs,
      };
    } catch (error: unknown) {
      if (error instanceof AIProviderError) throw error;

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[GeminiProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      throw new AIProviderError(
        `Gemini chat failed: ${errorMessage}`,
        "gemini",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return !!process.env.GOOGLE_AI_API_KEY;
    } catch {
      return false;
    }
  }

  estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelId,
  ): number {
    return calculateCost(inputTokens, outputTokens, model);
  }

  /**
   * Convert messages to Gemini contents format.
   * Gemini uses "user" and "model" roles (not "assistant").
   * System messages handled separately via systemInstruction.
   */
  private convertToGeminiContents(
    messages: AIRequestOptions["messages"],
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
  }
}
