/**
 * Voice Conversation Handler
 *
 * Orchestrates Claude conversations with tools for the voice pipeline.
 * Manages session state and integrates with Supabase for persistence.
 *
 * Tool definitions and execution logic live in lib/iors/tools/ (11 domain files).
 * This file is the orchestrator — it manages sessions, context, and the Claude API loop.
 */

import Anthropic from "@anthropic-ai/sdk";
import { STATIC_SYSTEM_PROMPT } from "./system-prompt";
import {
  getExtensionToolDefinitions,
  executeExtensionTool,
  getToolsForTenant,
} from "@/lib/iors/tools";
import { buildDynamicContext } from "./dynamic-context";
import { appendMessage, getThreadContext } from "../unified-thread";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { logEmotion } from "@/lib/emotion/logger";
import { getServiceSupabase } from "@/lib/supabase/service";
import { callOpenAIChatWithTools } from "./openai-chat-provider";
import { callGeminiChatWithTools } from "./gemini-chat-provider";
import {
  runAgentLoop,
  runAgentLoopStreaming,
  WEB_AGENT_CONFIG,
  VOICE_AGENT_CONFIG,
} from "@/lib/iors/agent-loop";

import { unifiedSearch } from "@/lib/memory/unified-search";
import { logger } from "@/lib/logger";
import { buildAppDetectionContext } from "@/lib/integrations/app-context-builder";
// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

/** Fallback Anthropic model when Gemini fails */
const DEFAULT_CLAUDE_MODEL = "claude-3-5-haiku-20241022";

/**
 * Model selection map — user picks in Settings → AI Providers.
 * Keys starting with "gemini" route through Gemini provider.
 * All others route through Anthropic provider.
 */
const CHAT_MODEL_MAP: Record<string, string> = {
  auto: "gemini-3-flash-preview", // Default: Gemini 3 Flash (fast, capable, cheap)
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3-pro": "gemini-3-pro-preview", // Tier 2: analysis, reasoning
  "gemini-2.5-flash": "gemini-2.5-flash", // Thinking model (slower, smarter)
  haiku: "claude-3-5-haiku-20241022",
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-6-20260201", // Opus 4.6 (was 4.5)
};

/** Check if a resolved model ID is a Gemini model */
function isGeminiModel(modelId: string): boolean {
  return modelId.startsWith("gemini");
}

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSession {
  id: string;
  callSid: string;
  tenantId: string;
  status: "active" | "ended";
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, any>;
  /** Optional prompt prefix (e.g., IORS birth flow) prepended to system prompt */
  systemPromptPrefix?: string;
  /** Override max_tokens (default 200 for voice, set higher for birth/chat flows) */
  maxTokens?: number;
  /** Skip end-call phrase detection (e.g., during birth flow where "cześć" is a greeting) */
  skipEndCallDetection?: boolean;
}

export interface ConversationResult {
  text: string;
  toolsUsed: string[];
  shouldEndCall: boolean;
  /** Detected emotion state (for voice prosody / TTS adaptation) */
  emotion?: import("@/lib/emotion/types").EmotionState;
}

/** Callback for real-time processing events (used by SSE stream) */
export interface ProcessingCallback {
  onThinkingStep?: (step: string, status: "running" | "done") => void;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (
    toolName: string,
    durationMs: number,
    meta?: { success?: boolean; resultSummary?: string },
  ) => void;
  /** Stream thinking tokens (extended thinking / reasoning trace) */
  onThinkingToken?: (token: string) => void;
  /** Stream text response tokens */
  onTextDelta?: (delta: string) => void;
  /** Emit a custom SSE event (e.g. cockpit_update from dashboard tools) */
  onCustomEvent?: (event: { type: string; [key: string]: unknown }) => void;
}

// ============================================================================
// TOOL DEFINITIONS — all from IORS registry
// ============================================================================

const IORS_TOOLS_RAW: Anthropic.Tool[] = getExtensionToolDefinitions();

// Add cache_control to last tool — Anthropic caches everything up to and including
// the cache breakpoint. This caches all 31 tools (~3-4K tokens) for 5 minutes.
const IORS_TOOLS: Anthropic.Tool[] = IORS_TOOLS_RAW.map((tool, i, arr) =>
  i === arr.length - 1
    ? { ...tool, cache_control: { type: "ephemeral" as const } }
    : tool,
);

// ============================================================================
// VOICE-SPECIFIC TOOL SUBSET (~15 tools vs 100 = faster prompt processing)
// ============================================================================

