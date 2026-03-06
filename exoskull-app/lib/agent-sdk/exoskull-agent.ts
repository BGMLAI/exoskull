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
import { withRetry } from "@/lib/utils/fetch-retry";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { logEmotion } from "@/lib/emotion/logger";
import { sanitizeUserInput } from "@/lib/security/safety-guardrails";
import { getToolFilterForChannel } from "@/lib/iors/tools/channel-filters";
import { getThreadContext } from "@/lib/unified-thread";
import { unifiedSearch } from "@/lib/memory/unified-search";
import type { UnifiedSearchResult } from "@/lib/memory/types";
import type { EmotionState } from "@/lib/emotion/types";
import { logger } from "@/lib/logger";
import { buildAppDetectionContext } from "@/lib/integrations/app-context-builder";
import { getServiceSupabase } from "@/lib/supabase/service";
import { runBGMLPipeline, shouldEscalate } from "@/lib/bgml/pipeline";
import { generatePlan, type ExecutionPlan } from "@/lib/ai/planning/planner";
import { buildToolDescriptions } from "@/lib/iors/tools/tool-descriptions";
import { modulatePrompt } from "@/lib/emotion/response-modulator";
import {
  getTauMatrix,
  updateTauMatrix,
  inferTauFromMessage,
  tauMatrixToContext,
} from "@/lib/ai/tau-matrix";

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
  | "instagram"
  | "autonomous";

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
  maxTurns: 15,
  timeoutMs: 55_000,
  model: "claude-sonnet-4-6" as const,
};

const VOICE_CONFIG = {
  maxTurns: 6,
  timeoutMs: 40_000,
  model: "claude-sonnet-4-6" as const, // Upgraded from Haiku for better quality
};

const ASYNC_CONFIG = {
  maxTurns: 15,
  timeoutMs: 50_000,
  model: "claude-sonnet-4-6" as const,
};

