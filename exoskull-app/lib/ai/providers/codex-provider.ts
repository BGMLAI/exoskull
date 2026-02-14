/**
 * Codex Provider - Tier 3 (Code Generation)
 *
 * OpenAI Codex 5.2 uses the /v1/responses endpoint (NOT /v1/chat/completions).
 * Uses OpenAI SDK: openai.responses.create()
 *
 * Capabilities:
 * - Code generation, refactoring, debugging
 * - Tool calling (OpenAI function format)
 * - Reasoning effort control (low/medium/high)
 */

import OpenAI from "openai";
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

const CODEX_MODEL = "codex-mini-latest";

export class CodexProvider implements IAIProvider {
  readonly provider: ModelProvider = "codex";
  readonly supportedModels: ModelId[] = ["codex-5-2"];

  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError(
          "OPENAI_API_KEY not configured",
          "codex",
          "codex-5-2",
        );
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const client = this.getClient();

      // Build input from messages (Responses API uses a single input string or array)
      const systemMessage = options.messages.find(
        (m) => m.role === "system",
      )?.content;
      const conversationMessages = options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Build tools in OpenAI Responses API function format
      const tools = options.tools?.map((t) => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
        strict: false as const,
      }));

      // Codex uses the Responses API
      const response = await client.responses.create({
        model: CODEX_MODEL,
        instructions: systemMessage || undefined,
        input: conversationMessages,
        ...(tools && tools.length > 0 ? { tools } : {}),
        max_output_tokens: options.maxTokens ?? 16384,
        temperature: options.temperature ?? 0.3, // Lower temp for code
      });

      const latencyMs = Date.now() - startTime;

      // Extract text from response output items
      let content = "";
      const toolCalls: AIToolCall[] = [];

      for (const item of response.output) {
        if (item.type === "message") {
          for (const part of item.content) {
            if (part.type === "output_text") {
              content += part.text;
            }
          }
        } else if (item.type === "function_call") {
          toolCalls.push({
            name: item.name,
            arguments: JSON.parse(item.arguments || "{}"),
          });
        }
      }

      // Usage from response
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      return {
        content,
        model,
        tier: 3,
        provider: "codex",
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: calculateCost(inputTokens, outputTokens, model),
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        latencyMs,
      };
    } catch (error: unknown) {
      if (error instanceof AIProviderError) throw error;

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[CodexProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      if (error instanceof OpenAI.APIError) {
        throw new AIProviderError(
          `Codex API error: ${error.message}`,
          "codex",
          model,
          error.status,
        );
      }

      throw new AIProviderError(
        `Codex chat failed: ${errorMessage}`,
        "codex",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return !!process.env.OPENAI_API_KEY;
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
}
