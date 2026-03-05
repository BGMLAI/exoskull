/**
 * ExoSkull v3 Agent — Direct Anthropic API orchestrator
 *
 * Simplified from v1 (995 LOC → ~300 LOC):
 * - Removed: BGML, planner, emotion system, VPS fallback, app detection, personality
 * - Kept: Anthropic API, tool loop, streaming, dynamic context, memory search
 * - Added: v3 mission prompt, organism knowledge injection
 *
 * Architecture:
 *   User Message → buildV3DynamicContext → buildV3SystemPrompt
 *     → Anthropic Messages API (streaming) → tool loop → IORS tools
 *     → final text response
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildV3SystemPrompt } from "./mission-prompt";
import { buildV3DynamicContext } from "./dynamic-context";
import { V3_TOOLS, type V3ToolDefinition } from "./tools";
import { getThreadContext } from "@/lib/unified-thread";
import { unifiedSearch } from "@/lib/memory/unified-search";
import type { UnifiedSearchResult } from "@/lib/memory/types";
import { withRetry } from "@/lib/utils/fetch-retry";
import { logger } from "@/lib/logger";
import { classifyQuery, handleSimpleQuery } from "./gemini-router";

// ============================================================================
// TYPES
// ============================================================================

export type AgentChannel =
  | "web_chat"
  | "voice"
  | "sms"
  | "telegram"
  | "email"
  | "autonomous";

export interface V3AgentRequest {
  tenantId: string;
  sessionId: string;
  userMessage: string;
  channel: AgentChannel;
  /** Autonomous mode — no user interaction, heartbeat-driven */
  mode?: "interactive" | "autonomous";
  /** Token streaming callback (for SSE) */
  onTextDelta?: (delta: string) => void;
  /** Tool execution start callback */
  onToolStart?: (name: string) => void;
  /** Tool execution end callback */
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  /** Thinking step callback */
  onThinkingStep?: (step: string, status: "running" | "done") => void;
  /** Gateway already wrote user message to thread */
  skipThreadAppend?: boolean;
  /** Max tokens for response */
  maxTokens?: number;
  /** Timeout in ms */
  timeoutMs?: number;
}

export interface V3AgentResponse {
  text: string;
  toolsUsed: string[];
  costUsd?: number;
  numTurns?: number;
  durationMs?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEB_SONNET_CONFIG = {
  maxTurns: 5,
  timeoutMs: 55_000,
  model: "claude-sonnet-4-6" as const,
};
const WEB_HAIKU_CONFIG = {
  maxTurns: 4,
  timeoutMs: 30_000,
  model: "claude-haiku-4-5-20251001" as const,
};
const VOICE_CONFIG = {
  maxTurns: 3,
  timeoutMs: 40_000,
  model: "claude-haiku-4-5-20251001" as const,
};
const AUTONOMOUS_CONFIG = {
  maxTurns: 5,
  timeoutMs: 50_000,
  model: "claude-haiku-4-5-20251001" as const,
};

const MAX_TOOL_RESULT_LENGTH = 50_000;

// ============================================================================
// TOOL HELPERS
// ============================================================================

function toAnthropicTools(tools: V3ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description || t.definition.name,
    input_schema: t.definition.input_schema as Anthropic.Tool["input_schema"],
  }));
}

