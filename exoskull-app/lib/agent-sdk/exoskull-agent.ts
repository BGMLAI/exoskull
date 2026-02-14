/**
 * ExoSkull Agent — Claude Agent SDK orchestrator
 *
 * Replaces the manual Anthropic API loop in conversation-handler.ts
 * with the Agent SDK's `query()` function. The SDK handles:
 * - Multi-turn tool execution (agent loop)
 * - Streaming (token-by-token via SDKPartialAssistantMessage)
 * - Tool call visibility (SDKToolProgressMessage, SDKToolUseSummaryMessage)
 * - Session management
 *
 * IORS tools are injected as an in-process MCP server (zero network overhead).
 * The orchestrator model is always Claude (Haiku for voice, Sonnet for web).
 * IORS tools can internally use cheaper models (Gemini, Codex) for execution.
 *
 * Architecture:
 *   User Message → SDK query() → Claude (orchestrator)
 *     ↓ tool calls
 *   IORS MCP Server → 60+ tools → {Gemini, Codex, DB, APIs}
 *     ↓ results
 *   Claude → Final Response → SSE stream to UI
 */

import {
  query,
  type SDKMessage,
  type Options,
  type SDKResultSuccess,
  type SDKResultError,
} from "@anthropic-ai/claude-agent-sdk";

import { createIorsMcpServerWithDynamic } from "./iors-mcp-server";
import { buildDynamicContext } from "@/lib/voice/dynamic-context";
import { STATIC_SYSTEM_PROMPT } from "@/lib/voice/system-prompt";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { logEmotion } from "@/lib/emotion/logger";
import type { EmotionState } from "@/lib/emotion/types";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface AgentRequest {
  tenantId: string;
  sessionId: string;
  userMessage: string;
  channel: "web_chat" | "voice";
  /** Gateway already wrote user message to thread */
  skipThreadAppend?: boolean;
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
  /** System prompt prefix (e.g., IORS birth flow) */
  systemPromptPrefix?: string;
  /** System prompt override from tenant settings */
  systemPromptOverride?: string;
  /** Max tokens for response */
  maxTokens?: number;
  /** Timeout in ms (default: 55000 for web, 40000 for voice) */
  timeoutMs?: number;
}

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  shouldEndCall: boolean;
  emotion?: EmotionState;
  costUsd?: number;
  numTurns?: number;
  durationMs?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEB_CONFIG = {
  maxTurns: 10,
  timeoutMs: 55_000,
  model: "claude-sonnet-4-5-20250929" as const,
  effort: "high" as const,
};

const VOICE_CONFIG = {
  maxTurns: 6,
  timeoutMs: 40_000,
  model: "claude-haiku-4-5-20251001" as const,
  effort: "medium" as const,
};

// ============================================================================
// MAIN AGENT FUNCTION
// ============================================================================

/**
 * Run ExoSkull agent via Claude Agent SDK.
 *
 * Loads context, creates IORS MCP server, runs SDK query,
 * and streams results back to the caller.
 */
