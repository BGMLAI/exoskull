/**
 * DeepSeek Provider - Tier 1 (V3) & Tier 2 (V3)
 *
 * DeepSeek V3 — OpenAI-compatible API at https://api.deepseek.com
 * - 128K context window
 * - Tool calling support (OpenAI function calling format)
 * - Pricing: $0.27/1M input, $1.10/1M output
 * - Replaces Gemini for Tier 1+2 (classification, extraction, analysis)
 */

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

import { logger } from "@/lib/logger";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface DeepSeekRequestBody {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: DeepSeekTool[];
  tool_choice?: "auto" | "none";
}

const DEEPSEEK_MODEL_MAP: Record<string, string> = {
  "deepseek-v3": "deepseek-chat",
};

export class DeepSeekProvider implements IAIProvider {
  readonly provider: ModelProvider = "deepseek";
  readonly supportedModels: ModelId[] = ["deepseek-v3"];

  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) {
        throw new AIProviderError(
          "DEEPSEEK_API_KEY not configured",
          "deepseek",
          "deepseek-v3",
        );
      }
      this.apiKey = key;
    }
    return this.apiKey;
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const apiKey = this.getApiKey();
      const apiModel = DEEPSEEK_MODEL_MAP[model] || "deepseek-chat";

      const messages: DeepSeekMessage[] = options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: DeepSeekRequestBody = {
        model: apiModel,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      };

      // Add tool calling if tools provided
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
        body.tool_choice = "auto";
      }

      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          (errorData as Record<string, Record<string, string>>)?.error
            ?.message || `${response.status} ${response.statusText}`;
        logger.error("[DeepSeekProvider] API error:", {
          status: response.status,
          error: errorMsg,
          model,
        });
        throw new AIProviderError(
          `DeepSeek API error: ${errorMsg}`,
          "deepseek",
          model,
          response.status,
        );
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? "";
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;

      // Extract tool calls if present
      let toolCalls: AIToolCall[] | undefined;
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        toolCalls = choice.message.tool_calls.map(
          (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || "{}"),
          }),
        );
      }

      // Tier based on task category routing (1 or 2)
      const tier = (options.forceTier ?? 1) as 1 | 2;

      return {
        content,
        model,
        tier,
        provider: "deepseek",
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
      logger.error("[DeepSeekProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      throw new AIProviderError(
        `DeepSeek chat failed: ${errorMessage}`,
        "deepseek",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return !!process.env.DEEPSEEK_API_KEY;
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