const CODING_CONFIG = {
  maxTurns: 25,
  timeoutMs: 120_000,
  model: "claude-sonnet-4-6" as const,
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
// REVERSE PROMPT — suggest improvements at the end of complex responses
// ============================================================================

/**
 * Build a reverse prompt instruction that tells the agent to append
 * improvement suggestions at the end of its response.
 *
 * Activated for complexity >= 3 (non-voice). The agent will suggest
 * 2-3 follow-up questions or actions the user could take to go deeper.
 */
function buildReversePrompt(
  complexity: number,
  planResult: ExecutionPlan | null,
): string {
  const domain = planResult?.classification.domain || "general";
  const intent = planResult?.intent || "general";

  if (complexity >= 5) {
    return (
      `\n## REVERSE PROMPT (obowiązkowe na końcu odpowiedzi)\n` +
      `Po głównej odpowiedzi dodaj sekcję:\n` +
      `### 🔄 Jak pójść dalej?\n` +
      `Zaproponuj 3 konkretne kroki pogłębienia tego problemu:\n` +
      `1. **Kontekst do zbadania** — co jeszcze warto sprawdzić (dane, źródła, perspektywy)\n` +
      `2. **Akcja do podjęcia** — konkretny następny krok (narzędzie, analiza, test)\n` +
      `3. **Alternatywne podejście** — inny framework/metoda do tego samego problemu\n` +
      `Bądź konkretny — nie "zbadaj więcej" ale "porównaj dane z Q3 vs Q4" lub "użyj Blue Ocean zamiast Porter's".\n` +
      `Domena: ${domain} | Intent: ${intent}`
    );
  }

  if (complexity >= 4) {
    return (
      `\n## REVERSE PROMPT (obowiązkowe na końcu odpowiedzi)\n` +
      `Po głównej odpowiedzi dodaj sekcję:\n` +
      `### 🔄 Co dalej?\n` +
      `Zaproponuj 2 konkretne sugestie jak użytkownik może pogłębić ten temat:\n` +
      `- Jaki aspekt warto zbadać głębiej?\n` +
      `- Jakie narzędzie/akcję mogę wykonać żeby pomóc dalej?\n` +
      `Bądź konkretny i odnośdo kontekstu rozmowy. Domena: ${domain}`
    );
  }

  // Complexity 3 — lighter version
  return (
    `\n## REVERSE PROMPT (opcjonalne na końcu odpowiedzi)\n` +
    `Jeśli temat jest złożony, na końcu odpowiedzi zasugeruj 1-2 pytania pogłębiające ` +
    `lub akcje które mogę wykonać (np. "Chcesz żebym przeanalizował X?" lub "Mogę porównać Y z Z").\n` +
    `Nie dodawaj jeśli odpowiedź jest wyczerpująca lub to proste pytanie.`
  );
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
  // Defense-in-depth: sanitize user input even if gateway already did
  if (req.userMessage) {
    req.userMessage = sanitizeUserInput(req.userMessage);
  }
  const config = req.isAsync
    ? ASYNC_CONFIG
    : req.channel === "voice"
      ? VOICE_CONFIG
      : WEB_CONFIG;

  req.onThinkingStep?.("Ładuję kontekst", "running");

  // ── Phase 1a: Load context + planner in parallel ──
  const [
    dynamicCtxResult,
    emotionState,
    threadHistory,
    memoryResults,
    rigConnections,
    planResult,
  ] = await Promise.all([
    buildDynamicContext(req.tenantId),
    analyzeEmotion(req.userMessage),
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
    // Planner: pre-search (memory + web) + intent detection + tool suggestions
    generatePlan(req.userMessage, req.tenantId).catch((err) => {
      logger.warn("[ExoSkullAgent] Planner failed (non-blocking):", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null as ExecutionPlan | null;
    }),
  ]);

  // ── Phase 1b: Smart tool filter from planner → load tools ──
  const toolFilter = getToolFilterForChannel(
    req.channel,
    req.isAsync,
    planResult?.toolPackKeywords,
  );
  const filteredTools = await loadFilteredTools(req.tenantId, toolFilter);

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

  // Fire-and-forget Tau Matrix update from message signals
  const msgHour = new Date().getUTCHours();
  const tauSignal = inferTauFromMessage(req.userMessage, msgHour);
  updateTauMatrix(req.tenantId, tauSignal).catch(() => {});

  // Load Tau Matrix for context injection
  const tauMatrix = await getTauMatrix(req.tenantId).catch(() => null);

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
  }
  // No disclaimer when memory is empty — agent should NOT mention lack of memory to user

  // ── Phase 2c: App mention detection ──
  const appDetection = buildAppDetectionContext(
    req.tenantId,
    req.userMessage,
    rigConnections,
    [],
  );

  // ── Phase 3: Build system prompt ──
  const dynamicContext = dynamicCtxResult.context;
  // Inject dynamic tool descriptions into the static system prompt
  const toolDescriptions = buildToolDescriptions(toolFilter);
  const baseSystemPrompt = (
    req.systemPromptOverride ||
    dynamicCtxResult.systemPromptOverride ||
    STATIC_SYSTEM_PROMPT
  ).replace("{{DYNAMIC_TOOL_DESCRIPTIONS}}", toolDescriptions);
  const effectiveSystemPrompt = baseSystemPrompt;

  const bgmlComplexity = planResult?.classification.complexity ?? 1;

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
    // Add coding workspace context ONLY when code tools are actually loaded
    const hasCodeTools = filteredTools.some(
      (t) =>
        t.definition.name.startsWith("code_") ||
        t.definition.name === "generate_fullstack_app" ||
        t.definition.name === "execute_code",
    );
    if (hasCodeTools) {
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
    // Inject Tau Matrix user profile context
    if (tauMatrix) parts.push(tauMatrixToContext(tauMatrix));

    // ── Planner Context Injection (pre-search + execution plan) ──
    if (planResult?.contextInjection) {
      parts.push(planResult.contextInjection);
    }

    // ── Reverse Prompt (for complex queries — suggest next improvement steps) ──
    if (bgmlComplexity >= 3 && req.channel !== "voice") {
      parts.push(buildReversePrompt(bgmlComplexity, planResult));
    }

    // ── BGML Pipeline (framework + DIPPER + MoA for complex queries) ──
    // Voice channel: framework only (skip DIPPER/MoA for latency)
    const maxBgmlTier = req.channel === "voice" ? 3 : 5;
    const effectiveBgmlComplexity = Math.min(bgmlComplexity, maxBgmlTier);

    try {
      if (effectiveBgmlComplexity >= 3) {
        req.onThinkingStep?.("Analizuję z BGML", "running");
        const bgmlResult = await runBGMLPipeline(req.userMessage, {
          forceComplexity: effectiveBgmlComplexity,
          systemPrompt: effectiveSystemPrompt,
          maxTokens: effectiveBgmlComplexity >= 5 ? 1536 : 1024,
        });

        if (bgmlResult.contextInjection) {
          parts.push(bgmlResult.contextInjection);
        }

        // For DIPPER/MoA, inject pre-computed multi-model analysis
        if (bgmlResult.precomputedResponse) {
          parts.push(
            `\n## BGML Pre-Analysis (${bgmlResult.tier})\n` +
              `Use this multi-model analysis as your foundation. Build on it, don't repeat it:\n\n` +
              bgmlResult.precomputedResponse.slice(0, 2000),
          );
        }

        logger.info("[ExoSkullAgent] BGML pipeline:", {
          tier: bgmlResult.tier,
          complexity: effectiveBgmlComplexity,
          domain: bgmlResult.classification.domain,
          framework: bgmlResult.framework?.slug,
          hasPrecomputed: !!bgmlResult.precomputedResponse,
          qualityScore: bgmlResult.qualityScore?.score,
          durationMs: bgmlResult.durationMs,
          tokens: bgmlResult.totalTokens,
        });
        req.onThinkingStep?.("Analizuję z BGML", "done");
      }
    } catch (bgmlErr) {
      // BGML is optional — never break the main flow
      logger.warn("[ExoSkullAgent] BGML pipeline failed (non-blocking):", {
        error: bgmlErr instanceof Error ? bgmlErr.message : String(bgmlErr),
      });
    }

    systemPrompt = parts.join("\n\n");
  }

  // Apply emotion-driven prompt modulation (non-crisis only)
  if (!crisis.detected) {
    systemPrompt = modulatePrompt(emotionState, systemPrompt);
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
  const isHaikuModel = config.model.includes("haiku");

  // C3: Budget limit check — switch to cheaper model if exceeded
  let effectiveModel: string = config.model;
  try {
    const budgetDb = getServiceSupabase();
    const { data: tenantData } = await budgetDb
      .from("exo_tenants")
      .select("metadata")
      .eq("id", req.tenantId)
      .single();
    const meta = tenantData?.metadata as Record<string, unknown> | null;
    const monthlyBudget = meta?.monthly_budget_usd as number | undefined;
    if (monthlyBudget && monthlyBudget > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data: usageData } = await budgetDb
        .from("exo_ai_usage")
        .select("estimated_cost")
        .eq("tenant_id", req.tenantId)
        .gte("created_at", monthStart.toISOString());
      const totalSpent = (usageData || []).reduce(
        (sum, r) => sum + ((r.estimated_cost as number) || 0),
        0,
      );
      if (totalSpent >= monthlyBudget) {
        effectiveModel = "claude-haiku-4-5-20251001";
        logger.info("[ExoSkullAgent] Budget exceeded, switching to Haiku:", {
          tenantId: req.tenantId,
          totalSpent,
          monthlyBudget,
        });
      }
    }
  } catch {
    // Budget check is optional
  }

  // ── Fallback strategy: track tool errors ──
  // After 2x same tool error → suggest build_tool(). After 5 total errors → STOP + explain.
  const toolErrorCounts = new Map<string, number>();
  let totalToolErrors = 0;

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

      const response = await withRetry(
        async () => {
          const stream = client.messages.stream(
            {
              model: effectiveModel,
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

          return stream.finalMessage();
        },
        { maxRetries: 3, delayMs: 1500, label: "ExoSkullAgent.stream" },
      );

      // Track token usage
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // C2: Emit cost metadata via SSE
      if (req.onCustomEvent) {
        const turnInputCost =
          (response.usage.input_tokens * (isHaikuModel ? 0.8 : 3.0)) /
          1_000_000;
        const turnOutputCost =
          (response.usage.output_tokens * (isHaikuModel ? 4.0 : 15.0)) /
          1_000_000;
        req.onCustomEvent({
          type: "cost",
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          model: config.model,
          cost_usd:
            Math.round((turnInputCost + turnOutputCost) * 10000) / 10000,
          cumulative_cost_usd:
            Math.round(
              ((totalInputTokens * (isHaikuModel ? 0.8 : 3.0) +
                totalOutputTokens * (isHaikuModel ? 4.0 : 15.0)) /
                1_000_000) *
                10000,
            ) / 10000,
        });
      }

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

        // Anti-hallucination guard: BLOCK action-promising text without tool calls
        // Covers Polish AND English action verbs, fires on ANY turn where no tools were used
        const actionPatterns =
          /\b(buduję|tworzę|piszę kod|konfiguruję|instaluję|wdrażam|deployuję|importuję|integruję|publikuję|koduję|generuję|implementuję|building|creating|writing|configuring|installing|deploying|importing|integrating|publishing|coding|generating|implementing|sending|calling|searching|analyzing|I'm building|I'm creating|I'm sending|I am building|I am creating)\b/i;
        if (
          finalText &&
          actionPatterns.test(finalText) &&
          toolsUsed.length === 0
        ) {
          logger.warn(
            "[ExoSkullAgent] Anti-hallucination: BLOCKED action text without tool calls",
            {
              textSnippet: finalText.slice(0, 200),
              toolsUsed,
            },
          );
          // Replace hallucinated response with honest admission + retry with tool instruction
          messages.push(
            { role: "assistant", content: finalText },
            {
              role: "user",
              content:
                "[SYSTEM] Twoja odpowiedź opisuje działanie, ale NIE wywołałeś żadnego narzędzia. " +
                "NIGDY nie opisuj budowania/tworzenia bez wywołania tool_use. " +
                "Wywołaj odpowiednie narzędzie TERAZ albo powiedz szczerze co możesz zrobić.",
            },
          );
          toolsUsed.push("anti_hallucination_retry");
          finalText = "";
          numTurns++;
          continue; // Re-enter the loop for a corrected response
        }

        break;
      }

      // Claude wants to use tools — add assistant message to history
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      // C5: Emit decision reasoning SSE before tool calls
      if (req.onCustomEvent && toolUseBlocks.length > 0) {
        for (const toolUse of toolUseBlocks) {
          req.onCustomEvent({
            type: "decision",
            tool: toolUse.name,
            reason: `Agent calling ${toolUse.name} with ${JSON.stringify(toolUse.input).slice(0, 200)}`,
            turn: numTurns,
          });
        }
      }

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

          // C5: Emit result summary SSE
          if (req.onCustomEvent) {
            req.onCustomEvent({
              type: "result_summary",
              tool: toolName,
              success: !isError,
              duration_ms: durationMs,
            });
          }

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
            ...(isError ? { is_error: true as const } : {}),
          };
        }),
      );

      // ── Fallback strategy: track errors and suggest build_tool ──
      const failedTools: string[] = [];
      for (const tr of toolResults) {
        if ("is_error" in tr && tr.is_error) {
          // Find the tool name from the matching tool_use block
          const toolBlock = toolUseBlocks.find((b) => b.id === tr.tool_use_id);
          if (toolBlock) {
            const count = (toolErrorCounts.get(toolBlock.name) || 0) + 1;
            toolErrorCounts.set(toolBlock.name, count);
            totalToolErrors++;
            if (count >= 2) failedTools.push(toolBlock.name);
          }
        }
      }

      // After 5 total tool errors → force stop with explanation
      if (totalToolErrors >= 5) {
        const failedNames = [...toolErrorCounts.entries()]
          .filter(([, c]) => c >= 1)
          .map(([n, c]) => `${n} (${c}x)`)
          .join(", ");
        finalText =
          `Przepraszam, napotkałem zbyt wiele błędów narzędzi (${failedNames}). ` +
          `Spróbuj ponownie lub opisz problem inaczej.`;
        logger.warn("[ExoSkullAgent] Fallback: 5 total tool errors, stopping", {
          toolErrorCounts: Object.fromEntries(toolErrorCounts),
          tenantId: req.tenantId,
        });
        break;
      }

      // Add tool results to message history
      messages.push({ role: "user", content: toolResults });

      // After 2x same tool error → inject build_tool suggestion + auto-reflexion
      if (failedTools.length > 0) {
        const suggestion =
          `[SYSTEM] Narzędzia ${failedTools.join(", ")} zawiodły 2+ razy. ` +
          `Zamiast ponawiać, użyj build_tool aby zbudować alternatywne narzędzie, ` +
          `albo użyj innego istniejącego narzędzia. NIE powtarzaj tego samego wywołania.`;
        messages.push({ role: "user", content: suggestion });
        logger.info("[ExoSkullAgent] Fallback: suggesting build_tool for", {
          failedTools,
          tenantId: req.tenantId,
        });

        // A2: Auto-reflexion — log failure patterns for learning
        try {
          const reflexionDb = getServiceSupabase();
          await reflexionDb.from("exo_dev_journal").insert({
            tenant_id: req.tenantId,
            entry_type: "learning",
            title: `Auto-reflexion: tools failed (${failedTools.join(", ")})`,
            details: {
              task: req.userMessage.slice(0, 200),
              sweet: [],
              sour: failedTools.map(
                (t) =>
                  `${t} failed ${toolErrorCounts.get(t) || 0}x — consider alternative`,
              ),
              tags: ["auto_reflexion", "tool_failure"],
              evaluated_at: new Date().toISOString(),
            },
            outcome: "failed",
          });
        } catch {
          // Auto-reflexion is non-blocking
        }
      }
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
        finalText = "Timeout — spróbuj ponownie lub uprość pytanie.";
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

      // ── Emergency fallback chain: DeepSeek (tools) → Kimi (tools) → DeepSeek (no tools) ──
      const geminiText = await emergencyGeminiFallback(
        req,
        systemPrompt,
        emotionState,
        threadHistory,
        filteredTools,
      );
      if (geminiText) {
        finalText = geminiText;
        toolsUsed.push("emergency_fallback");
      } else {
        finalText = "Błąd przetwarzania. Spróbuj ponownie.";
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  req.onThinkingStep?.("Generuję odpowiedź", "done");

  // ── Post-response quality scoring ──
  if (finalText && bgmlComplexity >= 3) {
    try {
      const qualityCheck = shouldEscalate(finalText);
      logger.info("[ExoSkullAgent] Response quality:", {
        score: qualityCheck.score,
        shouldEscalate: qualityCheck.shouldEscalate,
        reason: qualityCheck.reason,
        complexity: bgmlComplexity,
        intent: planResult?.intent,
      });
    } catch {
      // Quality check is optional — never break the flow
    }
  }

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

  // Log AI usage to database for admin dashboard tracking
  try {
    const db = getServiceSupabase();
    await db.from("exo_ai_usage").insert({
      tenant_id: req.tenantId,
      model: config.model,
      tier: config.model.includes("haiku") ? 2 : 3,
      provider: "anthropic",
      task_category: req.channel,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost: costUsd,
      latency_ms: durationMs,
      success: !toolsUsed.includes("emergency_fallback"),
      request_metadata: {
        channel: req.channel,
        numTurns,
        toolsUsed,
        bgmlComplexity: bgmlComplexity > 1 ? bgmlComplexity : undefined,
        plannerIntent: planResult?.intent,
        hasPreSearch: planResult?.preSearch?.hasRelevantMemory,
      },
    });
  } catch (logErr) {
    logger.warn("[ExoSkullAgent] Failed to log AI usage:", {
      error: logErr instanceof Error ? logErr.message : logErr,
    });
  }

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
// EMERGENCY FALLBACK CHAIN: DeepSeek (tools) → Kimi (tools) → DeepSeek (no tools)
// ============================================================================

/** OpenAI-compatible tool format */
interface OAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-compatible message */
interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** OpenAI-compatible response */
interface OAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
}

