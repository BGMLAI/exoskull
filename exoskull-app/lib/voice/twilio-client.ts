/**
 * Twilio Client Helper
 *
 * TwiML generation and outbound call management.
 * Used by /api/twilio/* routes.
 */

import twilio from "twilio";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";

import { logger } from "@/lib/logger";
// ============================================================================
// CONFIGURATION
// ============================================================================

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

// Type alias for language (Twilio uses specific enum)
type TwilioLanguage = Parameters<VoiceResponse["say"]>[0]["language"];

// Best available Polish voice for fallback (Amazon Polly Neural = highest quality)
// Polly.Maja = female neural, Polly.Jan = male neural
const TWILIO_POLISH_VOICE = "Polly.Maja"; // Female, neural - najlepsza jakość
const TWILIO_POLISH_LANGUAGE: TwilioLanguage = "pl-PL" as TwilioLanguage;

// Initialize Twilio client (lazy)
let twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio {
  if (!twilioClient) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error(
        "[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN",
      );
    }
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ============================================================================
// TWIML GENERATORS
// ============================================================================

export interface GatherOptions {
  audioUrl?: string;
  fallbackText?: string;
  actionUrl: string;
  language?: string;
  speechTimeout?: string | number;
}

/**
 * Generate TwiML for Gather (listen for speech)
 */
export function generateGatherTwiML(options: GatherOptions): string {
  const {
    audioUrl,
    fallbackText = "Słucham.",
    actionUrl,
    language = "pl-PL",
    speechTimeout = "auto",
  } = options;

  const response = new VoiceResponse();

  // Play audio or say text
  if (audioUrl) {
    response.play(audioUrl);
  } else if (fallbackText) {
    response.say(
      { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
      fallbackText,
    );
  }

  // Gather speech input
  response.gather({
    input: ["speech"],
    language: language as any,
    speechTimeout: String(speechTimeout),
    action: actionUrl,
  });

  // Fallback if no speech detected
  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Nie usłyszałem. Do usłyszenia!",
  );

  return response.toString();
}

/**
 * Generate TwiML for playing audio and gathering more speech
 */
export function generatePlayAndGatherTwiML(options: {
  audioUrl: string;
  actionUrl: string;
  language?: string;
}): string {
  const { audioUrl, actionUrl, language = "pl-PL" } = options;

  const response = new VoiceResponse();

  response.play(audioUrl);

  // First gather attempt
  response.gather({
    input: ["speech"],
    language: language as any,
    speechTimeout: "auto",
    action: actionUrl,
  });

  // If no input, ask again
  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Czy jest coś jeszcze?",
  );

  response.gather({
    input: ["speech"],
    language: language as any,
    speechTimeout: "3",
    action: actionUrl,
  });

  // Final goodbye
  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Do usłyszenia!",
  );

  return response.toString();
}

/**
 * Generate TwiML for ending the call
 */
export function generateEndCallTwiML(options?: {
  audioUrl?: string;
  farewellText?: string;
  language?: string;
}): string {
  const { audioUrl, farewellText = "Do usłyszenia!" } = options || {};

  const response = new VoiceResponse();

  if (audioUrl) {
    response.play(audioUrl);
  } else {
    response.say(
      { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
      farewellText,
    );
  }

  response.hangup();

  return response.toString();
}

/**
 * Generate TwiML for error scenarios
 */
export function generateErrorTwiML(): string {
  const response = new VoiceResponse();
  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Przepraszam, wystąpił błąd. Spróbuj ponownie później.",
  );
  response.hangup();
  return response.toString();
}

/**
 * Generate TwiML for Say + Gather (when TTS URL not available)
 */
export function generateSayAndGatherTwiML(options: {
  text: string;
  actionUrl: string;
  language?: string;
}): string {
  const { text, actionUrl, language = "pl-PL" } = options;

  const response = new VoiceResponse();

  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    text,
  );

  response.gather({
    input: ["speech"],
    language: language as any,
    speechTimeout: "auto",
    action: actionUrl,
  });

  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Czy jest coś jeszcze?",
  );

  response.gather({
    input: ["speech"],
    language: language as any,
    speechTimeout: "3",
    action: actionUrl,
  });

  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Do usłyszenia!",
  );

  return response.toString();
}

// ============================================================================
// CONVERSATION RELAY — Real-time WebSocket voice pipeline
// ============================================================================

