/**
 * OpenAI Chat Provider for Conversation Handler
 *
 * Translates between Anthropic SDK format (used internally) and OpenAI SDK format.
 * This enables the conversation handler to fall back to OpenAI (GPT-4o) when
 * Anthropic is unavailable (billing, rate limits, outages).
 *
 * Tool calling translation:
 * - Anthropic Tool → OpenAI ChatCompletionTool (input_schema → parameters)
 * - OpenAI tool_calls → Anthropic-compatible ToolUseBlock
 */

import OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAIChatOptions {
  apiKey: string;
  model: string; // "gpt-4o" | "gpt-4o-mini"
  systemBlocks: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens: number;
  temperature: number;
}

/** Unified response matching what conversation-handler expects */
export interface UnifiedResponse {
  textContent: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  stopReason: "end_turn" | "tool_use";
}

// ============================================================================
// SCHEMA TRANSLATION
// ============================================================================

/**
 * Convert Anthropic tool definitions to OpenAI function-calling format.
 */
function translateTools(
  anthropicTools: Anthropic.Tool[],
): OpenAI.ChatCompletionTool[] {
  return anthropicTools
    .filter((t) => !("cache_control" in t && !t.name)) // Skip cache-only markers
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.input_schema as Record<string, unknown>,
      },
    }));
}

/**
 * Convert Anthropic message format to OpenAI message format.
 */
function translateMessages(
  systemBlocks: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[],
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  // System blocks → single system message
  const systemText = systemBlocks.map((b) => b.text).join("\n\n");
  if (systemText) {
    result.push({ role: "system", content: systemText });
  }

  // Translate each message
  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Could be tool_result blocks or text blocks
        const toolResults = msg.content.filter(
          (
            b,
          ): b is Anthropic.ToolResultBlockParam & {
            tool_use_id: string;
            content: string;
          } => b.type === "tool_result",
        );
        if (toolResults.length > 0) {
          // Convert tool results to OpenAI tool messages
          for (const tr of toolResults) {
            result.push({
              role: "tool",
              tool_call_id: tr.tool_use_id,
              content:
                typeof tr.content === "string"
                  ? tr.content
                  : JSON.stringify(tr.content),
            });
          }
        } else {
          // Text blocks
          const text = msg.content
            .filter(
              (b): b is Anthropic.TextBlockParam => "text" in b && !!b.text,
            )
            .map((b) => b.text)
            .join("\n");
          if (text) {
            result.push({ role: "user", content: text });
          }
        }
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push({ role: "assistant", content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Could contain text + tool_use blocks
        const textBlocks = msg.content.filter(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        const toolUseBlocks = msg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content:
            textBlocks.length > 0
              ? textBlocks.map((b) => b.text).join("\n")
              : null,
        };

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((tu) => ({
            id: tu.id,
            type: "function" as const,
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input),
            },
          }));
        }

        result.push(assistantMsg);
      }
    }
  }

  return result;
}

// ============================================================================
// MAIN CHAT FUNCTION
// ============================================================================

/**
 * Call OpenAI chat API using Anthropic-compatible inputs.
 * Returns a unified response that the conversation handler can process.
 */
export async function callOpenAIChat(
  opts: OpenAIChatOptions,
): Promise<UnifiedResponse> {
  const client = new OpenAI({ apiKey: opts.apiKey });

  const openaiMessages = translateMessages(opts.systemBlocks, opts.messages);
  const openaiTools = translateTools(opts.tools);

  logger.info("[OpenAIProvider] Calling OpenAI:", {
    model: opts.model,
    messageCount: openaiMessages.length,
    toolCount: openaiTools.length,
    maxTokens: opts.maxTokens,
  });

  const response = await client.chat.completions.create({
    model: opts.model,
    messages: openaiMessages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  });

  const choice = response.choices[0];
  if (!choice) {
    return { textContent: null, toolCalls: [], stopReason: "end_turn" };
  }

  const textContent = choice.message.content || null;
  const toolCalls = (choice.message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
  }));

  return {
    textContent,
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
  };
}

/**
 * Execute a multi-turn tool loop with OpenAI.
 * Mirrors the Anthropic tool loop in conversation-handler.ts.
 */
export async function callOpenAIChatWithTools(
  opts: OpenAIChatOptions,
  executeTool: (
    name: string,
    input: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>,
  tenantId: string,
  onToolStart?: (name: string) => void,
  onToolEnd?: (name: string, durationMs: number) => void,
): Promise<{ text: string; toolsUsed: string[] }> {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const openaiTools = translateTools(opts.tools);
  const toolsUsed: string[] = [];

  let currentMessages = translateMessages(opts.systemBlocks, opts.messages);

  const MAX_ROUNDS = 4; // 1 initial + 3 follow-ups
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: opts.model,
      messages: currentMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const toolCalls = choice.message.tool_calls || [];

    // No tool calls → return text
    if (toolCalls.length === 0 || round === MAX_ROUNDS - 1) {
      return {
        text: choice.message.content || "",
        toolsUsed,
      };
    }

    // Execute tool calls in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const name = tc.function.name;
        const input = JSON.parse(tc.function.arguments || "{}");
        onToolStart?.(name);
        const start = Date.now();
        const result = await executeTool(name, input, tenantId);
        onToolEnd?.(name, Date.now() - start);
        toolsUsed.push(name);
        return { id: tc.id, result };
      }),
    );

    // Add assistant message + tool results to conversation
    currentMessages = [
      ...currentMessages,
      choice.message as OpenAI.ChatCompletionMessageParam,
      ...toolResults.map(
        (tr) =>
          ({
            role: "tool" as const,
            tool_call_id: tr.id,
            content: tr.result,
          }) satisfies OpenAI.ChatCompletionToolMessageParam,
      ),
    ];
  }

  // Fallback if loop exhausted
  return { text: "", toolsUsed };
}
