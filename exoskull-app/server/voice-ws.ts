/**
 * ConversationRelay WebSocket Server
 *
 * Standalone WebSocket server that bridges Twilio ConversationRelay with
 * the ExoSkull voice pipeline (Claude + 49 IORS tools + emotion analysis).
 *
 * Protocol:
 * - Receives TEXT from Twilio (Deepgram STT → transcript)
 * - Processes with Claude via processUserMessage()
 * - Sends TEXT back to Twilio (→ ElevenLabs TTS → audio to caller)
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
  processUserMessage,
  generateGreeting,
  findTenantByPhone,
} from "../lib/voice/conversation-handler";
import type { VoiceSession } from "../lib/voice/conversation-handler";
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

const wss = new WebSocketServer({ server });

// ============================================================================
// WEBSOCKET HANDLERS
// ============================================================================

wss.on("connection", (ws: WebSocket, req) => {
  logger.info("[VoiceWS] New connection from:", req.socket.remoteAddress);

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
    // Refresh voice session from DB (may have been updated by previous turns)
    const voiceSession = await getOrCreateSession(
      wsSession.callSid,
      wsSession.tenantId,
    );

    // Stream Claude response token-by-token via ConversationRelay.
    // Each token goes to Twilio → ElevenLabs TTS immediately.
    // User hears first words within ~0.5-1s instead of waiting 3-8s.
    let streamedText = "";
    let tokenCount = 0;

    const result = await processUserMessage(voiceSession, userText, {
      channel: "voice",
      onTextDelta: (delta) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "text", token: delta, last: false }));
          streamedText += delta;
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
// START SERVER
// ============================================================================

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  ExoSkull Voice WebSocket Server                 ║
║  ConversationRelay handler                       ║
║                                                  ║
║  Port: ${String(PORT).padEnd(41)}║
║  Health: http://localhost:${String(PORT).padEnd(24)}║
║                                                  ║
║  Stack:                                          ║
║  STT:  Deepgram Nova (via ConversationRelay)     ║
║  TTS:  ElevenLabs (via ConversationRelay)        ║
║  LLM:  Claude Haiku 3.5 + streaming + 18 tools  ║
║  EMO:  analyzeEmotion + crisis detection         ║
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
