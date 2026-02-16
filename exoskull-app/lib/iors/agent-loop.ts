/**
 * Agentic Execution Loop
 *
 * @deprecated The entire file is superseded by the Claude Agent SDK
 * (`@/lib/agent-sdk/exoskull-agent.ts`). The SDK handles multi-step
 * tool execution, streaming, and timeout management natively.
 * Kept for reference only. Will be removed in a future cleanup.
 *
 * Previously replaced the fixed MAX_TOOL_ROUNDS=3 loop in conversation-handler.ts
 * with a configurable multi-step agent loop.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { logActivities } from "@/lib/activity-log";
import { logger } from "@/lib/logger";
import { extractSSEDirective } from "./tools/dashboard-tools";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentLoopConfig {
  /** Max tool rounds before stopping. Default: 10 (web), 3 (voice) */
  maxSteps: number;
  /** Time budget in ms. Default: 55000 (Vercel safety margin) */
  budgetMs: number;
  /** Max tokens for follow-up responses */
  followUpMaxTokens: number;
}

export interface AgentLoopContext {
  anthropic: Anthropic;
  model: string;
  temperature: number;
  systemBlocks: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  tenantId: string;
  sessionId: string;
  /** Execute a tool by name. Returns result string. */
  executeTool: (
    name: string,
    input: Record<string, unknown>,
    tenantId: string,
  ) => Promise<string>;
  /** Optional SSE/streaming callbacks */
  callback?: {
    onThinkingStep?: (label: string, status: "running" | "done") => void;
    onToolStart?: (name: string) => void;
    onToolEnd?: (
      name: string,
      durationMs: number,
      meta?: { success?: boolean; resultSummary?: string },
    ) => void;
    /** Emit a custom SSE event (e.g. cockpit_update from dashboard tools) */
    onCustomEvent?: (event: { type: string; [key: string]: unknown }) => void;
  };
}

export interface AgentLoopResult {
  /** Final text response */
  text: string;
  /** All tools used across all rounds */
  toolsUsed: string[];
  /** Whether we hit the budget limit */
  budgetExhausted: boolean;
  /** Total rounds executed */
  roundsExecuted: number;
  /** Whether the response was serialized to async queue */
  serializedToAsync: boolean;
}

/** Serializable agent state for async queue continuation */
export interface AgentState {
  messages: Anthropic.MessageParam[];
  toolsUsed: string[];
  roundsExecuted: number;
  startedAt: number;
}

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

export const WEB_AGENT_CONFIG: AgentLoopConfig = {
  maxSteps: 5,
  budgetMs: 45_000, // 45s — Vercel 60s with 15s safety margin
  followUpMaxTokens: 1024,
};

export const VOICE_AGENT_CONFIG: AgentLoopConfig = {
  maxSteps: 3,
  budgetMs: 30_000, // 30s — voice needs fast response
  followUpMaxTokens: 512,
};

export const ASYNC_AGENT_CONFIG: AgentLoopConfig = {
  maxSteps: 15,
  budgetMs: 50_000, // 50s — async worker has 55s lock
  followUpMaxTokens: 2048,
};

// ============================================================================
// AGENT EXECUTION LOOP
// ============================================================================

/**
 * Run the agentic execution loop.
 *
 * Takes the initial Claude response and continues executing tools
 * until either:
 * - Claude responds with text only (no tool_use)
 * - maxSteps reached
 * - budgetMs exceeded
 *
 * @param initialResponse - First Claude API response (may contain tool_use)
 * @param messages - Current message array (including user message)
 * @param config - Loop configuration (maxSteps, budgetMs, followUpMaxTokens)
 * @param ctx - Execution context (anthropic client, model, tools, etc.)
 */