async function executeV3Tool(
  tools: V3ToolDefinition[],
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<{ result: string; isError: boolean }> {
  const toolDef = tools.find((t) => t.definition.name === name);
  if (!toolDef) return { result: `Tool not found: ${name}`, isError: true };

  const timeout = toolDef.timeoutMs ?? 10_000;

  try {
    let result = await Promise.race([
      toolDef.execute(input, tenantId),
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool ${name} timed out after ${timeout}ms`)),
          timeout,
        ),
      ),
    ]);

    if (result.length > MAX_TOOL_RESULT_LENGTH) {
      result =
        result.slice(0, MAX_TOOL_RESULT_LENGTH) +
        `\n\n[Truncated — ${result.length} chars total]`;
    }

    return { result, isError: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[v3:Agent] Tool ${name} failed:`, { error: msg });
    return { result: `Błąd: ${msg}`, isError: true };
  }
}

// ============================================================================
// GEMINI AGENT FALLBACK (with tool calling)
// ============================================================================

interface GeminiAgentOpts {
  tenantId: string;
  userMessage: string;
  systemPrompt: string;
  threadHistory: Array<{ role: string; content: string }>;
  tools: V3ToolDefinition[];
  geminiKey: string;
  maxTurns: number;
  onToolStart?: (name: string) => void;
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  onTextDelta?: (delta: string) => void;
}

async function runGeminiAgentFallback(
  opts: GeminiAgentOpts,
): Promise<{ text: string; toolsUsed: string[]; turns: number }> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: opts.geminiKey });

  // Convert tools to Gemini function declarations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const functionDeclarations: any[] = opts.tools.map((t) => {
    const schema = t.definition.input_schema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    return {
      name: t.definition.name,
      description: t.definition.description || t.definition.name,
      parameters: {
        type: "OBJECT",
        properties: schema.properties || {},
        required: schema.required || [],
      },
    };
  });

  // Build Gemini message history
  const contents: Array<{
    role: "user" | "model";
    parts: Array<Record<string, unknown>>;
  }> = [];
  for (const msg of opts.threadHistory.slice(-10)) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: typeof msg.content === "string" ? msg.content : "" }],
    });
  }
  // Add current message
  const lastMsg = contents[contents.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    contents.push({ role: "user", parts: [{ text: opts.userMessage }] });
  }

  const toolsUsed: string[] = [];
  let finalText = "";
  let turns = 0;

  while (turns < opts.maxTurns) {
    turns++;

    // Retry up to 3 times on 429 rate limit
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          const delay = (attempt + 1) * 5000; // 10s, 15s
          logger.info(`[v3:Gemini] Retry ${attempt}/2 after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
        result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: opts.systemPrompt.slice(0, 8000),
            tools: [{ functionDeclarations }],
            maxOutputTokens: 8192,
          },
        });
        break; // success
      } catch (err) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        if (msg.includes("429") && attempt < 2) continue;
        throw err; // non-retryable or final attempt
      }
    }
    if (!result) throw new Error("Gemini: all retries exhausted");

    const candidate = result.candidates?.[0];
    if (!candidate?.content?.parts) {
      finalText = result.text || "Brak odpowiedzi od Gemini.";
      break;
    }

    const parts = candidate.content.parts;
    const textParts: string[] = [];
    const functionCalls: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];

    for (const part of parts) {
      if ("text" in part && part.text) textParts.push(part.text as string);
      if ("functionCall" in part && part.functionCall) {
        const fc = part.functionCall as {
          name: string;
          args: Record<string, unknown>;
        };
        functionCalls.push({ name: fc.name, args: fc.args || {} });
      }
    }

    // No function calls → done
    if (functionCalls.length === 0) {
      finalText = textParts.join("");
      if (opts.onTextDelta && finalText) {
        const chunkSize = 50;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          opts.onTextDelta(finalText.slice(i, i + chunkSize));
        }
      }
      break;
    }

    // Add assistant response to history
    contents.push({
      role: "model",
      parts: candidate.content.parts as Array<Record<string, unknown>>,
    });

    // Execute tools
    const functionResponses: Array<Record<string, unknown>> = [];
    for (const fc of functionCalls) {
      if (!toolsUsed.includes(fc.name)) toolsUsed.push(fc.name);
      opts.onToolStart?.(fc.name);
      const toolStartMs = Date.now();

      const { result: toolResult, isError } = await executeV3Tool(
        opts.tools,
        fc.name,
        fc.args,
        opts.tenantId,
      );

      const durationMs = Date.now() - toolStartMs;
      logger.info(
        `[v3:Gemini] Tool ${fc.name}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
      );
      opts.onToolEnd?.(fc.name, durationMs, {
        success: !isError,
        resultSummary: toolResult.slice(0, 200),
      });

      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: { result: toolResult },
        },
      });
    }

    // Add tool results to history
    contents.push({ role: "user", parts: functionResponses });
  }

  if (!finalText && turns >= opts.maxTurns) {
    finalText = "Osiągnięto limit interakcji Gemini. Spróbuj ponownie.";
  }

  return { text: finalText, toolsUsed, turns };
}