/**
 * Convert Anthropic thread history to OpenAI-compatible messages.
 */
function threadToOAIMessages(
  systemPrompt: string,
  threadHistory: Anthropic.MessageParam[] | undefined,
  userMessage: string,
): OAIMessage[] {
  const messages: OAIMessage[] = [
    { role: "system", content: systemPrompt.slice(0, 64000) },
  ];

  if (threadHistory && threadHistory.length > 0) {
    for (const msg of threadHistory.slice(-10)) {
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
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: text,
        });
      }
    }
  }

  // Ensure last message is user with BIEŻĄCE POLECENIE marker
  const lastMsg = messages.length > 1 ? messages[messages.length - 1] : null;
  if (lastMsg && lastMsg.role === "user" && lastMsg.content === userMessage) {
    lastMsg.content = `[BIEŻĄCE POLECENIE] ${userMessage}`;
  } else {
    messages.push({
      role: "user",
      content: `[BIEŻĄCE POLECENIE] ${userMessage}`,
    });
  }

  return messages;
}

/**
 * Convert IORS tools to OpenAI function-calling format.
 */
function toolsToOAIFormat(tools: ToolDefinition[]): OAITool[] {
  return tools.slice(0, 64).map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: (t.definition.description || t.definition.name).slice(
        0,
        1024,
      ),
      parameters: t.definition.input_schema as Record<string, unknown>,
    },
  }));
}