export interface ConversationRelayOptions {
  /** WebSocket server URL (wss://) */
  wsUrl: string;
  /** Personalized welcome greeting text (spoken immediately via ElevenLabs TTS) */
  welcomeGreeting?: string;
  /** ElevenLabs voice ID */
  voiceId?: string;
  /** Language code for STT and TTS */
  language?: string;
  /** Action URL for post-call callback */
  actionUrl?: string;
  /** Custom parameters passed to WS setup message */
  customParameters?: Record<string, string>;
  /** Speech recognition hints (comma-separated keywords) */
  hints?: string;
}

/**
 * Generate TwiML for ConversationRelay — real-time voice via WebSocket.
 *
 * Twilio handles the entire audio pipeline:
 * - STT: Deepgram Nova (streaming Polish)
 * - TTS: ElevenLabs (natural Polish voice)
 * - Turn detection, interruptions, buffer management
 *
 * Our WebSocket server only sends/receives TEXT.
 */
export function generateConversationRelayTwiML(
  options: ConversationRelayOptions,
): string {
  const {
    wsUrl,
    welcomeGreeting,
    voiceId,
    language = "pl",
    actionUrl,
    customParameters,
    hints,
  } = options;

  const response = new VoiceResponse();

  const connectAttrs: Record<string, string> = {};
  if (actionUrl) {
    connectAttrs.action = actionUrl;
  }

  const connect = response.connect(connectAttrs);

  // Build ConversationRelay attributes
  const crAttrs: Record<string, string | boolean> = {
    url: wsUrl,
    ttsProvider: "ElevenLabs",
    transcriptionProvider: "Deepgram",
    language,
    interruptible: true,
    dtmfDetection: true,
  };

  if (welcomeGreeting) {
    crAttrs.welcomeGreeting = welcomeGreeting;
  }

  if (voiceId) {
    crAttrs.voice = voiceId;
  }

  if (hints) {
    crAttrs.hints = hints;
  }

  const conversationRelay = connect.conversationRelay(crAttrs as any);

  // Pass custom parameters to WebSocket setup message
  if (customParameters) {
    for (const [name, value] of Object.entries(customParameters)) {
      conversationRelay.parameter({ name, value });
    }
  }

  return response.toString();
}

// ============================================================================
// MEDIA STREAMS — Raw audio via WebSocket (for Gemini Live native audio)
// ============================================================================

export interface MediaStreamsOptions {
  /** WebSocket server URL (wss://) — must handle raw audio */
  wsUrl: string;
  /** Action URL for post-call callback */
  actionUrl?: string;
  /** Custom parameters passed to WS connected message */
  customParameters?: Record<string, string>;
}

/**
 * Generate TwiML for Media Streams — raw audio via WebSocket.
 *
 * Unlike ConversationRelay (which handles STT/TTS and sends text),
 * Media Streams sends raw mulaw 8kHz audio. Our server handles all
 * processing (conversion to PCM16 → Gemini Live → back to mulaw).
 *
 * Used when GEMINI_LIVE_ENABLED=true for native audio pipeline.
 */
export function generateMediaStreamsTwiML(
  options: MediaStreamsOptions,
): string {
  const { wsUrl, actionUrl, customParameters } = options;

  const response = new VoiceResponse();

  // Brief greeting via Twilio TTS while Gemini Live connects
  response.say(
    { voice: TWILIO_POLISH_VOICE, language: TWILIO_POLISH_LANGUAGE },
    "Łączę.",
  );

  const connectAttrs: Record<string, string> = {};
  if (actionUrl) {
    connectAttrs.action = actionUrl;
  }

  const connect = response.connect(connectAttrs);

  // Start bidirectional media stream
  const stream = connect.stream({ url: wsUrl });

  // Pass custom parameters
  if (customParameters) {
    for (const [name, value] of Object.entries(customParameters)) {
      stream.parameter({ name, value });
    }
  }

  return response.toString();
}

// ============================================================================
// OUTBOUND CALLS
// ============================================================================

export interface OutboundCallOptions {
  to: string;
  webhookUrl: string;
  statusCallbackUrl?: string;
  timeout?: number;
}

/**
 * Initiate an outbound call
 */
export async function makeOutboundCall(options: OutboundCallOptions) {
  const { to, webhookUrl, statusCallbackUrl, timeout = 30 } = options;

  const client = getClient();

  try {
    const call = await client.calls.create({
      to,
      from: TWILIO_PHONE_NUMBER,
      url: webhookUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout,
    });

    logger.info("[Twilio] Outbound call initiated:", {
      sid: call.sid,
      to: call.to,
      status: call.status,
    });

    return {
      success: true,
      callSid: call.sid,
      status: call.status,
    };
  } catch (error) {
    logger.error("[Twilio] Failed to initiate call:", error);
    throw error;
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Twilio webhook signature
 * Use this in production to verify requests are from Twilio
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getClient as getTwilioClient };
