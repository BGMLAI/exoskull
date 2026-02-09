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
} from "@/lib/iors/tools";
import { buildDynamicContext } from "./dynamic-context";
import { appendMessage, getThreadContext } from "../unified-thread";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { logEmotion } from "@/lib/emotion/logger";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
import { logActivities } from "@/lib/activity-log";
// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const CLAUDE_MODEL = "claude-sonnet-4-20250514"; // Fast + capable

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
}

/** Callback for real-time processing events (used by SSE stream) */
export interface ProcessingCallback {
  onThinkingStep?: (step: string, status: "running" | "done") => void;
  onToolStart?: (toolName: string) => void;
  onToolEnd?: (toolName: string, durationMs: number) => void;
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
    console.error("[ConversationHandler] Failed to create session:", error);
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
    console.error("[ConversationHandler] Failed to update session:", error);
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
          source_type: sourceType,
          source_id: sessionId,
        });
      }
      await appendMessage(resolvedTenantId, {
        role: "assistant",
        content: assistantMessage,
        channel,
        source_type: sourceType,
        source_id: sessionId,
      });
    } catch (threadError) {
      console.error(
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
    console.error("[ConversationHandler] Failed to end session:", error);
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
 * Process user message and generate Claude response
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
  },
): Promise<ConversationResult> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Check for end call phrases (skip during birth flow etc.)
  if (!session.skipEndCallDetection && shouldEndCall(userMessage)) {
    return {
      text: "Do usłyszenia! Miłego dnia!",
      toolsUsed: [],
      shouldEndCall: true,
    };
  }

  // Fire thinking step: loading context
  options?.callback?.onThinkingStep?.("Ładuję kontekst", "running");

  // Build dynamic context + emotion + thread context — ALL parallel
  const [dynamicContext, emotionState, rawThreadMessages] = await Promise.all([
    buildDynamicContext(session.tenantId),
    analyzeEmotion(userMessage),
    getThreadContext(session.tenantId, 50).catch((err) => {
      console.error("[ConversationHandler] Thread context failed:", err);
      return [] as { role: "user" | "assistant"; content: string }[];
    }),
  ]);

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

  // Tau Matrix — fire-and-forget 4-quadrant emotion classification
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

  // Crisis check (blocks if detected — safety requirement)
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
        console.error(
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
          console.error("[ConversationHandler] Emergency escalation failed:", {
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
    // Static prompt (~2500 tokens) — identical across all turns → CACHE
    systemBlocks.push({
      type: "text",
      text: STATIC_SYSTEM_PROMPT,
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
      console.error("[ConversationHandler] Emotion logging failed:", {
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
        console.error(
          "[ConversationHandler] Voice prosody enrichment failed:",
          {
            error: err instanceof Error ? err.message : String(err),
            tenantId: session.tenantId,
          },
        );
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

    // First API call (max_tokens low for voice = short, fast responses)
    // system + tools use cache_control for ~6K cached tokens (90% input savings)
    logger.info("[ConversationHandler] Calling Claude API:", {
      model: CLAUDE_MODEL,
      maxTokens: session.maxTokens || maxTokensOverride || 200,
      messageCount: messages.length,
      threadFiltered:
        rawThreadMessages.length - threadMessages.length + " poisoned removed",
      tenantId: session.tenantId,
    });

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: session.maxTokens || maxTokensOverride || 200,
      system: systemBlocks,
      messages,
      tools: IORS_TOOLS,
    });

    logger.info("[ConversationHandler] First response:", {
      stopReason: response.stop_reason,
      contentTypes: response.content.map((c) => c.type),
      tenantId: session.tenantId,
    });

    // Check for tool use
    const toolUseBlocks = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );

    if (toolUseBlocks.length > 0) {
      // Fire thinking step: tools detected
      options?.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

      // Execute all tool calls in PARALLEL (was sequential)
      const toolExecutions = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          options?.callback?.onToolStart?.(toolUse.name);
          const toolStart = Date.now();
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, any>,
            session.tenantId,
          );
          options?.callback?.onToolEnd?.(toolUse.name, Date.now() - toolStart);
          return { toolUse, result };
        }),
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = toolExecutions.map(
        ({ toolUse, result }) => ({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result,
        }),
      );

      for (const { toolUse } of toolExecutions) {
        toolsUsed.push(toolUse.name);
      }

      // Log all tool executions to activity feed
      logActivities(
        toolUseBlocks.map((toolUse) => ({
          tenantId: session.tenantId,
          actionType: "tool_call" as const,
          actionName: toolUse.name,
          description: `Narzedzie: ${toolUse.name}`,
          source: "conversation",
          metadata: {
            toolInput: Object.keys(toolUse.input as Record<string, unknown>),
          },
        })),
      );

      // Multi-turn tool loop: allow Claude to call additional tools (max 3 rounds)
      const followUpMaxTokens = session.maxTokens || maxTokensOverride || 150;
      let currentMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: toolResults },
      ];

      const MAX_TOOL_ROUNDS = 3;
      let finalResponse: Anthropic.Message | null = null;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const followUp = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: followUpMaxTokens,
          system: systemBlocks,
          messages: currentMessages,
          tools: IORS_TOOLS,
        });

        const newToolBlocks = followUp.content.filter(
          (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
        );

        // No more tool calls or last round — use this as final response
        if (newToolBlocks.length === 0 || round === MAX_TOOL_ROUNDS - 1) {
          finalResponse = followUp;
          break;
        }

        // Execute additional tool calls
        const newResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          newToolBlocks.map(async (toolUse) => {
            options?.callback?.onToolStart?.(toolUse.name);
            const toolStart = Date.now();
            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              session.tenantId,
            );
            toolsUsed.push(toolUse.name);
            options?.callback?.onToolEnd?.(
              toolUse.name,
              Date.now() - toolStart,
            );
            return {
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: result,
            };
          }),
        );

        // Log additional tool executions
        logActivities(
          newToolBlocks.map((toolUse) => ({
            tenantId: session.tenantId,
            actionType: "tool_call" as const,
            actionName: toolUse.name,
            description: `Narzedzie: ${toolUse.name}`,
            source: "conversation",
            metadata: {
              toolInput: Object.keys(toolUse.input as Record<string, unknown>),
            },
          })),
        );

        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: followUp.content },
          { role: "user" as const, content: newResults },
        ];
      }

      // Extract text from final response
      const textContent = finalResponse?.content.find(
        (c): c is Anthropic.TextBlock => c.type === "text",
      );
      const text = textContent?.text?.trim();

      if (!text) {
        logger.warn(
          "[ConversationHandler] Follow-up has no text — smart fallback:",
          {
            contentTypes: finalResponse?.content.map((c) => c.type),
            stopReason: finalResponse?.stop_reason,
            toolsUsed,
            tenantId: session.tenantId,
          },
        );
      }

      // Smart fallback: describe what was done instead of generic "Zrobione!"
      let responseText: string;
      if (text) {
        responseText = text;
      } else if (toolsUsed.length > 0) {
        responseText = `Gotowe. Użyłem: ${toolsUsed.join(", ")}.`;
      } else {
        responseText =
          "Przepraszam, nie mogłem przetworzyć tej wiadomości. Spróbuj ponownie.";
      }

      return {
        text: responseText,
        toolsUsed,
        shouldEndCall: false,
      };
    }

    // No tool use — mark generating as done
    options?.callback?.onThinkingStep?.("Generuję odpowiedź", "done");

    // No tool use, return text directly
    const textContent = response.content.find(
      (c): c is Anthropic.TextBlock => c.type === "text",
    );

    return {
      text: textContent?.text || "Przepraszam, nie zrozumiałem.",
      toolsUsed: [],
      shouldEndCall: false,
    };
  } catch (error) {
    const err = error as Error & {
      status?: number;
      error?: { type?: string; message?: string };
    };
    console.error("[ConversationHandler] Claude API error:", {
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
    return {
      text: "Przepraszam, wystąpił problem. Spróbuj ponownie.",
      toolsUsed: [],
      shouldEndCall: false,
    };
  }
}

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
    console.error("[ConversationHandler] Voice enrichment failed:", {
      error: error instanceof Error ? error.message : error,
    });
  }
}