/**
 * Run a multi-turn tool-calling loop against an OpenAI-compatible API.
 * Returns final text or null on failure.
 */
async function runOAIToolLoop(opts: {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OAIMessage[];
  tools: OAITool[];
  iorTools: ToolDefinition[];
  tenantId: string;
  maxTurns: number;
  label: string;
  onToolStart?: (name: string) => void;
  onToolEnd?: (
    name: string,
    durationMs: number,
    meta?: { success?: boolean },
  ) => void;
}): Promise<{ text: string; toolsUsed: string[] } | null> {
  const {
    apiUrl,
    apiKey,
    model,
    messages,
    tools,
    iorTools,
    tenantId,
    maxTurns,
    label,
  } = opts;
  const toolsUsed: string[] = [];
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`${label} API error: ${response.status}`);
    }

    const data = (await response.json()) as OAIResponse;
    const choice = data.choices?.[0];
    if (!choice?.message) throw new Error(`${label}: empty response`);

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls;

    // No tool calls → final answer
    if (!toolCalls || toolCalls.length === 0) {
      const responseText = assistantMsg.content || "";
      // Anti-hallucination guard for fallback providers
      const actionPatterns =
        /\b(buduję|tworzę|piszę kod|konfiguruję|instaluję|wdrażam|deployuję|importuję|integruję|publikuję|koduję|generuję|implementuję|building|creating|writing|configuring|installing|deploying|importing|integrating|publishing|coding|generating|implementing|sending|calling|I'm building|I'm creating|I'm sending)\b/i;
      if (
        responseText &&
        actionPatterns.test(responseText) &&
        toolsUsed.length === 0 &&
        turns === 1
      ) {
        // Model is describing actions without calling tools — inject correction
        logger.warn(
          `[${label}] Anti-hallucination: action text without tool calls`,
          {
            textSnippet: responseText.slice(0, 200),
          },
        );
        messages.push(
          { role: "assistant", content: responseText },
          {
            role: "user",
            content:
              "[SYSTEM] Twoja odpowiedź opisuje działanie, ale NIE wywołałeś żadnego narzędzia. " +
              "NIGDY nie opisuj budowania/tworzenia bez wywołania tool_use. " +
              "Wywołaj odpowiednie narzędzie TERAZ albo powiedz szczerze co możesz zrobić.",
          },
        );
        continue; // Retry with correction
      }
      return { text: responseText, toolsUsed };
    }

    // Add assistant message with tool_calls to history
    messages.push({
      role: "assistant",
      content: assistantMsg.content || null,
      tool_calls: toolCalls,
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

      opts.onToolStart?.(toolName);
      const startMs = Date.now();

      let result: string;
      try {
        const input = JSON.parse(tc.function.arguments || "{}");
        const toolDef = iorTools.find((t) => t.definition.name === toolName);
        if (!toolDef) {
          result = `Tool not found: ${toolName}`;
        } else {
          const timeout = toolDef.timeoutMs ?? 10_000;
          result = await Promise.race([
            toolDef.execute(input, tenantId),
            new Promise<string>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Tool ${toolName} timed out`)),
                timeout,
              ),
            ),
          ]);
        }
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }

      const durationMs = Date.now() - startMs;
      opts.onToolEnd?.(toolName, durationMs, {
        success: !result.startsWith("Error:"),
      });

      // Truncate large results
      if (result.length > 50_000) {
        result = result.slice(0, 50_000) + "\n[Truncated]";
      }

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }
  }

  return null; // Max turns exhausted
}

/**
 * Emergency fallback chain when Anthropic API fails.
 *
 * Chain: DeepSeek (with tools) → Kimi (with tools) → DeepSeek (no tools)
 * Each provider gets the full tool suite so IORS can still use tools like
 * publish_to_allegro even when Anthropic is down.
 */
async function emergencyGeminiFallback(
  req: AgentRequest,
  systemPrompt: string,
  _emotionState: EmotionState,
  threadHistory?: Anthropic.MessageParam[],
  filteredTools?: ToolDefinition[],
): Promise<string | null> {
  const oaiMessages = threadToOAIMessages(
    systemPrompt,
    threadHistory,
    req.userMessage,
  );
  const iorTools = filteredTools || [];
  const oaiTools = iorTools.length > 0 ? toolsToOAIFormat(iorTools) : [];

  // ── Attempt 1: DeepSeek WITH tool calling ──
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    try {
      logger.info("[ExoSkullAgent] Fallback #1: DeepSeek with tools", {
        tenantId: req.tenantId,
        toolCount: oaiTools.length,
      });
      req.onThinkingStep?.("Tryb awaryjny (DeepSeek)", "running");

      const result = await runOAIToolLoop({
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: deepseekKey,
        model: "deepseek-chat",
        messages: structuredClone(oaiMessages),
        tools: oaiTools,
        iorTools,
        tenantId: req.tenantId,
        maxTurns: 8,
        label: "DeepSeek",
        onToolStart: req.onToolStart,
        onToolEnd: req.onToolEnd,
      });

      if (result?.text) {
        req.onThinkingStep?.("Tryb awaryjny (DeepSeek)", "done");
        return result.text;
      }
    } catch (e) {
      logger.warn("[ExoSkullAgent] Fallback #1 (DeepSeek+tools) failed:", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Attempt 2: Kimi/Moonshot WITH tool calling ──
  const moonshotKey = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;
  if (moonshotKey) {
    try {
      logger.info("[ExoSkullAgent] Fallback #2: Kimi/Moonshot with tools", {
        tenantId: req.tenantId,
        toolCount: oaiTools.length,
      });
      req.onThinkingStep?.("Tryb awaryjny (Kimi)", "running");

      const result = await runOAIToolLoop({
        apiUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: moonshotKey,
        model: "moonshot-v1-32k",
        messages: structuredClone(oaiMessages),
        tools: oaiTools,
        iorTools,
        tenantId: req.tenantId,
        maxTurns: 8,
        label: "Kimi",
        onToolStart: req.onToolStart,
        onToolEnd: req.onToolEnd,
      });

      if (result?.text) {
        req.onThinkingStep?.("Tryb awaryjny (Kimi)", "done");
        return result.text;
      }
    } catch (e) {
      logger.warn("[ExoSkullAgent] Fallback #2 (Kimi+tools) failed:", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Attempt 3: DeepSeek NO tools (last resort — conversation only) ──
  if (deepseekKey) {
    try {
      logger.info(
        "[ExoSkullAgent] Fallback #3: DeepSeek no tools (last resort)",
        {
          tenantId: req.tenantId,
        },
      );
      req.onThinkingStep?.("Tryb awaryjny", "running");

      const response = await fetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: oaiMessages,
            temperature: 0.7,
            max_tokens: 2048,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = (await response.json()) as OAIResponse;
      const text = data.choices?.[0]?.message?.content || "";
      req.onThinkingStep?.("Tryb awaryjny", "done");
      return text || null;
    } catch (e) {
      logger.error(
        "[ExoSkullAgent] Fallback #3 (DeepSeek no-tools) also failed:",
        {
          error: e instanceof Error ? e.message : String(e),
          tenantId: req.tenantId,
        },
      );
    }
  }

  return null;
}