const VOICE_ESSENTIAL_TOOL_NAMES = new Set([
  // Tasks
  "add_task",
  "complete_task",
  "list_tasks",
  // Memory & Context
  "search_memory",
  "get_daily_summary",
  "correct_daily_summary",
  // Goals
  "define_goal",
  "log_goal_progress",
  "check_goals",
  // Planning
  "plan_action",
  // Knowledge
  "search_knowledge",
  // Communication
  "send_sms",
  "send_email",
  // Mods / Apps (data logging)
  "log_mod_data",
  "get_mod_data",
  // Emotion
  "tau_assess",
  // Email
  "search_emails",
  "email_summary",
]);

// ============================================================================
// WEB CHAT TOOL SUBSET (~40 most-used tools — 100 tools overwhelms all providers)
// ============================================================================

const WEB_ESSENTIAL_TOOL_NAMES = new Set([
  // Tasks & Planning
  "add_task",
  "complete_task",
  "list_tasks",
  "plan_action",
  "schedule_action",
  // Memory & Context
  "search_memory",
  "get_daily_summary",
  "correct_daily_summary",
  // Goals (Tyrolka)
  "define_goal",
  "log_goal_progress",
  "check_goals",
  "create_quest",
  "list_quests",
  // Knowledge
  "search_knowledge",
  "import_url",
  "list_documents",
  "get_document_content",
  "analyze_knowledge",
  // Communication
  "send_sms",
  "send_email",
  // Apps / Mods
  "build_app",
  "list_apps",
  "app_log_data",
  "app_get_data",
  "log_mod_data",
  "get_mod_data",
  // Email
  "search_emails",
  "email_summary",
  "email_follow_ups",
  "email_sender_info",
  "list_newsletters",
  "unsubscribe_email",
  "bulk_unsubscribe",
  // Emotion & Personality
  "tau_assess",
  // Web
  "search_web",
  "fetch_webpage",
  // Canvas
  "update_canvas",
  // Code Gen
  "execute_code",
  // Self-Config
  "update_instructions",
  "update_behavior",
  // Autonomy
  "request_autonomy",
  "autonomous_action",
  // Feedback
  "submit_feedback",
]);

const VOICE_TOOLS_RAW = IORS_TOOLS_RAW.filter((t) =>
  VOICE_ESSENTIAL_TOOL_NAMES.has(t.name),
);
const VOICE_TOOLS: Anthropic.Tool[] = VOICE_TOOLS_RAW.map((tool, i, arr) =>
  i === arr.length - 1
    ? { ...tool, cache_control: { type: "ephemeral" as const } }
    : tool,
);

/** Voice model — Gemini 3 Flash for fast text generation (TTS is separate) */
const VOICE_MODEL = "gemini-3-flash-preview";

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get or create a voice session
 */
export async function getOrCreateSession(
  callSid: string,
  tenantId: string,
): Promise<VoiceSession> {
  const supabase = getServiceSupabase();

  // Try to find existing session
  const { data: existing } = await supabase
    .from("exo_voice_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .single();

  if (existing) {
    return {
      id: existing.id,
      callSid: existing.call_sid,
      tenantId: existing.tenant_id,
      status: existing.status,
      messages: existing.messages || [],
      startedAt: existing.started_at,
      endedAt: existing.ended_at,
      metadata: existing.metadata,
    };
  }

  // Create new session
  const { data: newSession, error } = await supabase
    .from("exo_voice_sessions")
    .insert({
      call_sid: callSid,
      tenant_id: tenantId,
      status: "active",
      messages: [],
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error("[ConversationHandler] Failed to create session:", error);
    throw new Error(`Failed to create session: ${error.message}`);
  }

  logger.info("[ConversationHandler] Created session:", newSession.id);

  return {
    id: newSession.id,
    callSid: newSession.call_sid,
    tenantId: newSession.tenant_id,
    status: newSession.status,
    messages: [],
    startedAt: newSession.started_at,
  };
}

/**
 * Update session with new messages.
 * Writes to both voice session (legacy) AND unified thread (new).
 */
export async function updateSession(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  options?: {
    tenantId?: string;
    channel?: "voice" | "web_chat";
    /** Gateway already wrote the user message to unified thread — skip user append */
    skipUserAppend?: boolean;
  },
): Promise<void> {
  const supabase = getServiceSupabase();
  const channel = options?.channel || "voice";
  const sourceType =
    channel === "web_chat" ? ("web_chat" as const) : ("voice_session" as const);

  // Get current messages
  const { data: session } = await supabase
    .from("exo_voice_sessions")
    .select("messages, tenant_id")
    .eq("id", sessionId)
    .single();

  const messages = session?.messages || [];
  messages.push({ role: "user", content: userMessage });
  messages.push({ role: "assistant", content: assistantMessage });

  // Update voice session (legacy storage)
  const { error } = await supabase
    .from("exo_voice_sessions")
    .update({ messages })
    .eq("id", sessionId);

  if (error) {
    logger.error("[ConversationHandler] Failed to update session:", error);
  }

  // Append to unified thread (new cross-channel storage)
  const resolvedTenantId = options?.tenantId || session?.tenant_id;
  if (resolvedTenantId) {
    try {
      // Only append user message if caller hasn't already done it (e.g., gateway)
      if (!options?.skipUserAppend) {
        await appendMessage(resolvedTenantId, {
          role: "user",
          content: userMessage,
          channel,
          direction: "inbound",
          source_type: sourceType,
          source_id: sessionId,
        });
      }
      await appendMessage(resolvedTenantId, {
        role: "assistant",
        content: assistantMessage,
        channel,
        direction: "outbound",
        source_type: sourceType,
        source_id: sessionId,
      });
    } catch (threadError) {
      logger.error(
        "[ConversationHandler] Failed to append to unified thread:",
        threadError,
      );
    }
  }
}

/**
 * End a voice session
 */
export async function endSession(sessionId: string): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("exo_voice_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    logger.error("[ConversationHandler] Failed to end session:", error);
  }

  logger.info("[ConversationHandler] Ended session:", sessionId);
}

// ============================================================================
// TOOL EXECUTION — thin wrapper over IORS registry
// ============================================================================

async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  tenantId: string,
): Promise<string> {
  logger.info("[ConversationHandler] Executing tool:", toolName, toolInput);

  const result = await executeExtensionTool(toolName, toolInput, tenantId);
  return result ?? "Nieznane narzędzie";
}

