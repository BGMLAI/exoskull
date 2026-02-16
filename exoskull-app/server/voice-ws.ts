/**
 * Voice WebSocket Server
 *
 * Standalone WebSocket server with two modes:
 *
 * 1. ConversationRelay (default) — Twilio handles STT/TTS, we handle text
 *    Path: / (root)
 *    Protocol: JSON text messages (setup, prompt, interrupt, text, end)
 *
 * 2. Media Streams (Gemini Live) — Raw audio, Gemini handles everything
 *    Path: /media-streams
 *    Protocol: Twilio Media Streams (connected, media, stop)
 *    Requires: GEMINI_LIVE_ENABLED=true
 *
 * Run: npx tsx -r tsconfig-paths/register server/voice-ws.ts
 * Deploy: Railway / Render / any Node.js host
 */

// Register tsconfig paths FIRST so @/ aliases resolve in all transitive imports
import "tsconfig-paths/register";

import dotenv from "dotenv";
// Load .env.local (Next.js convention) then .env as fallback
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import {
  getOrCreateSession,
  updateSession,
  endSession,
  generateGreeting,
  findTenantByPhone,
} from "../lib/voice/conversation-handler";
import type { VoiceSession } from "../lib/voice/conversation-handler";
import { runExoSkullAgent } from "../lib/agent-sdk/exoskull-agent";
import { logger } from "../lib/logger";

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.VOICE_WS_PORT || "8080", 10);

// ============================================================================
// TYPES
// ============================================================================

/** Silence timeout — disconnect after 2s of no speech */
const SILENCE_DISCONNECT_MS = 2000;

/** Per-connection session state */
interface WSSession {
  callSid: string;
  tenantId: string;
  sessionId: string;
  voiceSession: VoiceSession;
  /** Local history for interruption handling */
  localMessages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Greeting text (passed as custom parameter, logged to session) */
  greeting?: string;
  /** Timer for silence-based disconnect */
  silenceTimer?: ReturnType<typeof setTimeout>;
}

/** Twilio ConversationRelay setup message */
interface SetupMessage {
  type: "setup";
  sessionId: string;
  callSid: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  callStatus: string;
  customParameters?: Record<string, string>;
}

/** Twilio ConversationRelay prompt message */
interface PromptMessage {
  type: "prompt";
  voicePrompt: string;
  lang?: string;
  last?: boolean;
}

/** Twilio ConversationRelay interrupt message */
interface InterruptMessage {
  type: "interrupt";
  utteranceUntilInterrupt: string;
  durationUntilInterruptMs: number;
}

// ============================================================================
// SESSION STORE
// ============================================================================

const sessions = new Map<WebSocket, WSSession>();

// ============================================================================
// HTTP SERVER + WEBSOCKET
// ============================================================================

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "exoskull-voice-ws",
        connections: sessions.size,
        uptime: process.uptime(),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

