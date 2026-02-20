/**
 * ExoSkull Agent — Direct Anthropic API orchestrator
 *
 * Uses the Anthropic Messages API directly with a manual tool execution loop.
 * IORS tools are called in-process (zero network overhead for tool dispatch).
 *
 * Architecture:
 *   User Message → Anthropic Messages API → Claude (orchestrator)
 *     ↓ tool_use blocks
 *   IORS Tools executed directly → {DB, APIs, VPS, Gemini, etc.}
 *     ↓ tool_result blocks
 *   Claude → Final Response → SSE stream to UI
 *
 * Previously used Claude Agent SDK's query() which spawns a subprocess —
 * that doesn't work on Vercel serverless. This direct approach does.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  IORS_EXTENSION_TOOLS,
  type ToolDefinition,
} from "@/lib/iors/tools/index";
import { extractSSEDirective } from "@/lib/iors/tools/dashboard-tools";
import { buildDynamicContext } from "@/lib/voice/dynamic-context";
import { STATIC_SYSTEM_PROMPT } from "@/lib/voice/system-prompt";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { logEmotion } from "@/lib/emotion/logger";
import { getToolFilterForChannel } from "@/lib/iors/tools/channel-filters";
import { getThreadContext } from "@/lib/unified-thread";
import { unifiedSearch } from "@/lib/memory/unified-search";
import type { UnifiedSearchResult } from "@/lib/memory/types";
import type { EmotionState } from "@/lib/emotion/types";
import { logger } from "@/lib/logger";
import { buildAppDetectionContext } from "@/lib/integrations/app-context-builder";
import { getServiceSupabase } from "@/lib/supabase/service";
import { classify } from "@/lib/bgml/classifier";
import { selectFramework } from "@/lib/bgml/framework-selector";

// ============================================================================
// TYPES
// ============================================================================

/** All supported channel types across ExoSkull */
export type AgentChannel =
  | "web_chat"
  | "voice"
  | "telegram"
  | "slack"
  | "discord"
  | "sms"
  | "whatsapp"
  | "email"
  | "signal"
  | "imessage"
  | "android_app"
  | "messenger"
  | "instagram";

export interface AgentRequest {
  tenantId: string;
  sessionId: string;
  userMessage: string;
  channel: AgentChannel;
  /** Mark as async task — uses higher maxTurns, all tools, no time pressure */
  isAsync?: boolean;
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
  /** Custom SSE event callback (e.g. cockpit_update from dashboard tools) */
  onCustomEvent?: (event: { type: string; [key: string]: unknown }) => void;
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
};

const VOICE_CONFIG = {
  maxTurns: 6,
  timeoutMs: 40_000,
  model: "claude-haiku-4-5-20251001" as const,
};

const ASYNC_CONFIG = {
  maxTurns: 15,
  timeoutMs: 50_000,
  model: "claude-sonnet-4-5-20250929" as const,
};

const CODING_CONFIG = {
  maxTurns: 25,
  timeoutMs: 120_000,
  model: "claude-sonnet-4-5-20250929" as const,
};

/** Max tool result size (50KB) to prevent hitting API limits */
const MAX_TOOL_RESULT_LENGTH = 50_000;

// ============================================================================
// TOOL HELPERS
// ============================================================================

/**
 * Load IORS tools (static + dynamic) and apply channel filter.
 */
async function loadFilteredTools(
  tenantId: string,
  toolFilter: Set<string> | null,
): Promise<ToolDefinition[]> {
  let allTools = [...IORS_EXTENSION_TOOLS];

  try {
    const { getDynamicToolsForTenant } =
      await import("@/lib/iors/tools/dynamic-handler");
    const dynamicTools = await getDynamicToolsForTenant(tenantId);
    allTools = [...allTools, ...dynamicTools];
    logger.info("[ExoSkullAgent] Loaded tools:", {
      static: IORS_EXTENSION_TOOLS.length,
      dynamic: dynamicTools.length,
      total: allTools.length,
      tenantId,
    });
  } catch (error) {
    logger.error("[ExoSkullAgent] Failed to load dynamic tools:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      tenantId,
    });
  }

  if (toolFilter) {
    const before = allTools.length;
    allTools = allTools.filter((t) => toolFilter.has(t.definition.name));
    logger.info("[ExoSkullAgent] Tool filtering:", {
      before,
      after: allTools.length,
      filtered: before - allTools.length,
    });
  }

  return allTools;
}

/**
 * Convert IORS ToolDefinitions to Anthropic API tool format.
 */