// ============================================================================
// END CALL DETECTION
// ============================================================================

const END_PHRASES = [
  "do widzenia",
  "pa pa",
  "dziękuję to wszystko",
  "to wszystko na dziś",
  "nara",
  "do usłyszenia",
  "dobranoc",
];

function shouldEndCall(userText: string): boolean {
  const normalized = userText.toLowerCase().trim();
  return END_PHRASES.some((phrase) => normalized.includes(phrase));
}

// ============================================================================
// MAIN CONVERSATION FUNCTION
// ============================================================================

/**
 * Process user message and generate Claude response.
 *
 * @deprecated Use `runExoSkullAgent()` from `@/lib/agent-sdk` instead.
 * This function is kept for reference only. All call sites have been
 * migrated to the Agent SDK path as of 2026-02-16.
 */
export async function processUserMessage(
  session: VoiceSession,
  userMessage: string,
  options?: {
    recordingUrl?: string;
    /** Gateway already wrote the user message to unified thread — don't re-add */
    skipThreadAppend?: boolean;
    /** Optional callback for real-time processing events (SSE stream) */
    callback?: ProcessingCallback;
    /** Channel type — "voice" uses Haiku + reduced tools for speed */
    channel?: "voice" | "web_chat";
    /** Streaming callback — when set, text is streamed token-by-token via Claude streaming API */
    onTextDelta?: (delta: string) => void;
  },
): Promise<ConversationResult> {
  let anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Check for end call phrases (skip during birth flow etc.)
  if (!session.skipEndCallDetection && shouldEndCall(userMessage)) {
    return {
      text: "Do usłyszenia! Miłego dnia!",
      toolsUsed: [],
      shouldEndCall: true,
      // No emotion analysis for end-call shortcut
    };
  }

  // Fire thinking step: loading context
  options?.callback?.onThinkingStep?.("Ładuję kontekst", "running");

  const isVoiceChannel = options?.channel === "voice";
  const preStartTime = Date.now();

  // ── ALL CHANNELS: context, thread, emotion, tools, memory — ALL PARALLEL ──
  const [
    dynamicContextResult,
    emotionState,
    rawThreadMessages,
    toolsResult,
    memoryRecall,
  ] = await Promise.all([
    buildDynamicContext(session.tenantId),
    analyzeEmotion(userMessage),
    getThreadContext(session.tenantId, 25).catch((err) => {
      logger.error("[ConversationHandler] Thread context failed:", err);
      return [] as { role: "user" | "assistant"; content: string }[];
    }),
    getToolsForTenant(session.tenantId),
    // Auto-recall relevant memories based on user's message
    unifiedSearch({
      tenantId: session.tenantId,
      query: userMessage,
      limit: 5,
      weights: { vector: 0.6, keyword: 0.2, recency: 0.15, entity: 0.05 },
      minScore: 0.3,
    }).catch((err) => {
      logger.error("[ConversationHandler] Memory recall failed:", err);
      return [] as import("@/lib/memory/types").UnifiedSearchResult[];
    }),
  ]);

  logger.info(
    `[ConversationHandler] Context loaded in ${Date.now() - preStartTime}ms (channel: ${options?.channel || "web_chat"})`,
  );

  // Extract per-user config from dynamic context result
  let dynamicContext = dynamicContextResult.context;

  // Inject auto-recalled memories into context (if any matched)
  if (memoryRecall.length > 0) {
    const topMemories = memoryRecall.slice(0, 5).map((m) => {
      const date = new Date(m.date).toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
      });
      return `- [${m.type}] ${date}: ${m.content.slice(0, 200)}`;
    });
    dynamicContext += `\n\n## PRZYPOMNIANE WSPOMNIENIA (auto-recall)\nTe wspomnienia pasują do obecnej wiadomości użytkownika:\n${topMemories.join("\n")}\n→ Użyj tych wspomnień naturalnie w odpowiedzi, jeśli są istotne. Nie mów "znalazłem w pamięci", po prostu PAMIĘTAJ.\n`;
    logger.info("[ConversationHandler] Memory recall injected:", {
      count: memoryRecall.length,
      topScore: memoryRecall[0]?.score,
      tenantId: session.tenantId,
    });
  }

  // ── App autodetekcja: detect unconnected apps mentioned by user ──
  let rigConns: Array<{ rig_slug: string; sync_status: string }> = [];
  try {
    const r = await getServiceSupabase()
      .from("exo_rig_connections")
      .select("rig_slug, sync_status")
      .eq("tenant_id", session.tenantId);
    rigConns = (r.data || []) as Array<{
      rig_slug: string;
      sync_status: string;
    }>;
  } catch {
    // Non-blocking — continue without rig connections
  }
  const appDetection = buildAppDetectionContext(
    session.tenantId,
    userMessage,
    rigConns,
    [],
  );
  if (appDetection.contextFragment) {
    dynamicContext += appDetection.contextFragment;
  }

  const systemPromptOverride = dynamicContextResult.systemPromptOverride;
  const aiConfig = dynamicContextResult.aiConfig;
  const userTemperature = aiConfig?.temperature ?? 0.7;
  const chatModelPref = aiConfig?.model_preferences?.chat ?? "auto";
  // Voice uses Gemini 3 Flash (fast + cheap), web uses user preference
  const resolvedModel = isVoiceChannel
    ? VOICE_MODEL
    : CHAT_MODEL_MAP[chatModelPref] || CHAT_MODEL_MAP["auto"];
  const useGemini = isGeminiModel(resolvedModel);
  // Tools already loaded in parallel above — FILTER to subset per channel
  const { definitions, dynamicCount } = toolsResult;
  const toolFilter = isVoiceChannel
    ? VOICE_ESSENTIAL_TOOL_NAMES
    : WEB_ESSENTIAL_TOOL_NAMES;
  const filteredDefs = definitions.filter((t) => toolFilter.has(t.name));
  const activeTools: Anthropic.Tool[] = filteredDefs.map((tool, i, arr) =>
    i === arr.length - 1
      ? { ...tool, cache_control: { type: "ephemeral" as const } }
      : tool,
  );
  logger.info("[ConversationHandler] Tool filtering:", {
    channel: options?.channel || "web_chat",
    totalAvailable: definitions.length,
    afterFilter: activeTools.length,
    dynamicCount,
    tenantId: session.tenantId,
  });
  if (dynamicCount > 0) {
    logger.info("[ConversationHandler] Dynamic tools loaded:", {
      tenantId: session.tenantId,
      dynamicCount,
      totalTools: activeTools.length,
    });
  }

  // Override Anthropic client with tenant's own key if configured
  const tenantAnthropicKey = aiConfig?.providers?.anthropic?.api_key;
  if (tenantAnthropicKey) {
    anthropic = new Anthropic({ apiKey: tenantAnthropicKey });
    logger.info("[ConversationHandler] Using tenant's own Anthropic API key");
  }

  // Filter out poisoned assistant messages from thread context
  // (old "Zrobione!" fallback, broken responses that Claude would copy)
  const POISON_PATTERNS = [
    "Zrobione!",
    "Gotowe. Użyłem:",
    "Przepraszam, nie mogłem przetworzyć",
    "trybie podstawowym",
    "tryb podstawowy",
    "nie mam dostępu do Twoich systemów",
  ];
  const threadMessages = rawThreadMessages.filter((msg) => {
    if (msg.role === "assistant") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return !POISON_PATTERNS.some((p) => text.includes(p));
    }
    return true;
  });

  // Tau Matrix — fire-and-forget 4-quadrant emotion classification (all channels)
  import("@/lib/iors/emotion-matrix")
    .then(({ classifyTauQuadrant, logEmotionSignal }) => {
      const signal = classifyTauQuadrant(emotionState);
      return logEmotionSignal(session.tenantId, signal, session.id);
    })
    .catch((err) => {
      logger.warn(
        "[ConversationHandler] Tau classification failed:",
        err instanceof Error ? err.message : String(err),
      );
    });

  // Crisis check — full 3-layer detection for ALL channels
  const crisis = await detectCrisis(userMessage, emotionState);

  let systemBlocks: Anthropic.TextBlockParam[];
  let maxTokensOverride: number | undefined;

  if (crisis.detected && crisis.protocol) {
    // CRISIS MODE — protocol overrides everything
    systemBlocks = [
      {
        type: "text",
        text: crisis.protocol.prompt_override,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: dynamicContext },
    ];
    maxTokensOverride = 400; // Longer crisis responses
    // Log synchronously for legal safety
    await logEmotion(session.tenantId, emotionState, userMessage, {
      sessionId: session.id,
      crisisFlags: crisis.indicators,
      crisisProtocolTriggered: true,
      personalityAdaptedTo: "crisis_support",
    });
    logger.info(
      `[ConversationHandler] 🚨 CRISIS MODE: ${crisis.type} (severity: ${crisis.severity})`,
    );
    // Schedule proactive follow-up chain (fire-and-forget)
    import("@/lib/autonomy/outbound-triggers")
      .then(({ scheduleCrisisFollowUp }) =>
        scheduleCrisisFollowUp(
          session.tenantId,
          crisis.type!,
          crisis.severity!,
        ),
      )
      .catch((err) => {
        logger.error(
          "[ConversationHandler] Crisis follow-up scheduling failed:",
          {
            error: err instanceof Error ? err.message : String(err),
            tenantId: session.tenantId,
          },
        );
      });
    // Emergency contact escalation for high/critical crises
    if (crisis.severity === "high" || crisis.severity === "critical") {
      import("@/lib/iors/emergency-contact")
        .then(({ escalateToCrisisContact }) =>
          escalateToCrisisContact(
            session.tenantId,
            crisis.type!,
            crisis.severity!,
          ),
        )
        .catch((err) => {
          logger.error("[ConversationHandler] Emergency escalation failed:", {
            error: err instanceof Error ? err.message : String(err),
            tenantId: session.tenantId,
          });
        });
    }
  } else {
    // Normal: emotion-adaptive prompt (split into cacheable blocks)
    const adaptive = getAdaptivePrompt(emotionState);

    systemBlocks = [];
    if (session.systemPromptPrefix) {
      systemBlocks.push({ type: "text", text: session.systemPromptPrefix });
    }
    // Static prompt (~2500 tokens) — or user's custom override if set
    // When user sets a system prompt override in Settings, it replaces the default STATIC_SYSTEM_PROMPT
    const effectiveSystemPrompt = systemPromptOverride || STATIC_SYSTEM_PROMPT;
    systemBlocks.push({
      type: "text",
      text: effectiveSystemPrompt,
      cache_control: { type: "ephemeral" },
    });
    // Dynamic context (user profile, time, mood) — changes per turn
    const dynamicPart =
      dynamicContext +
      (adaptive.mode !== "neutral" ? "\n\n" + adaptive.instruction : "");
    if (dynamicPart) {
      systemBlocks.push({ type: "text", text: dynamicPart });
    }
    // Fire-and-forget logging
    logEmotion(session.tenantId, emotionState, userMessage, {
      sessionId: session.id,
      personalityAdaptedTo: adaptive.mode,
    }).catch((err) => {
      logger.error("[ConversationHandler] Emotion logging failed:", {
        error: err instanceof Error ? err.message : String(err),
        tenantId: session.tenantId,
      });
    });

    // Phase 2: background voice prosody enrichment (non-blocking)
    if (options?.recordingUrl) {
      enrichWithVoiceProsody(
        session.tenantId,
        session.id,
        userMessage,
        options.recordingUrl,
        adaptive.mode,
      ).catch((err) => {
        logger.error("[ConversationHandler] Voice prosody enrichment failed:", {
          error: err instanceof Error ? err.message : String(err),
          tenantId: session.tenantId,
        });
      });
    }
  }

  // Build messages array from pre-fetched thread context (loaded in parallel above)
  let messages: Anthropic.MessageParam[];

  if (options?.skipThreadAppend && threadMessages.length > 0) {
    // Gateway already appended this user message to the thread.
    messages = threadMessages;
  } else {
    messages = [...threadMessages, { role: "user", content: userMessage }];
  }

  // Safety: ensure messages end with a user message
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages = [...messages, { role: "user", content: userMessage }];
  }

  if (threadMessages.length > 0) {
    logger.info(
      `[ConversationHandler] Loaded ${threadMessages.length} messages from unified thread (skipThreadAppend=${!!options?.skipThreadAppend})`,
    );
  }

  const toolsUsed: string[] = [];

  try {
    // Fire thinking step: context loaded, generating response
    options?.callback?.onThinkingStep?.("Ładuję kontekst", "done");
    options?.callback?.onThinkingStep?.("Generuję odpowiedź", "running");

    // max_tokens: same for all channels (system prompt tells voice to be concise)
    // system + tools use cache_control for ~6K cached tokens (90% input savings)
    const effectiveMaxTokens = session.maxTokens || maxTokensOverride || 300;

    logger.info("[ConversationHandler] Calling AI:", {
      model: resolvedModel,
      provider: useGemini ? "gemini" : "anthropic",
      temperature: userTemperature,
      maxTokens: effectiveMaxTokens,
      messageCount: messages.length,
      threadMessages: threadMessages.length,
      threadFiltered:
        rawThreadMessages.length - threadMessages.length + " poisoned removed",
      tenantId: session.tenantId,
      modelPreference: chatModelPref,
      channel: options?.channel || "web_chat",
      toolCount: activeTools.length,
      hasPromptOverride: !!systemPromptOverride,
      streaming: !!options?.onTextDelta,
    });

    // ── Agent Loop Context (for Anthropic paths: streaming + fallback) ──
    const agentConfig = WEB_AGENT_CONFIG;
    const agentCtx = {
      anthropic,
      model: isGeminiModel(resolvedModel)
        ? DEFAULT_CLAUDE_MODEL
        : resolvedModel,
      temperature: userTemperature,
      systemBlocks,
      tools: activeTools,
      tenantId: session.tenantId,
      sessionId: session.id,
      executeTool,
      callback: options?.callback,
    };

    // ── STREAMING PATH (voice with onTextDelta) — always Anthropic ──
    if (options?.onTextDelta) {
      const streamConfig = {
        ...agentConfig,
        followUpMaxTokens: session.maxTokens || 1024,
      };

      const claudeStartTime = Date.now();
      const result = await runAgentLoopStreaming(
        messages,
        streamConfig,
        agentCtx,
        options.onTextDelta,
      );

      const totalMs = Date.now() - preStartTime;
      const claudeMs = Date.now() - claudeStartTime;
      logger.info("[ConversationHandler] Streaming agent loop done:", {
        rounds: result.roundsExecuted,
        tools: result.toolsUsed,
        budgetExhausted: result.budgetExhausted,
        tenantId: session.tenantId,
        preProcessMs: totalMs - claudeMs,
        claudeMs,
        totalMs,
      });

      return {
        text: result.text,
        toolsUsed: result.toolsUsed,
        shouldEndCall: false,
        emotion: emotionState,
      };
    }

    // ── NON-STREAMING PATH ──

    // ── GEMINI PATH (web chat default) ──
    if (useGemini) {
      try {
        const geminiStartTime = Date.now();
        const geminiResult = await callGeminiChatWithTools(
          {
            model: resolvedModel,
            systemBlocks,
            messages: messages as any, // Anthropic.MessageParam[] → translated inside provider
            tools: activeTools,
            maxTokens: session.maxTokens || maxTokensOverride || 1024,
            temperature: userTemperature,
          },
          executeTool,
          session.tenantId,
          options?.callback?.onToolStart,
          options?.callback?.onToolEnd,
        );

        logger.info("[ConversationHandler] Gemini done:", {
          tools: geminiResult.toolsUsed,
          textLength: geminiResult.text.length,
          tenantId: session.tenantId,
          durationMs: Date.now() - geminiStartTime,
        });

        options?.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

        return {
          text: geminiResult.text,
          toolsUsed: geminiResult.toolsUsed,
          shouldEndCall: false,
          emotion: emotionState,
        };
      } catch (geminiError) {
        const gemErr = geminiError as Error & {
          status?: number;
          statusText?: string;
        };
        logger.error(
          "[ConversationHandler] Gemini failed, falling back to Anthropic:",
          {
            error: gemErr.message,
            status: gemErr.status,
            statusText: gemErr.statusText,
            name: gemErr.name,
            tenantId: session.tenantId,
            toolCount: activeTools.length,
            messageCount: messages.length,
            modelUsed: resolvedModel,
            stack: gemErr.stack?.split("\n").slice(0, 5).join("\n"),
          },
        );
        // Fall through to Anthropic path below
      }
    }

    // ── ANTHROPIC PATH (explicit user selection OR Gemini fallback) ──
    const anthropicModel = isGeminiModel(resolvedModel)
      ? DEFAULT_CLAUDE_MODEL
      : resolvedModel;
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: effectiveMaxTokens,
      temperature: userTemperature,
      system: systemBlocks,
      messages,
      tools: activeTools,
    });

    logger.info("[ConversationHandler] First response:", {
      stopReason: response.stop_reason,
      contentTypes: response.content.map((c) => c.type),
      tenantId: session.tenantId,
      model: anthropicModel,
    });

    // Run agent loop (handles multi-step tool execution)
    const loopConfig = {
      ...agentConfig,
      followUpMaxTokens: session.maxTokens || maxTokensOverride || 1024,
    };

    const agentResult = await runAgentLoop(response, messages, loopConfig, {
      ...agentCtx,
      model: anthropicModel,
    });

    logger.info("[ConversationHandler] Agent loop done:", {
      rounds: agentResult.roundsExecuted,
      tools: agentResult.toolsUsed,
      budgetExhausted: agentResult.budgetExhausted,
      tenantId: session.tenantId,
    });

    // Mark generating as done
    options?.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

    return {
      text: agentResult.text,
      toolsUsed: agentResult.toolsUsed,
      shouldEndCall: false,
      emotion: emotionState,
    };
  } catch (error) {
    const err = error as Error & {
      status?: number;
      error?: { type?: string; message?: string };
    };
    logger.error("[ConversationHandler] Claude API error:", {
      status: err.status,
      type: err.error?.type,
      message: err.message,
      anthropicMessage: err.error?.message,
      tenantId: session.tenantId,
      sessionId: session.id,
      messageCount: messages.length,
      lastTwoRoles: messages.slice(-2).map((m) => m.role),
      hasConsecutiveSameRole: messages.some(
        (m, i) => i > 0 && m.role === messages[i - 1].role,
      ),
      stack: err.stack?.split("\n").slice(0, 3).join("\n"),
    });

    // ── OpenAI fallback when Anthropic fails ──
    // Try fallback for ANY error (not just specific HTTP statuses)
    const canFallback = true;

    if (canFallback) {
      const openaiKey =
        aiConfig?.providers?.openai?.api_key || process.env.OPENAI_API_KEY;
      const openaiEnabled = aiConfig?.providers?.openai?.enabled !== false;

      if (openaiKey && openaiEnabled) {
        try {
          logger.info(
            "[ConversationHandler] Anthropic failed, falling back to OpenAI",
            { anthropicStatus: err.status, tenantId: session.tenantId },
          );
          options?.callback?.onThinkingStep?.(
            "Przełączam na zapasowy model AI",
            "running",
          );

          const result = await callOpenAIChatWithTools(
            {
              apiKey: openaiKey,
              model: aiConfig?.providers?.openai?.model || "gpt-4o",
              systemBlocks,
              messages,
              tools: activeTools,
              maxTokens: session.maxTokens || maxTokensOverride || 200,
              temperature: userTemperature,
            },
            executeTool,
            session.tenantId,
            options?.callback?.onToolStart,
            options?.callback?.onToolEnd,
          );

          options?.callback?.onThinkingStep?.(
            "Przełączam na zapasowy model AI",
            "done",
          );

          return {
            text: result.text || "Przepraszam, nie zrozumiałem.",
            toolsUsed: result.toolsUsed,
            shouldEndCall: false,
            emotion: emotionState,
          };
        } catch (openaiError) {
          logger.error("[ConversationHandler] OpenAI fallback also failed:", {
            error:
              openaiError instanceof Error
                ? openaiError.message
                : String(openaiError),
            tenantId: session.tenantId,
          });
        }
      }
    }

    // ── Emergency Gemini fallback (no tools, just conversation) ──
    try {
      const geminiKey = process.env.GOOGLE_AI_API_KEY;
      if (geminiKey) {
        logger.info(
          "[ConversationHandler] All primary providers failed — emergency Gemini fallback (no tools)",
          { tenantId: session.tenantId, originalError: err.message },
        );
        options?.callback?.onThinkingStep?.("Tryb awaryjny", "running");

        const { GoogleGenAI } = await import("@google/genai");
        const emergencyAI = new GoogleGenAI({ apiKey: geminiKey });
        const emergencySystem = systemBlocks.map((b) => b.text).join("\n\n");
        const emergencyContents = messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [
            {
              text:
                typeof m.content === "string"
                  ? m.content
                  : JSON.stringify(m.content),
            },
          ],
        }));

        const emergencyResponse = await emergencyAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: emergencyContents as any,
          config: {
            systemInstruction: emergencySystem.slice(0, 8000),
            temperature: userTemperature,
            maxOutputTokens: session.maxTokens || 1024,
          },
        });

        const emergencyText = emergencyResponse.text || "";
        options?.callback?.onThinkingStep?.("Tryb awaryjny", "done");

        if (emergencyText) {
          return {
            text: emergencyText,
            toolsUsed: ["emergency_fallback"],
            shouldEndCall: false,
            emotion: emotionState,
          };
        }
      }
    } catch (emergencyError) {
      logger.error(
        "[ConversationHandler] Emergency Gemini fallback also failed:",
        {
          error:
            emergencyError instanceof Error
              ? emergencyError.message
              : String(emergencyError),
          tenantId: session.tenantId,
        },
      );
    }

    // All providers truly failed — show specific error message
    let userMessage = "Przepraszam, wystąpił problem. Spróbuj ponownie.";
    if (err.status === 400 && err.error?.message?.includes("credit balance")) {
      userMessage =
        "Serwis AI jest chwilowo niedostępny (problem z kontem API). Sprawdź dostawców w Ustawienia → Dostawcy AI.";
    } else if (err.status === 429) {
      userMessage =
        "Zbyt wiele zapytań jednocześnie. Odczekaj chwilę i spróbuj ponownie.";
    } else if (err.status === 529 || err.status === 503) {
      userMessage =
        "Serwis AI jest chwilowo przeciążony. Spróbuj ponownie za minutę.";
    }

    return {
      text: userMessage,
      toolsUsed: [],
      shouldEndCall: false,
    };
  }
}