export async function runAgentLoop(
  initialResponse: Anthropic.Message,
  messages: Anthropic.MessageParam[],
  config: AgentLoopConfig,
  ctx: AgentLoopContext,
): Promise<AgentLoopResult> {
  const startTime = performance.now();
  const toolsUsed: string[] = [];
  let currentMessages = [...messages];
  let roundsExecuted = 0;

  // Check if initial response has tool use
  const initialToolBlocks = initialResponse.content.filter(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
  );

  if (initialToolBlocks.length === 0) {
    // No tools — extract text and return immediately
    const text = extractText(initialResponse);
    return {
      text: text || "Przepraszam, nie zrozumiałem.",
      toolsUsed: [],
      budgetExhausted: false,
      roundsExecuted: 0,
      serializedToAsync: false,
    };
  }

  // Execute first round of tools
  ctx.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

  const firstToolResults = await executeToolBlocks(
    initialToolBlocks,
    toolsUsed,
    ctx,
  );
  roundsExecuted = 1;

  // Build messages with first tool results
  currentMessages = [
    ...currentMessages,
    { role: "assistant" as const, content: initialResponse.content },
    { role: "user" as const, content: firstToolResults },
  ];

  // Multi-round loop
  for (let round = 1; round < config.maxSteps; round++) {
    // Budget check — if we're running low, stop gracefully
    const elapsed = performance.now() - startTime;
    const remaining = config.budgetMs - elapsed;

    if (remaining < 8_000) {
      // Less than 8s left — not enough for another Claude call + tool execution
      logger.info("[AgentLoop] Budget nearly exhausted, stopping:", {
        elapsed: Math.round(elapsed),
        budgetMs: config.budgetMs,
        remaining: Math.round(remaining),
        roundsExecuted,
        tenantId: ctx.tenantId,
      });

      // Check if we should serialize to async queue
      if (remaining < 5_000 && round < config.maxSteps - 1) {
        return {
          text: buildBudgetExhaustedText(toolsUsed),
          toolsUsed,
          budgetExhausted: true,
          roundsExecuted,
          serializedToAsync: false, // Caller handles serialization
        };
      }

      break;
    }

    // Call Claude for next round
    const followUp = await ctx.anthropic.messages.create({
      model: ctx.model,
      max_tokens: config.followUpMaxTokens,
      temperature: ctx.temperature,
      system: ctx.systemBlocks,
      messages: currentMessages,
      tools: ctx.tools,
    });

    roundsExecuted = round + 1;

    const newToolBlocks = followUp.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );

    // No more tool calls — this is the final response
    if (newToolBlocks.length === 0) {
      const text = extractText(followUp);
      return {
        text: text || buildFallbackText(toolsUsed),
        toolsUsed,
        budgetExhausted: false,
        roundsExecuted,
        serializedToAsync: false,
      };
    }

    // Execute tools and continue
    const newResults = await executeToolBlocks(newToolBlocks, toolsUsed, ctx);

    currentMessages = [
      ...currentMessages,
      { role: "assistant" as const, content: followUp.content },
      { role: "user" as const, content: newResults },
    ];

    logger.info("[AgentLoop] Completed round:", {
      round: round + 1,
      maxSteps: config.maxSteps,
      tools: newToolBlocks.map((t) => t.name),
      elapsed: Math.round(performance.now() - startTime),
      tenantId: ctx.tenantId,
    });
  }

  // Max rounds reached — make one final call WITHOUT tools to get text summary
  try {
    const finalCall = await ctx.anthropic.messages.create({
      model: ctx.model,
      max_tokens: config.followUpMaxTokens,
      temperature: ctx.temperature,
      system: ctx.systemBlocks,
      messages: currentMessages,
      // No tools — force text response
    });

    const text = extractText(finalCall);
    return {
      text: text || buildFallbackText(toolsUsed),
      toolsUsed,
      budgetExhausted: false,
      roundsExecuted,
      serializedToAsync: false,
    };
  } catch (error) {
    console.error("[AgentLoop] Final summary call failed:", {
      error: error instanceof Error ? error.message : error,
      tenantId: ctx.tenantId,
    });

    return {
      text: buildFallbackText(toolsUsed),
      toolsUsed,
      budgetExhausted: false,
      roundsExecuted,
      serializedToAsync: false,
    };
  }
}

// ============================================================================
// STREAMING AGENT LOOP
// ============================================================================

/**
 * Run the agentic loop with streaming.
 * Used for voice pipeline — streams text deltas in real-time.
 */