function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.definition.name,
    description: t.definition.description || t.definition.name,
    input_schema: t.definition.input_schema as Anthropic.Tool["input_schema"],
  }));
}

/**
 * Execute a single IORS tool by name with timeout and SSE directive handling.
 */
async function executeIorsTool(
  tools: ToolDefinition[],
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
  onCustomEvent?: AgentRequest["onCustomEvent"],
): Promise<{ result: string; isError: boolean }> {
  const toolDef = tools.find((t) => t.definition.name === name);
  if (!toolDef) {
    return { result: `Tool not found: ${name}`, isError: true };
  }

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

    // Extract embedded SSE directives (e.g. cockpit_update from dashboard tools)
    if (result.startsWith("__SSE__")) {
      const { sseEvent, cleanResult } = extractSSEDirective(result);
      if (sseEvent && onCustomEvent) {
        onCustomEvent(sseEvent);
      }
      result = cleanResult;
    }

    // Truncate very long results
    if (result.length > MAX_TOOL_RESULT_LENGTH) {
      result =
        result.slice(0, MAX_TOOL_RESULT_LENGTH) +
        `\n\n[Truncated — ${result.length} chars total]`;
    }

    return { result, isError: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[ExoSkullAgent] Tool ${name} failed:`, { error: msg });
    return { result: `Błąd: ${msg}`, isError: true };
  }
}

// ============================================================================
// MAIN AGENT FUNCTION
// ============================================================================

/**
 * Run ExoSkull agent via direct Anthropic Messages API.
 *
 * Loads context, creates tool definitions, runs a multi-turn tool loop,
 * and streams results back to the caller.
 */
export async function runExoSkullAgent(
  req: AgentRequest,
): Promise<AgentResponse> {
  const startMs = Date.now();
  const config = req.isAsync
    ? ASYNC_CONFIG
    : req.channel === "voice"
      ? VOICE_CONFIG
      : WEB_CONFIG;

  req.onThinkingStep?.("Ładuję kontekst", "running");

  // ── Phase 1: Load everything in parallel ──
  const toolFilter = getToolFilterForChannel(req.channel, req.isAsync);

  const [
    dynamicCtxResult,
    emotionState,
    filteredTools,
    threadHistory,
    memoryResults,
    rigConnections,
  ] = await Promise.all([
    buildDynamicContext(req.tenantId),
    analyzeEmotion(req.userMessage),
    loadFilteredTools(req.tenantId, toolFilter),
    getThreadContext(req.tenantId, 50),
    unifiedSearch({
      tenantId: req.tenantId,
      query: req.userMessage,
      limit: 10,
      minScore: 0.05,
    }).catch((err) => {
      logger.error("[ExoSkullAgent] Unified search failed (non-blocking):", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        tenantId: req.tenantId,
      });
      return [] as UnifiedSearchResult[];
    }),
    // Rig connections for app autodetekcja
    (async (): Promise<Array<{ rig_slug: string; sync_status: string }>> => {
      try {
        const r = await getServiceSupabase()
          .from("exo_rig_connections")
          .select("rig_slug, sync_status")
          .eq("tenant_id", req.tenantId);
        return (r.data || []) as Array<{
          rig_slug: string;
          sync_status: string;
        }>;
      } catch {
        return [];
      }
    })(),
  ]);

  const contextMs = Date.now() - startMs;
  logger.info(
    `[ExoSkullAgent] Context loaded in ${contextMs}ms, ${filteredTools.length} tools`,
  );
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

  // ── Phase 2b: Format memory context ──
  let memoryContext = "";
  if (memoryResults && memoryResults.length > 0) {
    memoryContext =
      "\n\n## Relevant Memory\n" +
      memoryResults
        .map(
          (r, i) =>
            `[${i + 1}] (${r.type || "memory"}, score: ${r.score.toFixed(2)}) ${r.content.slice(0, 500)}`,
        )
        .join("\n");
  } else {
    memoryContext =
      "\n\n## Memory\nBrak bezpośrednio pasujących wspomnień. Użyj narzędzia search_memory jeśli potrzebujesz więcej kontekstu.";
  }

  // ── Phase 2c: App mention detection ──
  const appDetection = buildAppDetectionContext(
    req.tenantId,
    req.userMessage,
    rigConnections,
    [],
  );

  // ── Phase 3: Build system prompt ──
  const dynamicContext = dynamicCtxResult.context;
  const effectiveSystemPrompt =
    req.systemPromptOverride ||
    dynamicCtxResult.systemPromptOverride ||
    STATIC_SYSTEM_PROMPT;

  let systemPrompt: string;
  if (crisis.detected && crisis.protocol) {
    systemPrompt = [
      crisis.protocol.prompt_override,
      dynamicContext,
      memoryContext,
    ]
      .filter(Boolean)
      .join("\n\n");

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
    // Add coding workspace context for web channels
    if (req.channel !== "voice") {
      parts.push(
        `You have full coding capabilities via VPS tools.\n` +
          `Admin workspace: /root/projects/exoskull/\n` +
          `User workspace: /root/projects/users/${req.tenantId}/\n` +
          `Use code_read_file before editing. Use code_tree to explore. Use code_bash for commands.\n` +
          `Use code_glob/code_grep to search files. Use code_git for version control.\n` +
          `Use code_web_search to find documentation. Use code_deploy to push to production.`,
      );
    }
    // Append relevant memory from unified search
    if (memoryContext) parts.push(memoryContext);
    // Append app autodetekcja context (unconnected apps mentioned by user)
    if (appDetection.contextFragment) parts.push(appDetection.contextFragment);

    // ── BGML Framework Injection (for complex queries) ──
    try {
      const classification = classify(req.userMessage);
      if (classification.complexity >= 3) {
        const framework = await selectFramework(classification.domain);
        if (framework) {
          parts.push(
            `\n## Reasoning Framework: ${framework.name}\n` +
              `Domain: ${classification.domain} | Complexity: ${classification.complexity}/5\n\n` +
              framework.prompt_template,
          );
          logger.info("[ExoSkullAgent] BGML framework injected:", {
            framework: framework.slug,
            domain: classification.domain,
            complexity: classification.complexity,
          });
        }
      }
    } catch (bgmlErr) {
      // BGML is optional — never break the main flow
      logger.warn("[ExoSkullAgent] BGML framework injection failed:", {
        error: bgmlErr instanceof Error ? bgmlErr.message : String(bgmlErr),
      });
    }

    systemPrompt = parts.join("\n\n");
  }

  // ── Phase 4: Direct Anthropic API tool loop ──
  req.onThinkingStep?.("Generuję odpowiedź", "running");

  const abortController = new AbortController();
  const timeout = req.timeoutMs || config.timeoutMs;
  const timeoutHandle = setTimeout(() => abortController.abort(), timeout);

  const toolsUsed: string[] = [];
  let finalText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let numTurns = 0;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const anthropicTools = toAnthropicTools(filteredTools);

    // Message history for multi-turn tool loop.
    //
    // When skipThreadAppend=true the gateway already wrote the current user
    // message to exo_unified_messages BEFORE calling this function, so
    // getThreadContext() already includes it as the last entry. Use threadHistory
    // directly — do NOT drop-and-re-add, which would lose previously merged or
    // consecutive user messages mangled by enforceAlternatingRoles.
    //
    // When skipThreadAppend=false (direct agent calls, async worker) the current
    // user message is NOT yet in the thread, so append it explicitly.
    let messages: Anthropic.MessageParam[];

    if (req.skipThreadAppend && threadHistory.length > 0) {
      // Gateway already persisted the user message; threadHistory is complete.
      // Safety: ensure the conversation ends with a user message (Anthropic requirement).
      const last = threadHistory[threadHistory.length - 1];
      if (last.role === "user") {
        messages = threadHistory;
      } else {
        // Thread ends with assistant — append the current user message.
        messages = [
          ...threadHistory,
          { role: "user", content: req.userMessage },
        ];
      }
    } else {
      // No prior history or caller hasn't written the message yet — append it now.
      messages = [...threadHistory, { role: "user", content: req.userMessage }];
    }

    while (numTurns < config.maxTurns) {
      numTurns++;

      const stream = client.messages.stream(
        {
          model: config.model,
          max_tokens: req.maxTokens || 4096,
          system: systemPrompt,
          messages,
          ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
        },
        { signal: abortController.signal },
      );

      // Stream text deltas to SSE callback
      if (req.onTextDelta) {
        stream.on("text", (text) => req.onTextDelta!(text));
      }

      const response = await stream.finalMessage();

      // Track token usage
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Separate text and tool_use blocks
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
        }
      }

      // If Claude finished (no tool calls), capture final text and exit
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        finalText = textParts.join("");
        break;
      }

      // Claude wants to use tools — add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      // Execute all requested tools in parallel
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const toolName = toolUse.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

          req.onToolStart?.(toolName);
          const toolStartMs = Date.now();

          const { result, isError } = await executeIorsTool(
            filteredTools,
            toolName,
            toolUse.input as Record<string, unknown>,
            req.tenantId,
            req.onCustomEvent,
          );

          const durationMs = Date.now() - toolStartMs;
          logger.info(
            `[ExoSkullAgent] Tool ${toolName}: ${isError ? "FAIL" : "OK"} (${durationMs}ms)`,
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

      // Add tool results to message history
      messages.push({ role: "user", content: toolResults });
    }

    // Max turns reached without final answer
    if (!finalText && numTurns >= config.maxTurns) {
      finalText =
        "Osiągnięto limit interakcji. Spróbuj ponownie z prostszym pytaniem.";
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    if (abortController.signal.aborted) {
      logger.warn(`[ExoSkullAgent] Timed out after ${timeout}ms`);
      if (!finalText) {
        finalText =
          "Przepraszam, odpowiedź zajęła zbyt długo. Spróbuj ponownie.";
      }
    } else {
      logger.error("[ExoSkullAgent] API call failed:", {
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
        tenantId: req.tenantId,
        model: config.model,
        toolCount: filteredTools.length,
        historyLength: threadHistory.length,
      });

      // ── Emergency Gemini fallback (with conversation history) ──
      const geminiText = await emergencyGeminiFallback(
        req,
        systemPrompt,
        emotionState,
        threadHistory,
      );
      if (geminiText) {
        finalText = geminiText;
        toolsUsed.push("emergency_fallback");
      } else {
        finalText = "Przepraszam, wystąpił błąd. Spróbuj ponownie.";
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  req.onThinkingStep?.("Generuję odpowiedź", "done");

  // Calculate cost from token usage
  // Sonnet: $3/MTok input, $15/MTok output
  // Haiku: $0.80/MTok input, $4/MTok output
  const isHaiku = config.model.includes("haiku");
  const inputCostPerMTok = isHaiku ? 0.8 : 3.0;
  const outputCostPerMTok = isHaiku ? 4.0 : 15.0;
  const costUsd =
    (totalInputTokens * inputCostPerMTok +
      totalOutputTokens * outputCostPerMTok) /
    1_000_000;

  const durationMs = Date.now() - startMs;
  logger.info("[ExoSkullAgent] Done:", {
    tenantId: req.tenantId,
    channel: req.channel,
    toolsUsed,
    numTurns,
    totalInputTokens,
    totalOutputTokens,
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
// EMERGENCY GEMINI FALLBACK
// ============================================================================

/**
 * Last-resort fallback when Anthropic API fails completely.
 * Uses Gemini Flash for a no-tools conversational response.
 * Includes conversation history for context continuity.
 */
async function emergencyGeminiFallback(
  req: AgentRequest,
  systemPrompt: string,
  _emotionState: EmotionState,
  threadHistory?: Anthropic.MessageParam[],
): Promise<string | null> {
  try {
    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiKey) return null;

    logger.info(
      "[ExoSkullAgent] All primary providers failed — emergency Gemini fallback (no tools)",
      { tenantId: req.tenantId },
    );
    req.onThinkingStep?.("Tryb awaryjny", "running");

    const { GoogleGenAI } = await import("@google/genai");
    const emergencyAI = new GoogleGenAI({ apiKey: geminiKey });

    // Build Gemini conversation history from thread
    const geminiContents: Array<{
      role: string;
      parts: Array<{ text: string }>;
    }> = [];
    if (threadHistory && threadHistory.length > 0) {
      // Include last 10 messages for context (Gemini has different limits)
      const recentHistory = threadHistory.slice(-10);
      for (const msg of recentHistory) {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter(
                    (b) =>
                      "text" in b &&
                      typeof (b as unknown as { text: unknown }).text ===
                        "string",
                  )
                  .map((b) => (b as unknown as { text: string }).text)
                  .join("\n")
              : "";
        if (text) {
          geminiContents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text }],
          });
        }
      }
    }

    // If no history or history doesn't end with user message, add current
    const lastRole =
      geminiContents.length > 0
        ? geminiContents[geminiContents.length - 1].role
        : null;
    if (lastRole !== "user") {
      geminiContents.push({
        role: "user",
        parts: [{ text: req.userMessage }],
      });
    }

    const emergencyResponse = await emergencyAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: geminiContents,
      config: {
        systemInstruction: systemPrompt.slice(0, 8000),
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const text = emergencyResponse.text || "";
    req.onThinkingStep?.("Tryb awaryjny", "done");

    return text || null;
  } catch (emergencyError) {
    logger.error("[ExoSkullAgent] Emergency Gemini fallback also failed:", {
      error:
        emergencyError instanceof Error
          ? emergencyError.message
          : String(emergencyError),
      tenantId: req.tenantId,
    });
    return null;
  }
}