// ============================================================================
// STREAMING VOICE PIPELINE — now delegated to AgentExecutionLoop
// ============================================================================
// processWithStreaming() removed — replaced by runAgentLoopStreaming() in agent-loop.ts

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate personalized greeting for call start
 */
export async function generateGreeting(tenantId: string): Promise<string> {
  const supabase = getServiceSupabase();

  // Get user profile
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("name, preferred_name, assistant_name")
    .eq("id", tenantId)
    .single();

  const userName = tenant?.preferred_name || tenant?.name;
  const assistantName = tenant?.assistant_name || "IORS";

  // Sprawdź czy user ma historię (powracający vs nowy)
  const threadContext = await getThreadContext(tenantId, 5);
  const isReturningUser = threadContext.length > 0;

  if (isReturningUser && userName) {
    // Powracający user z imieniem
    return `Cześć ${userName}! Miło znów słyszeć. W czym mogę pomóc?`;
  } else if (isReturningUser) {
    // Powracający user bez imienia
    return `Cześć! Miło Cię znów słyszeć. W czym mogę pomóc?`;
  } else if (userName) {
    // Nowy user z imieniem
    return `Cześć ${userName}! Tu ${assistantName}. W czym mogę pomóc?`;
  }

  // Nowy user bez imienia
  return `Cześć! Tu ${assistantName}, twój osobisty asystent. W czym mogę pomóc?`;
}