// ============================================================================
// GROQ AGENT FALLBACK (Llama 3.3 70B with OpenAI-compatible tool calling)
// ============================================================================

interface GroqAgentOpts {
  tenantId: string;
  userMessage: string;
  systemPrompt: string;
  threadHistory: Array<{ role: string; content: string }>;
  tools: V3ToolDefinition[];
  groqKey: string;
  maxTurns: number;
  onToolStart?: (name: string) => void;
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  onTextDelta?: (delta: string) => void;
}

async function runGroqAgentFallback(
  opts: GroqAgentOpts,
): Promise<{ text: string; toolsUsed: string[]; turns: number }> {
  // Convert tools to OpenAI function format
  const openaiTools = opts.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: t.definition.description || t.definition.name,
      parameters: t.definition.input_schema,
    },
  }));

  // Build message history (OpenAI format)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: opts.systemPrompt.slice(0, 8000) },
  ];
  for (const msg of opts.threadHistory.slice(-10)) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
    });
  }
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    messages.push({ role: "user", content: opts.userMessage });
  }

  const toolsUsed: string[] = [];
  let finalText = "";
  let turns = 0;

  while (turns < opts.maxTurns) {
    turns++;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          tools: openaiTools,
          tool_choice: "auto",
          max_tokens: 4096,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Groq: no choice in response");

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls;

    // No tool calls → done
    if (!toolCalls || toolCalls.length === 0) {
      finalText = assistantMsg.content || "";
      if (opts.onTextDelta && finalText) {
        const chunkSize = 50;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          opts.onTextDelta(finalText.slice(i, i + chunkSize));
        }
      }
      break;
    }

    // Add assistant response to history
    messages.push(assistantMsg);

    // Execute tools
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
      opts.onToolStart?.(toolName);
      const toolStartMs = Date.now();

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      const { result: toolResult, isError } = await executeV3Tool(
        opts.tools,
        toolName,
        args,
        opts.tenantId,
      );

      const durationMs = Date.now() - toolStartMs;
      logger.info(
        `[v3:Groq] Tool ${toolName}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
      );
      opts.onToolEnd?.(toolName, durationMs, {
        success: !isError,
        resultSummary: toolResult.slice(0, 200),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  if (!finalText && turns >= opts.maxTurns) {
    finalText = "Osiągnięto limit interakcji. Spróbuj ponownie.";
  }

  return { text: finalText, toolsUsed, turns };
}

// ============================================================================
// OPENAI AGENT FALLBACK (GPT-4o-mini with tool calling — high quality, cheap)
// ============================================================================

interface OpenAIAgentOpts {
  tenantId: string;
  userMessage: string;
  systemPrompt: string;
  threadHistory: Array<{ role: string; content: string }>;
  tools: V3ToolDefinition[];
  openaiKey: string;
  maxTurns: number;
  onToolStart?: (name: string) => void;
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  onTextDelta?: (delta: string) => void;
}

async function runOpenAIAgentFallback(
  opts: OpenAIAgentOpts,
): Promise<{ text: string; toolsUsed: string[]; turns: number }> {
  const openaiTools = opts.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: t.definition.description || t.definition.name,
      parameters: t.definition.input_schema,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: opts.systemPrompt.slice(0, 16000) },
  ];
  for (const msg of opts.threadHistory.slice(-10)) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
    });
  }
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    messages.push({ role: "user", content: opts.userMessage });
  }

  const toolsUsed: string[] = [];
  let finalText = "";
  let turns = 0;

  while (turns < opts.maxTurns) {
    turns++;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("OpenAI: no choice in response");

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      finalText = assistantMsg.content || "";
      if (opts.onTextDelta && finalText) {
        const chunkSize = 50;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          opts.onTextDelta(finalText.slice(i, i + chunkSize));
        }
      }
      break;
    }

    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
      opts.onToolStart?.(toolName);
      const toolStartMs = Date.now();

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      const { result: toolResult, isError } = await executeV3Tool(
        opts.tools,
        toolName,
        args,
        opts.tenantId,
      );

      const durationMs = Date.now() - toolStartMs;
      logger.info(
        `[v3:OpenAI] Tool ${toolName}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
      );
      opts.onToolEnd?.(toolName, durationMs, {
        success: !isError,
        resultSummary: toolResult.slice(0, 200),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  if (!finalText && turns >= opts.maxTurns) {
    finalText = "Osiągnięto limit interakcji. Spróbuj ponownie.";
  }

  return { text: finalText, toolsUsed, turns };
}

// ============================================================================
// DEEPSEEK AGENT FALLBACK (OpenAI-compatible API with tool calling)
// ============================================================================

interface DeepSeekAgentOpts {
  tenantId: string;
  userMessage: string;
  systemPrompt: string;
  threadHistory: Array<{ role: string; content: string }>;
  tools: V3ToolDefinition[];
  deepseekKey: string;
  maxTurns: number;
  onToolStart?: (name: string) => void;
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  onTextDelta?: (delta: string) => void;
}

async function runDeepSeekAgentFallback(
  opts: DeepSeekAgentOpts,
): Promise<{ text: string; toolsUsed: string[]; turns: number }> {
  const dsTools = opts.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: t.definition.description || t.definition.name,
      parameters: t.definition.input_schema,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: opts.systemPrompt.slice(0, 16000) },
  ];
  for (const msg of opts.threadHistory.slice(-10)) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
    });
  }
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user") {
    messages.push({ role: "user", content: opts.userMessage });
  }

  const toolsUsed: string[] = [];
  let finalText = "";
  let turns = 0;

  while (turns < opts.maxTurns) {
    turns++;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.deepseekKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        tools: dsTools,
        tool_choice: "auto",
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("DeepSeek: no choice in response");

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      finalText = assistantMsg.content || "";
      if (opts.onTextDelta && finalText) {
        const chunkSize = 50;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          opts.onTextDelta(finalText.slice(i, i + chunkSize));
        }
      }
      break;
    }

    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
      opts.onToolStart?.(toolName);
      const toolStartMs = Date.now();

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      const { result: toolResult, isError } = await executeV3Tool(
        opts.tools,
        toolName,
        args,
        opts.tenantId,
      );

      const durationMs = Date.now() - toolStartMs;
      logger.info(
        `[v3:DeepSeek] Tool ${toolName}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
      );
      opts.onToolEnd?.(toolName, durationMs, {
        success: !isError,
        resultSummary: toolResult.slice(0, 200),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  if (!finalText && turns >= opts.maxTurns) {
    finalText = "Osiągnięto limit interakcji DeepSeek. Spróbuj ponownie.";
  }

  return { text: finalText, toolsUsed, turns };
}

// ============================================================================
// MAIN AGENT FUNCTION
// ============================================================================

export async function runV3Agent(
  req: V3AgentRequest,
): Promise<V3AgentResponse> {
  const startMs = Date.now();

  // ── Phase 0: 3-tier smart routing ──
  // simple  → Gemini Flash (no tools, ~$0.00)
  // medium  → DeepSeek (with tools, ~$0.002/query)
  // complex → Sonnet (heavy building, ~$0.15/query)
  const complexity =
    req.mode === "autonomous"
      ? ("medium" as const) // autonomous doesn't need Sonnet most of the time
      : req.channel === "voice"
        ? ("medium" as const)
        : classifyQuery(req.userMessage);

  const config =
    complexity === "complex" ? WEB_SONNET_CONFIG : WEB_HAIKU_CONFIG; // Haiku as Claude fallback if DeepSeek fails

  logger.info(
    `[v3:Agent] Routing: ${complexity} → ${complexity === "medium" ? "deepseek" : config.model}`,
    {
      message: req.userMessage.slice(0, 80),
    },
  );

  // Simple queries → Gemini Flash (free, no tools)
  if (complexity === "simple" && req.channel === "web_chat") {
    req.onThinkingStep?.("Szybka odpowiedź", "running");
    const threadHistory = await getThreadContext(req.tenantId, 6);
    const simpleHistory = threadHistory.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : req.userMessage,
    }));
    const geminiResponse = await handleSimpleQuery(
      req.userMessage,
      undefined,
      simpleHistory,
    );
    if (geminiResponse) {
      req.onThinkingStep?.("Szybka odpowiedź", "done");
      if (req.onTextDelta) {
        const chunkSize = 30;
        for (let i = 0; i < geminiResponse.length; i += chunkSize) {
          req.onTextDelta(geminiResponse.slice(i, i + chunkSize));
        }
      }
      return {
        text: geminiResponse,
        toolsUsed: [],
        costUsd: 0,
        numTurns: 0,
        durationMs: Date.now() - startMs,
      };
    }
    // Gemini failed → fall through to DeepSeek
    logger.info(
      "[v3:Agent] Gemini simple routing failed, falling back to DeepSeek",
    );
  }

  // ── ALL queries → DeepSeek primary, Groq fallback (no Anthropic in main path) ──
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  // Load context once, reuse for DeepSeek and Groq
  req.onThinkingStep?.("Ładuję kontekst", "running");
  const needsMemory =
    req.userMessage.length > 30 ||
    /\?|pamięt|remember|historia|wcześniej|wiesz/.test(
      req.userMessage.toLowerCase(),
    );
  const [sharedDynamicCtx, sharedThreadHistory, sharedMemoryResults] =
    await Promise.all([
      buildV3DynamicContext(req.tenantId),
      getThreadContext(req.tenantId, 10),
      needsMemory
        ? unifiedSearch({
            tenantId: req.tenantId,
            query: req.userMessage,
            limit: 5,
            minScore: 0.3,
          }).catch(() => [] as UnifiedSearchResult[])
        : Promise.resolve([] as UnifiedSearchResult[]),
    ]);
  let memCtx = "";
  if (sharedMemoryResults.length > 0) {
    memCtx =
      "\n\n## Relevant Memory\n" +
      sharedMemoryResults
        .map(
          (r, i) =>
            `[${i + 1}] (${r.type || "memory"}, score: ${r.score.toFixed(2)}) ${r.content.slice(0, 300)}`,
        )
        .join("\n");
  }
  const sharedSystemPrompt = buildV3SystemPrompt(
    sharedDynamicCtx.context + memCtx,
  );
  req.onThinkingStep?.("Ładuję kontekst", "done");

  const maxTurnsForQuery = complexity === "complex" ? 5 : 4;

  // ── Try 1: DeepSeek ──
  if (deepseekKey) {
    try {
      req.onThinkingStep?.("Analizuję i odpowiadam", "running");
      const dsResult = await runDeepSeekAgentFallback({
        tenantId: req.tenantId,
        userMessage: req.userMessage,
        systemPrompt: sharedSystemPrompt,
        threadHistory: sharedThreadHistory,
        tools: V3_TOOLS,
        deepseekKey,
        maxTurns: maxTurnsForQuery,
        onToolStart: req.onToolStart,
        onToolEnd: req.onToolEnd,
        onTextDelta: req.onTextDelta,
      });
      req.onThinkingStep?.("Analizuję i odpowiadam", "done");
      const costUsd =
        (dsResult.turns * 5000 * 0.27 + dsResult.text.length * 0.28) /
        1_000_000;
      logger.info("[v3:Agent] DeepSeek primary succeeded", {
        toolsUsed: dsResult.toolsUsed,
        turns: dsResult.turns,
        costUsd: costUsd.toFixed(4),
        durationMs: Date.now() - startMs,
      });
      return {
        text: dsResult.text,
        toolsUsed: dsResult.toolsUsed,
        costUsd,
        numTurns: dsResult.turns,
        durationMs: Date.now() - startMs,
      };
    } catch (dsErr) {
      logger.warn("[v3:Agent] DeepSeek failed, trying Groq", {
        error: dsErr instanceof Error ? dsErr.message : String(dsErr),
      });
    }
  }

  // ── Try 2: Groq (Llama 3.3 70B) ──
  if (groqKey) {
    try {
      req.onThinkingStep?.("Analizuję i odpowiadam (Groq)", "running");
      const groqResult = await runGroqAgentFallback({
        tenantId: req.tenantId,
        userMessage: req.userMessage,
        systemPrompt: sharedSystemPrompt,
        threadHistory: sharedThreadHistory,
        tools: V3_TOOLS,
        groqKey,
        maxTurns: maxTurnsForQuery,
        onToolStart: req.onToolStart,
        onToolEnd: req.onToolEnd,
        onTextDelta: req.onTextDelta,
      });
      req.onThinkingStep?.("Analizuję i odpowiadam (Groq)", "done");
      logger.info("[v3:Agent] Groq fallback succeeded", {
        toolsUsed: groqResult.toolsUsed,
        turns: groqResult.turns,
        durationMs: Date.now() - startMs,
      });
      return {
        text: groqResult.text,
        toolsUsed: groqResult.toolsUsed,
        costUsd: 0,
        numTurns: groqResult.turns,
        durationMs: Date.now() - startMs,
      };
    } catch (groqErr) {
      logger.warn(
        "[v3:Agent] Groq failed, falling back to Anthropic (last resort)",
        {
          error: groqErr instanceof Error ? groqErr.message : String(groqErr),
        },
      );
    }
  }

  // ── Last resort: Anthropic (only if both DeepSeek AND Groq fail) ──
  if (!deepseekKey && !groqKey) {
    logger.warn("[v3:Agent] No DeepSeek/Groq keys, using Anthropic directly");
  }

  // ── Anthropic last-resort path — reuse context already loaded above ──
  const systemPrompt = sharedSystemPrompt;
  const threadHistory = sharedThreadHistory;

  logger.info("[v3:Agent] Using Anthropic last-resort path");
  req.onThinkingStep?.(
    "Analizuję i odpowiadam (Anthropic fallback)",
    "running",
  );

  const abortController = new AbortController();
  const timeout = req.timeoutMs || config.timeoutMs;
  const timeoutHandle = setTimeout(() => abortController.abort(), timeout);

  const toolsUsed: string[] = [];
  let finalText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let numTurns = 0;
  let totalToolErrors = 0;
  let messagesCount = 0;

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
    });
    const anthropicTools = toAnthropicTools(V3_TOOLS);

    // Build message history
    let messages: Anthropic.MessageParam[];
    if (req.skipThreadAppend && threadHistory.length > 0) {
      const last = threadHistory[threadHistory.length - 1];
      messages =
        last.role === "user"
          ? threadHistory
          : [
              ...threadHistory,
              { role: "user" as const, content: req.userMessage },
            ];
    } else {
      messages = [
        ...threadHistory,
        { role: "user" as const, content: req.userMessage },
      ];
    }
    messagesCount = messages.length;

    while (numTurns < config.maxTurns) {
      numTurns++;

      const response = await withRetry(
        async () => {
          const stream = client.messages.stream(
            {
              model: config.model,
              max_tokens: req.maxTokens || 4096,
              system: [
                {
                  type: "text" as const,
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
              messages,
              ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
            },
            { signal: abortController.signal },
          );

          if (req.onTextDelta) {
            stream.on("text", (text) => req.onTextDelta!(text));
          }

          return stream.finalMessage();
        },
        { maxRetries: 2, delayMs: 2000, label: "v3Agent.stream" }, // was 3 retries — less wasted tokens on persistent failures
      );

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Separate text and tool_use blocks
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") textParts.push(block.text);
        else if (block.type === "tool_use") toolUseBlocks.push(block);
      }

      // If no tool calls → done
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        finalText = textParts.join("");
        break;
      }

      // Tool use → execute all in parallel
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const toolName = toolUse.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

          req.onToolStart?.(toolName);
          const toolStartMs = Date.now();

          const { result, isError } = await executeV3Tool(
            V3_TOOLS,
            toolName,
            toolUse.input as Record<string, unknown>,
            req.tenantId,
          );

          if (isError) totalToolErrors++;

          const durationMs = Date.now() - toolStartMs;
          logger.info(
            `[v3:Agent] Tool ${toolName}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
          );
          req.onToolEnd?.(toolName, durationMs, {
            success: !isError,
            resultSummary: result.slice(0, 200),
          });

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
            ...(isError ? { is_error: true as const } : {}),
          };
        }),
      );

      // Stop after 5 tool errors
      if (totalToolErrors >= 5) {
        finalText =
          "Zbyt wiele błędów narzędzi. Spróbuj ponownie lub opisz problem inaczej.";
        break;
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText && numTurns >= config.maxTurns) {
      finalText =
        "Osiągnięto limit interakcji. Spróbuj ponownie z prostszym pytaniem.";
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (abortController.signal.aborted) {
      logger.warn(`[v3:Agent] Timed out after ${timeout}ms`);
      finalText = finalText || "Timeout — spróbuj ponownie.";
    } else {
      logger.error("[v3:Agent] API call failed:", {
        error: errMsg,
        tenantId: req.tenantId,
        numTurns,
        messagesCount,
        toolsUsed,
      });

      // ── Gemini fallback WITH tool calling ──
      const geminiKey =
        process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (geminiKey && !abortController.signal.aborted) {
        try {
          logger.info("[v3:Agent] Falling back to Gemini with tools...");
          const geminiResult = await runGeminiAgentFallback({
            tenantId: req.tenantId,
            userMessage: req.userMessage,
            systemPrompt,
            threadHistory,
            tools: V3_TOOLS,
            geminiKey,
            maxTurns: config.maxTurns,
            onToolStart: req.onToolStart,
            onToolEnd: req.onToolEnd,
            onTextDelta: req.onTextDelta,
          });
          finalText = geminiResult.text;
          toolsUsed.push(...geminiResult.toolsUsed);
          logger.info("[v3:Agent] Gemini fallback succeeded", {
            toolsUsed: geminiResult.toolsUsed,
            turns: geminiResult.turns,
          });
        } catch (geminiErr) {
          logger.error("[v3:Agent] Gemini fallback failed:", {
            error:
              geminiErr instanceof Error
                ? geminiErr.message
                : String(geminiErr),
          });

          // ── Groq fallback (Llama 3.3 70B with tool calling) ──
          const groqKey = process.env.GROQ_API_KEY?.trim();
          if (groqKey && !abortController.signal.aborted) {
            try {
              logger.info("[v3:Agent] Falling back to Groq...");
              const groqResult = await runGroqAgentFallback({
                tenantId: req.tenantId,
                userMessage: req.userMessage,
                systemPrompt,
                threadHistory,
                tools: V3_TOOLS,
                groqKey,
                maxTurns: Math.min(config.maxTurns, 8),
                onToolStart: req.onToolStart,
                onToolEnd: req.onToolEnd,
                onTextDelta: req.onTextDelta,
              });
              finalText = groqResult.text;
              toolsUsed.push(...groqResult.toolsUsed);
              logger.info("[v3:Agent] Groq fallback succeeded", {
                toolsUsed: groqResult.toolsUsed,
                turns: groqResult.turns,
              });
            } catch (groqErr) {
              logger.error("[v3:Agent] Groq fallback failed:", {
                error:
                  groqErr instanceof Error ? groqErr.message : String(groqErr),
              });

              // ── OpenAI fallback (GPT-4o-mini with tool calling) ──
              const openaiKey = process.env.OPENAI_API_KEY?.trim();
              if (openaiKey && !abortController.signal.aborted) {
                try {
                  logger.info(
                    "[v3:Agent] Falling back to OpenAI GPT-4o-mini...",
                  );
                  const openaiResult = await runOpenAIAgentFallback({
                    tenantId: req.tenantId,
                    userMessage: req.userMessage,
                    systemPrompt,
                    threadHistory,
                    tools: V3_TOOLS,
                    openaiKey,
                    maxTurns: Math.min(config.maxTurns, 8),
                    onToolStart: req.onToolStart,
                    onToolEnd: req.onToolEnd,
                    onTextDelta: req.onTextDelta,
                  });
                  finalText = openaiResult.text;
                  toolsUsed.push(...openaiResult.toolsUsed);
                  logger.info("[v3:Agent] OpenAI fallback succeeded", {
                    toolsUsed: openaiResult.toolsUsed,
                    turns: openaiResult.turns,
                  });
                } catch (openaiErr) {
                  logger.error("[v3:Agent] OpenAI fallback failed:", {
                    error:
                      openaiErr instanceof Error
                        ? openaiErr.message
                        : String(openaiErr),
                  });

                  // ── DeepSeek fallback (OpenAI-compatible API) ──
                  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
                  if (deepseekKey && !abortController.signal.aborted) {
                    try {
                      logger.info("[v3:Agent] Falling back to DeepSeek...");
                      const deepseekResult = await runDeepSeekAgentFallback({
                        tenantId: req.tenantId,
                        userMessage: req.userMessage,
                        systemPrompt,
                        threadHistory,
                        tools: V3_TOOLS,
                        deepseekKey,
                        maxTurns: Math.min(config.maxTurns, 8),
                        onToolStart: req.onToolStart,
                        onToolEnd: req.onToolEnd,
                        onTextDelta: req.onTextDelta,
                      });
                      finalText = deepseekResult.text;
                      toolsUsed.push(...deepseekResult.toolsUsed);
                      logger.info("[v3:Agent] DeepSeek fallback succeeded", {
                        toolsUsed: deepseekResult.toolsUsed,
                        turns: deepseekResult.turns,
                      });
                    } catch (deepseekErr) {
                      logger.error("[v3:Agent] DeepSeek fallback failed:", {
                        error:
                          deepseekErr instanceof Error
                            ? deepseekErr.message
                            : String(deepseekErr),
                      });
                      finalText = `Wszystkie modele AI niedostępne (Anthropic: brak kredytów, Gemini: rate limit, Groq: ${groqErr instanceof Error ? groqErr.message.slice(0, 50) : "error"}, OpenAI: ${openaiErr instanceof Error ? openaiErr.message.slice(0, 50) : "error"}, DeepSeek: ${deepseekErr instanceof Error ? deepseekErr.message.slice(0, 50) : "error"}). Spróbuj za kilka minut.`;
                    }
                  } else {
                    finalText = `Wszystkie modele AI niedostępne (Anthropic: brak kredytów, Gemini: rate limit, Groq: ${groqErr instanceof Error ? groqErr.message.slice(0, 50) : "error"}, OpenAI: ${openaiErr instanceof Error ? openaiErr.message.slice(0, 50) : "error"}). Spróbuj za kilka minut.`;
                  }
                }
              } else {
                finalText = `Wszystkie modele AI niedostępne (Anthropic: brak kredytów, Gemini: rate limit, Groq: ${groqErr instanceof Error ? groqErr.message.slice(0, 50) : "error"}). Spróbuj za kilka minut.`;
              }
            }
          } else {
            finalText = `Błąd przetwarzania (Anthropic: ${errMsg.slice(0, 100)}). Spróbuj ponownie za chwilę.`;
          }
        }
      } else {
        finalText = `Błąd przetwarzania (${errMsg.slice(0, 100)}). Brak klucza do fallback.`;
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  req.onThinkingStep?.("Analizuję i odpowiadam", "done");

  // Cost calculation — Haiku: $1/$5, Sonnet: $3/$15 per MTok
  const isHaiku = config.model.includes("haiku");
  const inputRate = isHaiku ? 1.0 : 3.0;
  const outputRate = isHaiku ? 5.0 : 15.0;
  const costUsd =
    (totalInputTokens * inputRate + totalOutputTokens * outputRate) / 1_000_000;
  const durationMs = Date.now() - startMs;

  logger.info("[v3:Agent] Done:", {
    tenantId: req.tenantId,
    channel: req.channel,
    model: config.model,
    complexity,
    toolsUsed,
    numTurns,
    tokens: { input: totalInputTokens, output: totalOutputTokens },
    costUsd: costUsd.toFixed(4),
    durationMs,
  });

  return { text: finalText, toolsUsed, costUsd, numTurns, durationMs };
}
