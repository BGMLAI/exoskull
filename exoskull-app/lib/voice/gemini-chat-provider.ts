/**
 * Gemini Chat Provider for Conversation Handler
 *
 * Translates between Anthropic SDK format (used internally) and Gemini SDK format.
 * This enables the conversation handler to use Gemini 3 Flash as primary model
 * for web chat, with Anthropic as fallback.
 *
 * Tool calling translation:
 * - Anthropic Tool → Gemini FunctionDeclaration (input_schema → parameters)
 * - Gemini functionCall → tool execution → functionResponse back to Gemini
 *
 * Pattern mirrors openai-chat-provider.ts.
 */

import { GoogleGenAI, Type } from "@google/genai";
import type Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiChatOptions {
  model?: string; // Default: "gemini-3-flash"
  systemBlocks: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens: number;
  temperature: number;
}

// ============================================================================
// SCHEMA TRANSLATION
// ============================================================================

/**
 * Convert Anthropic tool definitions to Gemini FunctionDeclaration format.
 * Anthropic input_schema is standard JSON Schema — Gemini accepts the same format.
 */
function translateTools(anthropicTools: Anthropic.Tool[]): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return anthropicTools
    .filter((t) => !!t.name) // Skip cache-only markers
    .map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      parameters: (tool.input_schema || {}) as Record<string, unknown>,
    }));
}

/**
 * Convert Anthropic message format to Gemini Content format.
 * Returns { systemInstruction, contents } for the Gemini API.
 */
function translateMessages(
  systemBlocks: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[],
): {
  systemInstruction: string;
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
} {
  // System blocks → single systemInstruction string
  const systemInstruction = systemBlocks.map((b) => b.text).join("\n\n");

  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
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
          // Convert tool results to Gemini functionResponse parts
          const parts = toolResults.map((tr) => ({
            functionResponse: {
              name: tr.tool_use_id, // Will be replaced with actual name in the loop
              response: {
                result:
                  typeof tr.content === "string"
                    ? tr.content
                    : JSON.stringify(tr.content),
              },
            },
          }));
          contents.push({ role: "user", parts });
        } else {
          // Text blocks
          const text = msg.content
            .filter(
              (b): b is Anthropic.TextBlockParam =>
                "text" in b && !!(b as any).text,
            )
            .map((b) => (b as any).text)
            .join("\n");
          if (text) {
            contents.push({ role: "user", parts: [{ text }] });
          }
        }
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        contents.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      } else if (Array.isArray(msg.content)) {
        const parts: Array<Record<string, unknown>> = [];

        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: (block as Anthropic.TextBlock).text });
          } else if (block.type === "tool_use") {
            const toolUse = block as Anthropic.ToolUseBlock;
            parts.push({
              functionCall: {
                name: toolUse.name,
                args: toolUse.input,
              },
            });
          }
        }

        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
      }
    }
  }

  return { systemInstruction, contents };
}

// ============================================================================
// MAIN CHAT FUNCTION WITH TOOL LOOP
// ============================================================================

/**
 * Execute a multi-turn tool loop with Gemini.
 * Mirrors the Anthropic agent loop with budget tracking + SSE callbacks.
 */
export async function callGeminiChatWithTools(
  opts: GeminiChatOptions,
  executeTool: (
    name: string,
    input: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>,
  tenantId: string,
  onToolStart?: (name: string) => void,
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void,
): Promise<{ text: string; toolsUsed: string[] }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("[GeminiChatProvider] GOOGLE_AI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = opts.model || "gemini-3-flash-preview";
  const geminiTools = translateTools(opts.tools);
  const { systemInstruction, contents } = translateMessages(
    opts.systemBlocks,
    opts.messages,
  );
  const toolsUsed: string[] = [];

  // Build current contents array (will grow with tool results)
  let currentContents = [...contents];

  const MAX_ROUNDS = 5;
  const BUDGET_MS = 45_000; // Same as WEB_AGENT_CONFIG
  const startTime = Date.now();

  logger.info("[GeminiChatProvider] Starting tool loop:", {
    model: modelName,
    messageCount: currentContents.length,
    toolCount: geminiTools.length,
    maxTokens: opts.maxTokens,
    tenantId,
  });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Budget check
    const elapsed = Date.now() - startTime;
    if (BUDGET_MS - elapsed < 8_000 && round > 0) {
      logger.info("[GeminiChatProvider] Budget nearly exhausted:", {
        elapsed,
        round,
        tenantId,
      });
      break;
    }

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: currentContents as any,
        config: {
          systemInstruction,
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
          tools: [{ functionDeclarations: geminiTools as any }],
        },
      });

      // Check for function calls
      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        // No function calls — return text response
        const text = response.text || "";
        logger.info("[GeminiChatProvider] Response (no tools):", {
          round,
          textLength: text.length,
          toolsUsed,
          tenantId,
          durationMs: Date.now() - startTime,
        });
        return { text, toolsUsed };
      }

      // Execute function calls in parallel
      const modelParts: Array<Record<string, unknown>> = [];
      const responseParts: Array<Record<string, unknown>> = [];

      // First, add the model's response (including function calls) to conversation
      if (response.candidates?.[0]?.content) {
        currentContents.push(response.candidates[0].content as any);
      }

      const toolExecutions = await Promise.all(
        functionCalls.map(async (fc) => {
          const name = fc.name || "unknown";
          const input = (fc.args || {}) as Record<string, unknown>;

          onToolStart?.(name);
          const toolStart = Date.now();

          const result = await executeTool(name, input, tenantId);

          const toolDuration = Date.now() - toolStart;
          const isError =
            typeof result === "string" &&
            (result.startsWith("Error:") || result.startsWith("Blad:"));

          onToolEnd?.(name, toolDuration, {
            success: !isError,
            resultSummary: result.slice(0, 120),
          });

          toolsUsed.push(name);

          return { name, result };
        }),
      );

      // Build functionResponse parts
      for (const exec of toolExecutions) {
        responseParts.push({
          functionResponse: {
            name: exec.name,
            response: { result: exec.result },
          },
        });
      }

      // Add function responses as user turn
      currentContents.push({
        role: "user",
        parts: responseParts,
      } as any);

      logger.info("[GeminiChatProvider] Tool round:", {
        round,
        tools: toolExecutions.map((e) => e.name),
        elapsed: Date.now() - startTime,
        tenantId,
      });
    } catch (error) {
      const err = error as Error;
      logger.error("[GeminiChatProvider] API error:", {
        round,
        error: err.message,
        tenantId,
        stack: err.stack?.split("\n").slice(0, 3).join("\n"),
      });
      throw error;
    }
  }

  // Max rounds reached — make final call without tools to get text
  try {
    const finalResponse = await ai.models.generateContent({
      model: modelName,
      contents: currentContents as any,
      config: {
        systemInstruction,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        // No tools — force text response
      },
    });

    const text = finalResponse.text || "";
    return { text, toolsUsed };
  } catch (finalError) {
    logger.error("[GeminiChatProvider] Final summary call failed:", {
      error: finalError instanceof Error ? finalError.message : finalError,
      tenantId,
    });

    if (toolsUsed.length > 0) {
      return {
        text: `Gotowe. Użyłem: ${toolsUsed.join(", ")}.`,
        toolsUsed,
      };
    }
    throw finalError;
  }
}
