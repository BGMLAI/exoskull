/**
 * Gemini Live API Provider
 *
 * Manages real-time audio sessions with Gemini's native audio model.
 * Replaces 3 separate services (Deepgram STT + LLM + Cartesia TTS)
 * with a single native audio WebSocket connection.
 *
 * Model: gemini-2.5-flash-native-audio-preview-12-2025
 * Input:  PCM16 16kHz mono
 * Output: PCM16 24kHz mono
 *
 * Features:
 * - Native bidirectional audio (no separate STT/TTS)
 * - IORS tool calling (function declarations)
 * - Input/output transcription for logging
 * - Session resumption (survives reconnects for 2h)
 * - Context window compression (extends 15min limit)
 * - VAD (automatic voice activity detection)
 * - Affective dialog (emotion-aware responses)
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const VOICE_NAME = "Orus"; // Male voice, Polish-capable, natural

/** Callbacks for Gemini Live session events */
export interface GeminiLiveCallbacks {
  /** Raw PCM16 24kHz audio from model */
  onAudio: (pcm16Data: Buffer) => void;
  /** Text content from model (rare in audio mode) */
  onText?: (text: string) => void;
  /** Transcription of user's audio input */
  onInputTranscription: (text: string) => void;
  /** Transcription of model's audio output */
  onOutputTranscription: (text: string) => void;
  /** Model finished its turn */
  onTurnComplete: () => void;
  /** User interrupted model (VAD detected speech during output) */
  onInterrupted: () => void;
  /** Error occurred */
  onError: (error: Error) => void;
  /** Connection closed */
  onClose: () => void;
}

/** Tool executor function signature */
export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
) => Promise<string>;

/** Managed Gemini Live session */
export interface ManagedLiveSession {
  /** Send PCM16 16kHz audio to Gemini */
  sendAudio: (pcm16_16k: Buffer) => void;
  /** Send text as user turn */
  sendText: (text: string) => void;
  /** Signal end of audio input (mic off) */
  endAudioStream: () => void;
  /** Close the session */
  close: () => void;
  /** Current resumption handle (for reconnect) */
  getResumeHandle: () => string | undefined;
  /** Session creation timestamp */
  createdAt: number;
  /** Tenant ID */
  tenantId: string;
}

/** Options for creating a Gemini Live session */
export interface CreateLiveSessionOptions {
  tenantId: string;
  systemPrompt: string;
  /** Gemini FunctionDeclaration format (use translateToolsForLive to convert) */
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  executeTool: ToolExecutor;
  callbacks: GeminiLiveCallbacks;
  /** Resume a previous session */
  resumeHandle?: string;
  /** Override voice name */
  voiceName?: string;
}

// ============================================================================
// TOOL FORMAT TRANSLATION
// ============================================================================

/**
 * Convert Anthropic-format tools to Gemini FunctionDeclaration format.
 * Same logic as gemini-chat-provider.ts translateTools().
 */
export function translateToolsForLive(
  anthropicTools: Array<{
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
  }>,
): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return anthropicTools
    .filter((t) => !!t.name)
    .map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      parameters: (tool.input_schema || {}) as Record<string, unknown>,
    }));
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new Gemini Live session with native audio.
 *
 * Returns a managed session with send/close methods.
 * Audio flows bidirectionally through the WebSocket.
 */
