/**
 * Anthropic Provider - Tier 2 (Haiku fallback) & Tier 3 (Sonnet fallback) & Tier 4 (Opus)
 *
 * Claude 3.5 Haiku: Pattern detection, summarization (Tier 2 fallback)
 * Claude Sonnet 4.5: Universal fallback, code generation (Tier 3)
 * Claude Opus 4.6: Strategy, crisis, meta-coordination (Tier 4 primary)
 * Claude Opus 4.5: Legacy Tier 4
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  IAIProvider,
  ModelProvider,
  ModelId,
  AIRequestOptions,
  AIResponse,
  AIToolCall,
  AIProviderError,
} from "../types";
import { calculateCost, getModelConfig } from "../config";

// Map our model IDs to Anthropic's model names
const MODEL_MAP: Record<string, string> = {
  "claude-3-5-haiku": "claude-3-5-haiku-20241022",
  "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
  "claude-opus-4-5": "claude-opus-4-5-20251101",
  "claude-opus-4-6": "claude-opus-4-6-20260201",
};

export class AnthropicProvider implements IAIProvider {
  readonly provider: ModelProvider = "anthropic";
  readonly supportedModels: ModelId[] = [
    "claude-3-5-haiku",
    "claude-sonnet-4-5",
    "claude-opus-4-5",
    "claude-opus-4-6",
  ];

  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AIProviderError(
          "ANTHROPIC_API_KEY not configured",
          "anthropic",
          "claude-3-5-haiku",
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async chat(options: AIRequestOptions, model: ModelId): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const client = this.getClient();
      const anthropicModel = MODEL_MAP[model];

      if (!anthropicModel) {
        throw new AIProviderError(
          `Unknown model: ${model}`,
          "anthropic",
          model,
        );
      }

      // Extract system message
      const systemMessage = options.messages.find(
        (m) => m.role === "system",
      )?.content;

      // Convert messages (exclude system)
      const messages = options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Build tools if provided
      const tools = options.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool["input_schema"],
      }));

      const config = getModelConfig(model);

      const response = await client.messages.create({
        model: anthropicModel,
        max_tokens: options.maxTokens ?? config.maxTokens,
        system: systemMessage,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
      });

      const latencyMs = Date.now() - startTime;

      // Extract text content
      const textBlock = response.content.find((c) => c.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";

      // Extract tool uses
      const toolUseBlocks = response.content.filter(
        (c) => c.type === "tool_use",
      );
      const toolCalls: AIToolCall[] = toolUseBlocks
        .map((block) => {
          if (block.type === "tool_use") {
            return {
              name: block.name,
              arguments: block.input as Record<string, unknown>,
            };
          }
          return { name: "", arguments: {} };
        })
        .filter((t) => t.name);

      const tier =
        model === "claude-opus-4-6" || model === "claude-opus-4-5"
          ? 4
          : model === "claude-sonnet-4-5"
            ? 3
            : 2;

      return {
        content,
        model,
        tier,
        provider: "anthropic",
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
          estimatedCost: calculateCost(
            response.usage.input_tokens,
            response.usage.output_tokens,
            model,
          ),
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        latencyMs,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[AnthropicProvider] Chat failed:", {
        error: errorMessage,
        model,
        tenantId: options.tenantId,
      });

      // Check for specific error types
      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(
          `Anthropic API error: ${error.message}`,
          "anthropic",
          model,
          error.status,
        );
      }

      throw new AIProviderError(
        `Anthropic chat failed: ${errorMessage}`,
        "anthropic",
        model,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      return !!apiKey;
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