export async function runAgentLoopStreaming(
  messages: Anthropic.MessageParam[],
  config: AgentLoopConfig,
  ctx: AgentLoopContext,
  onTextDelta: (delta: string) => void,
): Promise<AgentLoopResult> {
  const startTime = performance.now();
  const toolsUsed: string[] = [];
  let currentMessages = [...messages];
  let roundsExecuted = 0;

  for (let round = 0; round <= config.maxSteps; round++) {
    // Budget check
    const elapsed = performance.now() - startTime;
    if (config.budgetMs - elapsed < 8_000 && round > 0) {
      logger.info("[AgentLoop:Stream] Budget nearly exhausted:", {
        elapsed: Math.round(elapsed),
        budgetMs: config.budgetMs,
        round,
        tenantId: ctx.tenantId,
      });
      break;
    }

    const stream = ctx.anthropic.messages.stream({
      model: ctx.model,
      max_tokens: config.followUpMaxTokens,
      temperature: ctx.temperature,
      system: ctx.systemBlocks,
      messages: currentMessages,
      tools: ctx.tools,
    });

    let streamedText = "";
    stream.on("text", (delta) => {
      streamedText += delta;
      onTextDelta(delta);
    });

    const finalMessage = await stream.finalMessage();

    const toolUseBlocks = finalMessage.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      // No tools — text was streamed, done
      ctx.callback?.onThinkingStep?.("Generuję odpowiedź", "done");
      return {
        text: streamedText.trim() || "Przepraszam, nie zrozumiałem.",
        toolsUsed,
        budgetExhausted: false,
        roundsExecuted: round,
        serializedToAsync: false,
      };
    }

    // Tool use detected — execute
    ctx.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

    const toolResults = await executeToolBlocks(toolUseBlocks, toolsUsed, ctx);
    roundsExecuted = round + 1;

    currentMessages = [
      ...currentMessages,
      { role: "assistant" as const, content: finalMessage.content },
      { role: "user" as const, content: toolResults },
    ];

    logger.info("[AgentLoop:Stream] Tool round:", {
      round,
      tools: toolUseBlocks.map((t) => t.name),
      tenantId: ctx.tenantId,
    });
  }

  // Max rounds exceeded
  const fallbackText =
    toolsUsed.length > 0
      ? `Gotowe. Użyłem: ${toolsUsed.join(", ")}.`
      : "Przepraszam, nie mogłem przetworzyć tej wiadomości.";

  return {
    text: fallbackText,
    toolsUsed,
    budgetExhausted: true,
    roundsExecuted,
    serializedToAsync: false,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Execute a batch of tool_use blocks in parallel.
 * Fires callbacks, logs activities, returns Anthropic tool_result params.
 */
async function executeToolBlocks(
  toolBlocks: Anthropic.ToolUseBlock[],
  toolsUsed: string[],
  ctx: AgentLoopContext,
): Promise<Anthropic.ToolResultBlockParam[]> {
  const executions = await Promise.all(
    toolBlocks.map(async (toolUse) => {
      ctx.callback?.onToolStart?.(toolUse.name);
      const toolStart = Date.now();

      let result = await ctx.executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        ctx.tenantId,
      );

      // Extract embedded SSE directives (e.g. cockpit_update from dashboard tools)
      if (typeof result === "string" && result.startsWith("__SSE__")) {
        const { sseEvent, cleanResult } = extractSSEDirective(result);
        if (sseEvent) {
          ctx.callback?.onCustomEvent?.(sseEvent);
        }
        result = cleanResult;
      }

      toolsUsed.push(toolUse.name);

      const toolDuration = Date.now() - toolStart;
      const isError =
        typeof result === "string" &&
        (result.startsWith("Error:") || result.startsWith("Blad:"));

      ctx.callback?.onToolEnd?.(toolUse.name, toolDuration, {
        success: !isError,
        resultSummary:
          typeof result === "string" ? result.slice(0, 120) : undefined,
      });

      return {
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: result,
      };
    }),
  );

  // Log tool activities (fire-and-forget)
  logActivities(
    toolBlocks.map((toolUse) => ({
      tenantId: ctx.tenantId,
      actionType: "tool_call" as const,
      actionName: toolUse.name,
      description: `Narzedzie: ${toolUse.name}`,
      source: "conversation",
      metadata: {
        toolInput: Object.keys(toolUse.input as Record<string, unknown>),
      },
    })),
  );

  return executions;
}

/** Extract text from a Claude response */
function extractText(response: Anthropic.Message): string | null {
  const textBlock = response.content.find(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  return textBlock?.text?.trim() || null;
}

/** Build fallback text when tools were used but no text was generated */
function buildFallbackText(toolsUsed: string[]): string {
  if (toolsUsed.length > 0) {
    return `Gotowe. Użyłem: ${toolsUsed.join(", ")}.`;
  }
  return "Przepraszam, nie mogłem przetworzyć tej wiadomości. Spróbuj ponownie.";
}

/** Build text when budget is exhausted mid-execution */
function buildBudgetExhaustedText(toolsUsed: string[]): string {
  if (toolsUsed.length > 0) {
    return `Pracuję nad tym — dotychczas użyłem: ${toolsUsed.join(", ")}. Kontynuuję w tle.`;
  }
  return "Zadanie wymaga więcej czasu. Kontynuuję w tle.";
}

/**
 * Serialize agent state for async queue continuation.
 * Used when budget is exhausted and we need to continue later.
 */
export function serializeAgentState(
  messages: Anthropic.MessageParam[],
  toolsUsed: string[],
  roundsExecuted: number,
): AgentState {
  return {
    messages,
    toolsUsed,
    roundsExecuted,
    startedAt: Date.now(),
  };
}