export async function createGeminiLiveSession(
  opts: CreateLiveSessionOptions,
): Promise<ManagedLiveSession> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("[GeminiLive] GOOGLE_AI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  let resumeHandle: string | undefined = opts.resumeHandle;
  const voiceName = opts.voiceName || VOICE_NAME;

  logger.info("[GeminiLive] Creating session:", {
    tenantId: opts.tenantId,
    model: LIVE_MODEL,
    voice: voiceName,
    toolCount: opts.tools?.length || 0,
    hasResumeHandle: !!opts.resumeHandle,
  });

  // Build tool declarations
  const toolsConfig =
    opts.tools && opts.tools.length > 0
      ? [{ functionDeclarations: opts.tools }]
      : undefined;

  // Connect to Gemini Live API
  const session = await ai.live.connect({
    model: LIVE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: opts.systemPrompt,
      tools: toolsConfig as any,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      } as any,
      // Enable transcription for logging
      inputAudioTranscription: {} as any,
      outputAudioTranscription: {} as any,
      // Extend session beyond 15min limit
      contextWindowCompression: {
        slidingWindow: {},
      } as any,
      // Enable session resumption
      sessionResumption: opts.resumeHandle
        ? ({ handle: opts.resumeHandle } as any)
        : ({} as any),
      // Emotion-aware responses
      enableAffectiveDialog: true,
    } as any,
    callbacks: {
      onopen: () => {
        logger.info("[GeminiLive] Connected:", {
          tenantId: opts.tenantId,
          voice: voiceName,
        });
      },
      onmessage: async (message: any) => {
        try {
          // Raw audio data (PCM16 24kHz)
          if (message.data) {
            const audioBuffer = Buffer.from(
              message.data instanceof Uint8Array ? message.data : message.data,
            );
            opts.callbacks.onAudio(audioBuffer);
          }

          // Server content
          const sc = message.serverContent;
          if (sc) {
            // Text content (rare in audio mode)
            const textPart = sc.modelTurn?.parts?.find((p: any) => p.text);
            if (textPart?.text) {
              opts.callbacks.onText?.(textPart.text);
            }

            // Turn complete
            if (sc.turnComplete) {
              opts.callbacks.onTurnComplete();
            }

            // Interrupted by user (VAD)
            if (sc.interrupted) {
              opts.callbacks.onInterrupted();
            }

            // Input transcription (what user said)
            if (sc.inputTranscription?.text) {
              opts.callbacks.onInputTranscription(sc.inputTranscription.text);
            }

            // Output transcription (what model said)
            if (sc.outputTranscription?.text) {
              opts.callbacks.onOutputTranscription(sc.outputTranscription.text);
            }
          }

          // Tool calls — execute and respond
          if (message.toolCall?.functionCalls) {
            await handleToolCalls(
              message.toolCall,
              session,
              opts.executeTool,
              opts.tenantId,
            );
          }

          // Tool call cancellation
          if (message.toolCallCancellation) {
            logger.info("[GeminiLive] Tool call cancelled:", {
              tenantId: opts.tenantId,
            });
          }

          // Session resumption handle update
          if (message.sessionResumptionUpdate?.handle) {
            resumeHandle = message.sessionResumptionUpdate.handle;
          }

          // GoAway — server about to terminate
          if (message.goAway) {
            logger.warn("[GeminiLive] GoAway received:", {
              tenantId: opts.tenantId,
              timeLeft: message.goAway.timeLeft,
            });
          }
        } catch (err) {
          console.error("[GeminiLive] Message handler error:", {
            error: err instanceof Error ? err.message : err,
            tenantId: opts.tenantId,
          });
          opts.callbacks.onError(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      },
      onerror: (e: any) => {
        console.error("[GeminiLive] WebSocket error:", {
          message: e?.message || e,
          tenantId: opts.tenantId,
        });
        opts.callbacks.onError(
          new Error(e?.message || "Gemini Live WebSocket error"),
        );
      },
      onclose: (e: any) => {
        logger.info("[GeminiLive] Connection closed:", {
          code: e?.code,
          reason: e?.reason,
          tenantId: opts.tenantId,
        });
        opts.callbacks.onClose();
      },
    },
  });

  const createdAt = Date.now();

  // Build managed session object
  const managedSession: ManagedLiveSession = {
    tenantId: opts.tenantId,
    createdAt,

    sendAudio(pcm16_16k: Buffer): void {
      try {
        session.sendRealtimeInput({
          audio: {
            data: pcm16_16k.toString("base64"),
            mimeType: "audio/pcm;rate=16000",
          },
        } as any);
      } catch (err) {
        console.error("[GeminiLive] sendAudio error:", {
          error: err instanceof Error ? err.message : err,
        });
      }
    },

    sendText(text: string): void {
      try {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text }] }],
        } as any);
      } catch (err) {
        console.error("[GeminiLive] sendText error:", {
          error: err instanceof Error ? err.message : err,
        });
      }
    },

    endAudioStream(): void {
      try {
        session.sendRealtimeInput({
          audioStreamEnd: true,
        } as any);
      } catch (err) {
        console.error("[GeminiLive] endAudioStream error:", {
          error: err instanceof Error ? err.message : err,
        });
      }
    },

    close(): void {
      try {
        session.close();
      } catch (err) {
        console.error("[GeminiLive] close error:", {
          error: err instanceof Error ? err.message : err,
        });
      }
    },

    getResumeHandle(): string | undefined {
      return resumeHandle;
    },
  };

  return managedSession;
}

// ============================================================================
// TOOL CALL HANDLING
// ============================================================================

async function handleToolCalls(
  toolCall: any,
  session: any,
  executeTool: ToolExecutor,
  tenantId: string,
): Promise<void> {
  const functionCalls = toolCall.functionCalls;
  if (!functionCalls || functionCalls.length === 0) return;

  const functionResponses: Array<{
    id: string;
    name: string;
    response: Record<string, unknown>;
  }> = [];

  // Execute tool calls (sequentially to avoid race conditions in voice)
  for (const fc of functionCalls) {
    const name = fc.name || "unknown";
    const input = (fc.args || {}) as Record<string, unknown>;

    logger.info("[GeminiLive] Tool call:", { name, tenantId });
    const startTime = Date.now();

    try {
      const result = await executeTool(name, input, tenantId);

      functionResponses.push({
        id: fc.id,
        name,
        response: { result },
      });

      logger.info("[GeminiLive] Tool result:", {
        name,
        durationMs: Date.now() - startTime,
        resultLength: result.length,
        tenantId,
      });
    } catch (err) {
      console.error("[GeminiLive] Tool execution error:", {
        name,
        error: err instanceof Error ? err.message : err,
        tenantId,
      });

      functionResponses.push({
        id: fc.id,
        name,
        response: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  // Send all tool responses back to Gemini
  try {
    session.sendToolResponse({ functionResponses });
  } catch (err) {
    console.error("[GeminiLive] sendToolResponse error:", {
      error: err instanceof Error ? err.message : err,
      tenantId,
    });
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if Gemini Live API is available.
 * Attempts to create and immediately close a minimal session.
 */
export async function checkGeminiLiveHealth(): Promise<boolean> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return false;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
      } as any,
      callbacks: {
        onmessage: () => {},
        onerror: () => {},
        onclose: () => {},
      },
    });

    session.close();
    return true;
  } catch {
    return false;
  }
}
