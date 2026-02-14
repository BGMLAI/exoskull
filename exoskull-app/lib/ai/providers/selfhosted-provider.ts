/**
 * Self-Hosted Provider - Tier 0
 *
 * OpenAI-compatible API for self-hosted models (Ollama/vLLM)
 * - Qwen3-30B-A3B (Q4) — primary, complex reasoning
 * - Gemma 3 4B — secondary, fast simple tasks
 *
 * Hosted on GPU cloud (Vast.ai RTX 3060 12GB, ~$0.05/h ≈ $37/mo)
 * Fallback: Gemini Flash when self-hosted unavailable
 *
 * Cost: $0 per token (fixed monthly GPU rental)
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

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OpenAITool {
  type: "function";
  function: OpenAIToolFunction;
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none";
  stream?: boolean;
}

// Map our model IDs to actual model names on the server
const SELFHOSTED_MODEL_MAP: Record<string, string> = {
  "selfhosted-qwen3-30b": "qwen3-30b-a3b",
  "selfhosted-gemma-4b": "gemma3:4b",
};

export class SelfHostedProvider implements IAIProvider {
  readonly provider: ModelProvider = "selfhosted";
  readonly supportedModels: ModelId[] = [
    "selfhosted-qwen3-30b" as ModelId,
    "selfhosted-gemma-4b" as ModelId,
  ];

  private baseUrl: string | null = null;
  private apiKey: string | null = null;
  private lastHealthCheck: { available: boolean; timestamp: number } | null =
    null;

  private getBaseUrl(): string {
    if (!this.baseUrl) {
      const url = process.env.SELFHOSTED_API_URL;
      if (!url) {
        throw new AIProviderError(
          "SELFHOSTED_API_URL not configured",
          "selfhosted",
          "selfhosted-qwen3-30b" as ModelId,
        );
      }
      // Remove trailing slash
      this.baseUrl = url.replace(/\/+$/, "");
    }
    return this.baseUrl;
  }

  private getApiKey(): string {
    if (!this.apiKey) {
      this.apiKey = process.env.SELFHOSTED_API_KEY || "";
    }
    return this.apiKey;
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const baseUrl = this.getBaseUrl();
      const apiKey = this.getApiKey();
      const serverModel = SELFHOSTED_MODEL_MAP[model] || model;

      const messages: OpenAIChatMessage[] = options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const body: OpenAIRequestBody = {
        model: serverModel,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
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

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      // Longer timeout for self-hosted (can be slower than cloud)
      const timeoutMs = 120_000; // 2 minutes

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          (errorData as Record<string, Record<string, string>>)?.error
            ?.message || `${response.status} ${response.statusText}`;
        console.error("[SelfHostedProvider] API error:", {
          status: response.status,
          error: errorMsg,
          model,
          baseUrl,
        });
        throw new AIProviderError(
          `Self-hosted API error: ${errorMsg}`,
          "selfhosted",
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
        tier: 0 as any, // Tier 0 — self-hosted
        provider: "selfhosted",
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: 0, // Self-hosted = $0 per token
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
      console.error("[SelfHostedProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      throw new AIProviderError(
        `Self-hosted chat failed: ${errorMessage}`,
        "selfhosted",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    // Cache health check for 30 seconds
    if (
      this.lastHealthCheck &&
      Date.now() - this.lastHealthCheck.timestamp < 30_000
    ) {
      return this.lastHealthCheck.available;
    }

    try {
      const baseUrl = process.env.SELFHOSTED_API_URL;
      if (!baseUrl) return false;

      const apiKey = process.env.SELFHOSTED_API_KEY;
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      // Try /v1/models endpoint (standard OpenAI-compatible)
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      const available = response.ok;
      this.lastHealthCheck = { available, timestamp: Date.now() };
      return available;
    } catch {
      this.lastHealthCheck = { available: false, timestamp: Date.now() };
      return false;
    }
  }

  estimateCost(
    _inputTokens: number,
    _outputTokens: number,
    _model: ModelId,
  ): number {
    return 0; // Self-hosted = fixed monthly cost, $0 per token
  }
}