/**
 * Find tenant by phone number
 */
export async function findTenantByPhone(
  phone: string,
): Promise<{ id: string; name?: string } | null> {
  const supabase = getServiceSupabase();

  // Normalize phone number (remove spaces, +, etc.)
  const normalizedPhone = phone.replace(/\s+/g, "").replace(/^\+/, "");

  // Single query with OR — replaces 3 sequential lookups (~600ms → ~200ms)
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("id, name")
    .or(
      `phone.eq.${phone},phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone}`,
    )
    .limit(1)
    .single();

  return tenant || null;
}

// ============================================================================
// VOICE PROSODY ENRICHMENT (Phase 2 — background, non-blocking)
// ============================================================================

async function enrichWithVoiceProsody(
  tenantId: string,
  sessionId: string,
  messageText: string,
  recordingUrl: string,
  adaptedTo: string,
): Promise<void> {
  try {
    const { analyzeVoiceProsody } =
      await import("@/lib/emotion/voice-analyzer");
    const voiceFeatures = await analyzeVoiceProsody(recordingUrl);
    if (!voiceFeatures) return;

    // Re-run emotion analysis with voice features for fused result
    const fusedEmotion = await analyzeEmotion(messageText, voiceFeatures);

    // Log the enriched emotion (supplements the text-only log)
    await logEmotion(tenantId, fusedEmotion, messageText, {
      sessionId,
      personalityAdaptedTo: adaptedTo,
    });

    logger.info("[ConversationHandler] Voice-enriched emotion logged:", {
      source: fusedEmotion.source,
      speechRate: voiceFeatures.speech_rate,
      pauses: voiceFeatures.pause_frequency,
    });
  } catch (error) {
    logger.error("[ConversationHandler] Voice enrichment failed:", {
      error: error instanceof Error ? error.message : error,
    });
  }
}