export async function runExoSkullAgent(
  req: AgentRequest,
): Promise<AgentResponse> {
  const startMs = Date.now();
  const config = req.channel === "voice" ? VOICE_CONFIG : WEB_CONFIG;

  req.onThinkingStep?.("Ładuję kontekst", "running");

  // ── Phase 1: Load everything in parallel ──
  const [dynamicCtxResult, emotionState, mcpServer] = await Promise.all([
    buildDynamicContext(req.tenantId),
    analyzeEmotion(req.userMessage),
    createIorsMcpServerWithDynamic(req.tenantId),
  ]);

  const contextMs = Date.now() - startMs;
  logger.info(`[ExoSkullAgent] Context loaded in ${contextMs}ms`);
  req.onThinkingStep?.("Ładuję kontekst", "done");

  // ── Phase 2: Emotion / Crisis detection ──
  const crisis = await detectCrisis(req.userMessage, emotionState);
  const adaptive = getAdaptivePrompt(emotionState);

  // Fire-and-forget emotion logging
  logEmotion(req.tenantId, emotionState, req.userMessage, {
    sessionId: req.sessionId,
    crisisFlags: crisis.detected ? crisis.indicators : undefined,
    crisisProtocolTriggered: crisis.detected,
    personalityAdaptedTo: crisis.detected ? "crisis_support" : adaptive.mode,
  }).catch((err) => {
    logger.warn("[ExoSkullAgent] Emotion log failed:", {
      error: err instanceof Error ? err.message : err,
    });
  });

  // Fire-and-forget Tau Matrix classification
  import("@/lib/iors/emotion-matrix")
    .then(({ classifyTauQuadrant, logEmotionSignal }) => {
      const signal = classifyTauQuadrant(emotionState);
      return logEmotionSignal(req.tenantId, signal, req.sessionId);
    })
    .catch(() => {});

  // ── Phase 3: Build system prompt ──
  const dynamicContext = dynamicCtxResult.context;
  const effectiveSystemPrompt =
    req.systemPromptOverride ||
    dynamicCtxResult.systemPromptOverride ||
    STATIC_SYSTEM_PROMPT;

  let systemPrompt: string;
  if (crisis.detected && crisis.protocol) {
    systemPrompt = [crisis.protocol.prompt_override, dynamicContext].join(
      "\n\n",
    );

    // Emergency escalation for severe crises
    if (crisis.severity === "high" || crisis.severity === "critical") {
      import("@/lib/iors/emergency-contact")
        .then(({ escalateToCrisisContact }) =>
          escalateToCrisisContact(req.tenantId, crisis.type!, crisis.severity!),
        )
        .catch((err) => {
          logger.error("[ExoSkullAgent] Emergency escalation failed:", {
            error: err instanceof Error ? err.message : err,
          });
        });
    }
  } else {
    const parts: string[] = [];
    if (req.systemPromptPrefix) parts.push(req.systemPromptPrefix);
    parts.push(effectiveSystemPrompt);
    parts.push(dynamicContext);
    if (adaptive.mode !== "neutral") parts.push(adaptive.instruction);
    systemPrompt = parts.join("\n\n");
  }

  // ── Phase 4: Run Agent SDK query ──
  req.onThinkingStep?.("Generuję odpowiedź", "running");

  const abortController = new AbortController();
  const timeout = req.timeoutMs || config.timeoutMs;
  const timeoutHandle = setTimeout(() => abortController.abort(), timeout);

  const toolsUsed: string[] = [];
  const toolStartTimes = new Map<string, number>();
  let finalText = "";
  let costUsd = 0;
  let numTurns = 0;

  try {
    const sdkQuery = query({
      prompt: req.userMessage,
      options: {
        abortController,
        agent: "exoskull",
        agents: {
          exoskull: {
            description:
              "ExoSkull IORS — adaptive life operating system agent with 60+ tools",
            prompt: systemPrompt,
            model: req.channel === "voice" ? "haiku" : "sonnet",
            maxTurns: config.maxTurns,
          },
        },
        mcpServers: { iors: mcpServer },
        tools: [], // Disable all built-in file tools
        maxTurns: config.maxTurns,
        includePartialMessages: !!req.onTextDelta,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        effort: config.effort,
        env: {
          ...process.env,
          // Ensure Anthropic key is available to subprocess
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      } satisfies Options,
    });

    // ── Phase 5: Process SDK event stream ──
    for await (const msg of sdkQuery) {
      handleSDKMessage(msg, {
        req,
        toolsUsed,
        toolStartTimes,
        onText: (text) => {
          finalText = text;
        },
        onCost: (cost, turns) => {
          costUsd = cost;
          numTurns = turns;
        },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (abortController.signal.aborted) {
      logger.warn(`[ExoSkullAgent] Timed out after ${timeout}ms`);
      // Return whatever we have so far
      if (!finalText) {
        finalText =
          "Przepraszam, odpowiedź zajęła zbyt długo. Spróbuj ponownie.";
      }
    } else {
      logger.error("[ExoSkullAgent] SDK query failed:", { error: msg });
      finalText = "Przepraszam, wystąpił błąd. Spróbuj ponownie.";
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  req.onThinkingStep?.("Generuję odpowiedź", "done");

  const durationMs = Date.now() - startMs;
  logger.info("[ExoSkullAgent] Done:", {
    tenantId: req.tenantId,
    channel: req.channel,
    toolsUsed,
    numTurns,
    costUsd: costUsd.toFixed(4),
    durationMs,
    contextMs,
  });

  return {
    text: finalText,
    toolsUsed,
    shouldEndCall: false,
    emotion: emotionState,
    costUsd,
    numTurns,
    durationMs,
  };
}

// ============================================================================
// SDK MESSAGE HANDLER
// ============================================================================

interface MessageHandlerContext {
  req: AgentRequest;
  toolsUsed: string[];
  toolStartTimes: Map<string, number>;
  onText: (text: string) => void;
  onCost: (cost: number, turns: number) => void;
}

function handleSDKMessage(msg: SDKMessage, ctx: MessageHandlerContext): void {
  switch (msg.type) {
    case "stream_event": {
      // Token streaming for SSE
      if (!ctx.req.onTextDelta) break;
      const event = msg.event;
      if (
        event.type === "content_block_delta" &&
        "delta" in event &&
        event.delta.type === "text_delta"
      ) {
        ctx.req.onTextDelta((event.delta as { text: string }).text);
      }
      break;
    }

    case "assistant": {
      // Full assistant message — extract text and tool calls
      for (const block of msg.message.content) {
        if (block.type === "text") {
          ctx.onText(block.text);
        } else if (block.type === "tool_use") {
          // MCP tools are prefixed: mcp__iors__<name>
          const toolName = block.name.replace("mcp__iors__", "");
          if (!ctx.toolsUsed.includes(toolName)) {
            ctx.toolsUsed.push(toolName);
          }
          ctx.toolStartTimes.set(block.id, Date.now());
          ctx.req.onToolStart?.(toolName);
        }
      }
      break;
    }

    case "tool_progress": {
      // Tool is running — fire onToolStart if we haven't already
      const toolName = msg.tool_name.replace("mcp__iors__", "");
      if (!ctx.toolStartTimes.has(msg.tool_use_id)) {
        ctx.toolStartTimes.set(msg.tool_use_id, Date.now());
        ctx.req.onToolStart?.(toolName);
      }
      break;
    }

    case "tool_use_summary": {
      // Tool completed — fire onToolEnd
      for (const toolUseId of msg.preceding_tool_use_ids) {
        const startTime = ctx.toolStartTimes.get(toolUseId);
        if (startTime) {
          const durationMs = Date.now() - startTime;
          // We don't have the tool name from the summary, extract from summary text
          const nameMatch = msg.summary.match(/(?:mcp__iors__)?(\w+)/);
          const name = nameMatch?.[1] || "unknown";
          ctx.req.onToolEnd?.(name, durationMs, {
            success: !msg.summary.includes("error"),
            resultSummary: msg.summary.slice(0, 200),
          });
          ctx.toolStartTimes.delete(toolUseId);
        }
      }
      break;
    }

    case "result": {
      // Final result
      if (msg.subtype === "success") {
        const success = msg as SDKResultSuccess;
        if (success.result) {
          ctx.onText(success.result);
        }
        ctx.onCost(success.total_cost_usd, success.num_turns);
      } else {
        const error = msg as SDKResultError;
        logger.error("[ExoSkullAgent] SDK error result:", {
          errors: error.errors,
          stopReason: error.stop_reason,
          subtype: error.subtype,
        });
        ctx.onCost(error.total_cost_usd, error.num_turns);
      }
      break;
    }

    // Ignore other message types (system, auth_status, etc.)
    default:
      break;
  }
}
