/**
 * Groq Provider - Tier 2 fallback
 *
 * Llama 3.3 70B via Groq's ultra-fast inference.
 * - Base URL: https://api.groq.com/openai/v1
 * - Env: GROQ_API_KEY
 * - FREE tier: 30 RPM, 6000 tokens/min
 * - OpenAI-compatible API
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

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const GROQ_MODEL_MAP: Record<string, string> = {
  "groq-llama-3.3-70b": "llama-3.3-70b-versatile",
};

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export class GroqProvider implements IAIProvider {
  readonly provider: ModelProvider = "groq";
  readonly supportedModels: ModelId[] = ["groq-llama-3.3-70b"];

  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        throw new AIProviderError(
          "GROQ_API_KEY not configured",
          "groq",
          "groq-llama-3.3-70b",
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
      const apiModel = GROQ_MODEL_MAP[model];

      if (!apiModel) {
        throw new AIProviderError(
          `Unknown Groq model: ${model}`,
          "groq",
          model,
        );
      }

      const messages = options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, unknown> = {
        model: apiModel,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      };

      // Add tool calling if tools provided
      if (options.tools && options.tools.length > 0) {
        const tools: OpenAITool[] = options.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
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
        logger.error("[GroqProvider] API error:", {
          status: response.status,
          error: errorMsg,
          model,
        });
        throw new AIProviderError(
          `Groq API error: ${errorMsg}`,
          "groq",
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

      return {
        content,
        model,
        tier: 2,
        provider: "groq",
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
      logger.error("[GroqProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      throw new AIProviderError(
        `Groq chat failed: ${errorMessage}`,
        "groq",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return !!process.env.GROQ_API_KEY;
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