// Two WebSocket servers: one for ConversationRelay, one for Media Streams
const wss = new WebSocketServer({ noServer: true });
const wssMedia = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades by path
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host}`)
    .pathname;

  if (pathname === "/media-streams") {
    wssMedia.handleUpgrade(request, socket, head, (ws) => {
      wssMedia.emit("connection", ws, request);
    });
  } else {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});

// ============================================================================
// CONVERSATION RELAY WEBSOCKET HANDLERS (default path: /)
// ============================================================================

wss.on("connection", (ws: WebSocket, req) => {
  logger.info(
    "[VoiceWS] New ConversationRelay connection from:",
    req.socket.remoteAddress,
  );

  ws.on("message", async (raw: Buffer) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        case "setup":
          await handleSetup(ws, data as SetupMessage);
          break;

        case "prompt":
          await handlePrompt(ws, data as PromptMessage);
          break;

        case "interrupt":
          handleInterrupt(ws, data as InterruptMessage);
          break;

        case "dtmf":
          logger.info("[VoiceWS] DTMF:", data.digit);
          break;

        case "error":
          console.error("[VoiceWS] Twilio error:", data.description);
          break;

        default:
          logger.warn("[VoiceWS] Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("[VoiceWS] Message processing error:", {
        error: error instanceof Error ? error.message : error,
        stack:
          error instanceof Error
            ? error.stack?.split("\n").slice(0, 3)
            : undefined,
      });
    }
  });

  ws.on("close", (code, reason) => {
    const session = sessions.get(ws);
    if (session) {
      if (session.silenceTimer) clearTimeout(session.silenceTimer);
      endSession(session.sessionId).catch((e) =>
        console.error("[VoiceWS] End session error:", e),
      );
      sessions.delete(ws);
      logger.info("[VoiceWS] Connection closed:", {
        callSid: session.callSid,
        code,
        reason: reason?.toString(),
      });
    }
  });

  ws.on("error", (error) => {
    console.error("[VoiceWS] WebSocket error:", error.message);
  });
});

// ============================================================================
// SETUP — Initialize call session
// ============================================================================

async function handleSetup(ws: WebSocket, data: SetupMessage): Promise<void> {
  const { callSid, from, to, direction, customParameters } = data;

  logger.info("[VoiceWS] Setup:", { callSid, from, to, direction });

  // Resolve tenant from custom parameters or phone lookup
  let tenantId: string;
  if (customParameters?.tenantId) {
    tenantId = customParameters.tenantId;
  } else {
    // Inbound: lookup by caller's number
    // Outbound: lookup by called number (our Twilio number is 'from')
    const lookupPhone = direction === "inbound" ? from : to;
    const tenant = await findTenantByPhone(lookupPhone);
    tenantId = tenant?.id || "anonymous";
  }

  // Create/get session
  const voiceSession = await getOrCreateSession(callSid, tenantId);

  // Store greeting (passed as TwiML parameter for session logging)
  const greeting = customParameters?.greeting;

  sessions.set(ws, {
    callSid,
    tenantId,
    sessionId: voiceSession.id,
    voiceSession,
    localMessages: [],
    greeting,
  });

  // Log the greeting to session (ConversationRelay already spoke it via welcomeGreeting)
  if (greeting) {
    try {
      await updateSession(voiceSession.id, "[call_start]", greeting);
    } catch (e) {
      console.error("[VoiceWS] Greeting log error:", e);
    }
  }

  logger.info("[VoiceWS] Session ready:", {
    sessionId: voiceSession.id,
    tenantId,
    greeting: greeting?.substring(0, 50),
  });
}

// ============================================================================
// PROMPT — Process user speech
// ============================================================================

async function handlePrompt(ws: WebSocket, data: PromptMessage): Promise<void> {
  const wsSession = sessions.get(ws);
  if (!wsSession) {
    console.error("[VoiceWS] No session for prompt — ignoring");
    return;
  }

  // Reset silence timer — user is speaking
  if (wsSession.silenceTimer) {
    clearTimeout(wsSession.silenceTimer);
    wsSession.silenceTimer = undefined;
  }

  const userText = data.voicePrompt?.trim();

  // CRITICAL FIX: Don't hang up on empty speech!
  // Old Gather flow had: if (!userText) → endCall
  // ConversationRelay: just ignore empty prompts, Twilio keeps listening
  if (!userText) {
    logger.info("[VoiceWS] Empty prompt — ignoring (no disconnect)");
    return;
  }

  const startTime = Date.now();
  logger.info("[VoiceWS] User:", userText);

  try {
    // Stream response token-by-token via ConversationRelay.
    // Each token goes to Twilio → ElevenLabs TTS immediately.
    // User hears first words within ~0.5-1s instead of waiting 3-8s.
    let tokenCount = 0;

    const result = await runExoSkullAgent({
      tenantId: wsSession.tenantId,
      sessionId: wsSession.sessionId,
      userMessage: userText,
      channel: "voice",
      skipThreadAppend: true,
      timeoutMs: 35_000,
      onTextDelta: (delta) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "text", token: delta, last: false }));
          tokenCount++;
        }
      },
    });

    // Send final empty token with last:true to flush ConversationRelay buffer
    if (ws.readyState === WebSocket.OPEN) {
      // If nothing was streamed (e.g., tool-only response), send the full text
      if (tokenCount === 0 && result.text) {
        ws.send(
          JSON.stringify({ type: "text", token: result.text, last: true }),
        );
      } else {
        ws.send(JSON.stringify({ type: "text", token: "", last: true }));
      }
    }

    const processingMs = Date.now() - startTime;
    logger.info("[VoiceWS] Response:", {
      text: result.text.substring(0, 80),
      toolsUsed: result.toolsUsed,
      shouldEndCall: result.shouldEndCall,
      processingMs,
      streamed: tokenCount > 0,
      tokenCount,
    });

    // Update session in DB (unified thread + voice session)
    try {
      await updateSession(wsSession.sessionId, userText, result.text);
    } catch (e) {
      console.error("[VoiceWS] Session update error:", e);
    }

    // Track locally for interruption handling
    wsSession.localMessages.push({ role: "user", content: userText });
    wsSession.localMessages.push({ role: "assistant", content: result.text });

    // Handle end-call
    if (result.shouldEndCall && ws.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "end" }));
        }
      }, 500);
    } else {
      // Start silence timer — if user doesn't speak within 2s, disconnect
      wsSession.silenceTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          logger.info(
            "[VoiceWS] Silence timeout (2s) — ending call:",
            wsSession.callSid,
          );
          ws.send(
            JSON.stringify({
              type: "text",
              token: "Do usłyszenia!",
              last: true,
            }),
          );
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "end" }));
            }
          }, 1500);
        }
      }, SILENCE_DISCONNECT_MS);
    }
  } catch (error) {
    console.error("[VoiceWS] Prompt processing error:", {
      error: error instanceof Error ? error.message : error,
      tenantId: wsSession.tenantId,
      callSid: wsSession.callSid,
    });

    // Send error message to user (graceful degradation)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "text",
          token: "Przepraszam, coś poszło nie tak. Spróbuj jeszcze raz.",
          last: true,
        }),
      );
    }
  }
}

// ============================================================================
// INTERRUPT — User spoke over TTS
// ============================================================================

function handleInterrupt(ws: WebSocket, data: InterruptMessage): void {
  const wsSession = sessions.get(ws);
  if (!wsSession) return;

  const { utteranceUntilInterrupt, durationUntilInterruptMs } = data;

  logger.info("[VoiceWS] Interrupted:", {
    heardUpTo: utteranceUntilInterrupt?.substring(0, 60),
    afterMs: durationUntilInterruptMs,
  });

  // Truncate the last assistant message to what the user actually heard.
  // This ensures Claude knows exactly how far the caller got in the response,
  // so follow-up answers are contextually correct.
  if (utteranceUntilInterrupt && wsSession.localMessages.length > 0) {
    // Find the last assistant message containing the interrupted text
    for (let i = wsSession.localMessages.length - 1; i >= 0; i--) {
      const msg = wsSession.localMessages[i];
      if (
        msg.role === "assistant" &&
        msg.content.includes(utteranceUntilInterrupt)
      ) {
        const endIdx =
          msg.content.indexOf(utteranceUntilInterrupt) +
          utteranceUntilInterrupt.length;
        msg.content = msg.content.substring(0, endIdx) + "... [przerwane]";
        break;
      }
    }
  }
}

// ============================================================================
// MEDIA STREAMS WEBSOCKET HANDLER (path: /media-streams)
// Bridges Twilio raw mulaw audio ↔ Gemini Live native audio
// ============================================================================

interface MediaStreamSession {
  streamSid: string;
  callSid: string;
  tenantId: string;
  sessionId: string;
  geminiSession?: any; // ManagedLiveSession from gemini-live-provider
}

const mediaStreamSessions = new Map<WebSocket, MediaStreamSession>();

wssMedia.on("connection", (ws: WebSocket, req) => {
  logger.info("[MediaStreams] New connection from:", req.socket.remoteAddress);

  ws.on("message", async (raw: Buffer) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.event) {
        case "connected":
          logger.info("[MediaStreams] Connected:", data.protocol);
          break;

        case "start": {
          // Twilio sends stream metadata on start
          const { streamSid, callSid, customParameters } = data.start;
          const tenantId = customParameters?.tenantId || "anonymous";

          logger.info("[MediaStreams] Stream started:", {
            streamSid,
            callSid,
            tenantId,
          });

          // Create voice session in DB
          const voiceSession = await getOrCreateSession(callSid, tenantId);

          const msSession: MediaStreamSession = {
            streamSid,
            callSid,
            tenantId,
            sessionId: voiceSession.id,
          };
          mediaStreamSessions.set(ws, msSession);

          // Create Gemini Live session (lazy import to avoid loading when not needed)
          try {
            const { createGeminiLiveSession, translateToolsForLive } =
              await import("../lib/voice/gemini-live-provider");
            const { twilioToGemini, geminiToTwilio } =
              await import("../lib/voice/audio-codec");
            const { getExtensionToolDefinitions, executeExtensionTool } =
              await import("../lib/iors/tools");
            const { buildDynamicContext } =
              await import("../lib/voice/dynamic-context");

            // Build context and tools
            const dynamicCtx = await buildDynamicContext(tenantId);
            const toolDefs = getExtensionToolDefinitions();
            const geminiTools = translateToolsForLive(toolDefs as any);

            const systemPrompt = `${dynamicCtx.context}\n\nMówisz po polsku. Jesteś IORS — inteligentny asystent systemu ExoSkull. Odpowiadaj krótko i naturalnie (rozmowa głosowa).`;

            const geminiSession = await createGeminiLiveSession({
              tenantId,
              systemPrompt,
              tools: geminiTools,
              executeTool: async (name, input, tid) =>
                (await executeExtensionTool(name, input, tid)) ?? "",
              callbacks: {
                onAudio: (pcm16_24k: Buffer) => {
                  // Convert Gemini PCM16 24kHz → Twilio mulaw 8kHz
                  if (ws.readyState !== WebSocket.OPEN) return;
                  const mulaw = geminiToTwilio(pcm16_24k);

                  // Send as Twilio media message
                  ws.send(
                    JSON.stringify({
                      event: "media",
                      streamSid: msSession.streamSid,
                      media: {
                        payload: mulaw.toString("base64"),
                      },
                    }),
                  );
                },
                onInputTranscription: (text: string) => {
                  logger.info("[MediaStreams] User said:", text);
                  // Log to unified thread
                  updateSession(msSession.sessionId, text, "").catch(() => {});
                },
                onOutputTranscription: (text: string) => {
                  logger.info("[MediaStreams] IORS said:", text);
                  // Log to unified thread
                  updateSession(msSession.sessionId, "", text).catch(() => {});
                },
                onTurnComplete: () => {
                  logger.info("[MediaStreams] Turn complete");
                },
                onInterrupted: () => {
                  logger.info("[MediaStreams] Interrupted by user");
                  // Clear Twilio's audio buffer
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                      JSON.stringify({
                        event: "clear",
                        streamSid: msSession.streamSid,
                      }),
                    );
                  }
                },
                onError: (error: Error) => {
                  console.error("[MediaStreams] Gemini error:", error.message);
                },
                onClose: () => {
                  logger.info("[MediaStreams] Gemini session closed");
                },
              },
            });

            msSession.geminiSession = geminiSession;
            logger.info("[MediaStreams] Gemini Live session created:", {
              tenantId,
              toolCount: geminiTools.length,
            });
          } catch (geminiError) {
            console.error("[MediaStreams] Failed to create Gemini session:", {
              error:
                geminiError instanceof Error
                  ? geminiError.message
                  : geminiError,
            });
            // Fall back — close the stream, Twilio will handle gracefully
          }
          break;
        }

        case "media": {
          // Raw audio from Twilio (mulaw 8kHz, base64 encoded)
          const msSession = mediaStreamSessions.get(ws);
          if (!msSession?.geminiSession) break;

          const { twilioToGemini } = await import("../lib/voice/audio-codec");

          // Decode base64 mulaw → convert to PCM16 16kHz → send to Gemini
          const mulawBuffer = Buffer.from(data.media.payload, "base64");
          const pcm16_16k = twilioToGemini(mulawBuffer);
          msSession.geminiSession.sendAudio(pcm16_16k);
          break;
        }

        case "stop": {
          logger.info("[MediaStreams] Stream stopped");
          const msSession = mediaStreamSessions.get(ws);
          if (msSession?.geminiSession) {
            msSession.geminiSession.close();
          }
          if (msSession) {
            endSession(msSession.sessionId).catch(() => {});
            mediaStreamSessions.delete(ws);
          }
          break;
        }

        default:
          // Ignore unknown events (mark, dtmf, etc.)
          break;
      }
    } catch (error) {
      console.error("[MediaStreams] Message error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  });

  ws.on("close", () => {
    const msSession = mediaStreamSessions.get(ws);
    if (msSession) {
      if (msSession.geminiSession) {
        msSession.geminiSession.close();
      }
      endSession(msSession.sessionId).catch(() => {});
      mediaStreamSessions.delete(ws);
      logger.info("[MediaStreams] Connection closed:", {
        callSid: msSession.callSid,
      });
    }
  });

  ws.on("error", (error) => {
    console.error("[MediaStreams] WebSocket error:", error.message);
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const geminiLiveEnabled = process.env.GEMINI_LIVE_ENABLED === "true";

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  ExoSkull Voice WebSocket Server                 ║
║                                                  ║
║  Port: ${String(PORT).padEnd(41)}║
║  Health: http://localhost:${String(PORT).padEnd(24)}║
║                                                  ║
║  Modes:                                          ║
║  [${geminiLiveEnabled ? "✓" : " "}] /media-streams  (Gemini Live audio)     ║
║  [✓] /               (ConversationRelay text)    ║
║                                                  ║
║  Stack:                                          ║
║  ConvRelay: Deepgram STT + ElevenLabs TTS        ║
║  MediaStr:  Gemini 2.5 Flash Native Audio        ║
║  LLM:      Claude Agent SDK + 100+ IORS tools    ║
╚══════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[VoiceWS] SIGTERM — shutting down...");
  wss.close();
  server.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[VoiceWS] SIGINT — shutting down...");
  wss.close();
  server.close();
  process.exit(0);
});
