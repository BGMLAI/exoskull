/**
 * Kimi Provider - Tier 3
 *
 * Kimi K2.5 from Moonshot AI
 * - OpenAI-compatible API at https://api.moonshot.cn/v1
 * - 256K context window
 * - Tool calling support (OpenAI function calling format)
 * - Thinking mode (reasoning traces)
 * - Agent Swarm capability (PARL-trained, 100 parallel sub-agents)
 *
 * Pricing: $0.60/1M input, $2.50/1M output
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

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

interface KimiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface KimiToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface KimiTool {
  type: "function";
  function: KimiToolFunction;
}

interface KimiRequestBody {
  model: string;
  messages: KimiChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: KimiTool[];
  tool_choice?: "auto" | "none";
  thinking?: { type: "enabled" | "disabled" };
}

export class KimiProvider implements IAIProvider {
  readonly provider: ModelProvider = "kimi";
  readonly supportedModels: ModelId[] = ["kimi-k2.5"];

  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.KIMI_API_KEY;
      if (!key) {
        throw new AIProviderError(
          "KIMI_API_KEY not configured",
          "kimi",
          "kimi-k2.5",
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

      const messages: KimiChatMessage[] = options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: KimiRequestBody = {
        model: "kimi-k2.5",
        messages,
        temperature: options.temperature ?? 0.7,
        top_p: 0.95,
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

      // Thinking mode: enable for complex tasks (>2000 chars), disable for simple
      const totalLength = messages.reduce(
        (sum, m) => sum + m.content.length,
        0,
      );
      body.thinking = {
        type: totalLength > 2000 ? "enabled" : "disabled",
      };

      const timeoutMs =
        options.maxTokens && options.maxTokens > 8000 ? 60000 : 30000;

      const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          (errorData as Record<string, Record<string, string>>)?.error
            ?.message || `${response.status} ${response.statusText}`;
        console.error("[KimiProvider] API error:", {
          status: response.status,
          error: errorMsg,
          model,
        });
        throw new AIProviderError(
          `Kimi API error: ${errorMsg}`,
          "kimi",
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
        tier: 3,
        provider: "kimi",
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
      if (error instanceof AIProviderError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[KimiProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      throw new AIProviderError(
        `Kimi chat failed: ${errorMessage}`,
        "kimi",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) return false;

      // Lightweight ping — list models
      const response = await fetch(`${KIMI_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
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
