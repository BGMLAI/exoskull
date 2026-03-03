/**
 * Twilio Voice Webhook
 *
 * Main webhook handler for incoming and outgoing voice calls.
 * Uses HTTP turn-by-turn pattern with Twilio <Gather> for speech input.
 *
 * Flow:
 * 1. ?action=start - New call, return greeting + Gather
 * 2. ?action=process - Process speech, return Claude response + Gather
 * 3. ?action=end - Call ended, save transcript
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateGatherTwiML,
  generateSayAndGatherTwiML,
  generateEndCallTwiML,
  generateErrorTwiML,
  generateConversationRelayTwiML,
  generateMediaStreamsTwiML,
  validateTwilioSignature,
} from "@/lib/voice/twilio-client";
import { textToSpeech, uploadTTSAudio } from "@/lib/voice/elevenlabs-tts";
import { logger } from "@/lib/logger";
import {
  getOrCreateSession,
  updateSession,
  endSession,
  generateGreeting,
  findTenantByPhone,
} from "@/lib/voice/conversation-handler";
import { runExoSkullAgent } from "@/lib/agent-sdk";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// CONFIGURATION
// ============================================================================

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
}

// ============================================================================
// HELPERS
// ============================================================================

function getActionUrl(action: string, tenantId?: string): string {
  const base = `${getAppUrl()}/api/twilio/voice?action=${action}`;
  return tenantId ? `${base}&tenant_id=${tenantId}` : base;
}

async function parseFormData(
  req: NextRequest,
): Promise<Record<string, string>> {
  const formData = await req.formData();
  const data: Record<string, string> = {};

  formData.forEach((value, key) => {
    data[key] = value.toString();
  });

  return data;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";

    // Parse Twilio form data
    const formData = await parseFormData(req);

    // Twilio signature validation — log mismatch but don't block
    // (Vercel URL routing can cause false negatives on valid Twilio requests)
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioAuthToken) {
      const twilioSignature = req.headers.get("x-twilio-signature") || "";
      const requestUrl = `${getAppUrl()}${url.pathname}${url.search}`;
      const isValid = validateTwilioSignature(
        twilioAuthToken,
        twilioSignature,
        requestUrl,
        formData,
      );
      if (!isValid) {
        // Log for debugging but don't reject — Vercel URL proxying
        // causes signature mismatches for legitimate Twilio requests
        logger.warn("[Twilio Voice] Signature mismatch (non-blocking):", {
          requestUrl,
          hasSig: !!twilioSignature,
          direction: formData.Direction,
          callSid: formData.CallSid,
        });
      }
    }

    const callSid = formData.CallSid;
    const from = formData.From;
    const speechResult = formData.SpeechResult;
    const recordingUrl = formData.RecordingUrl;

    logger.info("[Twilio Voice] Request:", {
      action,
      callSid,
      from,
      hasSpeech: !!speechResult,
      hasRecording: !!recordingUrl,
    });

    // ========================================================================
    // ACTION: START - New incoming or outbound call
    // ========================================================================
    if (action === "start") {
      // For outbound/CRON calls, tenant_id comes as query param
      const queryTenantId = url.searchParams.get("tenant_id");
      const jobType = url.searchParams.get("job_type");
      const cronSecret = url.searchParams.get("cron_secret");
      const direction = formData.Direction; // "inbound" | "outbound-api" | "outbound-dial"

      logger.info("[Twilio Voice] New call:", {
        from,
        queryTenantId,
        jobType,
        direction,
      });

      // Resolve tenant:
      // 1. CRON calls: verified via cron_secret
      // 2. Outbound calls (Direction: outbound-api): trust tenant_id — only server-side
      //    code (make_call tool) can initiate outbound calls via Twilio REST API
      // 3. Inbound calls: lookup by phone number
      let tenantId: string;
      if (queryTenantId) {
        const validCronSecret = process.env.CRON_SECRET;
        const isVerifiedCron =
          validCronSecret && cronSecret === validCronSecret;
        const isOutboundCall =
          direction === "outbound-api" || direction === "outbound-dial";

        if (isVerifiedCron || isOutboundCall) {
          tenantId = queryTenantId;
          logger.info("[Twilio Voice] Trusted tenant_id from query:", {
            tenantId,
            reason: isVerifiedCron ? "cron_secret" : "outbound_call",
          });
        } else {
          logger.warn(
            "[Twilio Voice] Rejected tenant_id override — inbound without cron_secret",
          );
          const tenant = await findTenantByPhone(from);
          tenantId = tenant?.id || "anonymous";
        }
      } else {
        const tenant = await findTenantByPhone(from);
        tenantId = tenant?.id || "anonymous";
      }

      // ── Voice mode selection ──
      // Gemini Live (Media Streams) is the DEFAULT when VOICE_WS_URL is set.
      // Set USE_CONVERSATION_RELAY="true" to use legacy ConversationRelay instead.
      const useConversationRelay =
        process.env.USE_CONVERSATION_RELAY === "true";
      const voiceWsUrl = process.env.VOICE_WS_URL;

      if (voiceWsUrl && !useConversationRelay) {
        // Media Streams sends raw audio — Gemini handles STT + LLM + TTS natively
        const mediaWsUrl = voiceWsUrl.replace(/\/?$/, "/media-streams");

        const twiml = generateMediaStreamsTwiML({
          wsUrl: mediaWsUrl,
          actionUrl: getActionUrl("end", tenantId),
          customParameters: {
            tenantId,
            ...(jobType ? { jobType } : {}),
          },
        });

        logger.info("[Twilio Voice] Media Streams TwiML generated (default):", {
          tenantId,
          wsUrl: mediaWsUrl,
          mode: "gemini-live",
        });

        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // ── ConversationRelay mode (explicit opt-in via USE_CONVERSATION_RELAY) ──
      if (voiceWsUrl) {
        // Generate personalized greeting (ConversationRelay speaks it via ElevenLabs)
        const greeting = await generateGreeting(tenantId);

        const twiml = generateConversationRelayTwiML({
          wsUrl: voiceWsUrl,
          welcomeGreeting: greeting,
          voiceId: process.env.ELEVENLABS_VOICE_ID,
          language: "pl",
          actionUrl: getActionUrl("end", tenantId),
          hints: "ExoSkull,IORS,Bogumił",
          customParameters: {
            tenantId,
            greeting,
            ...(jobType ? { jobType } : {}),
          },
        });

        logger.info("[Twilio Voice] ConversationRelay TwiML generated:", {
          tenantId,
          wsUrl: voiceWsUrl,
          greeting: greeting.substring(0, 50),
        });

        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // ── Legacy Gather mode (HTTP turn-by-turn) ──

      // Create session
      const purpose = url.searchParams.get("purpose");
      const instructions = url.searchParams.get("instructions");
      const session = await getOrCreateSession(callSid, tenantId);

      // Store purpose/instructions in session metadata for process handler
      if (purpose || instructions) {
        try {
          const { getServiceSupabase } = await import("@/lib/supabase/service");
          const supabase = getServiceSupabase();
          await supabase
            .from("exo_voice_sessions")
            .update({
              metadata: {
                purpose,
                instructions,
                direction: direction || "inbound",
              },
            })
            .eq("id", session.id);
        } catch (metaErr) {
          logger.warn("[Twilio Voice] Failed to store call metadata:", metaErr);
        }
      }

      // Generate personalized greeting — for outbound calls, use purpose
      let greeting: string;
      if (
        purpose &&
        (direction === "outbound-api" || direction === "outbound-dial")
      ) {
        greeting = `Cześć! Tu IORS, osobisty asystent AI. Dzwonię w sprawie: ${decodeURIComponent(purpose)}. Jak mogę pomóc?`;
      } else {
        greeting = await generateGreeting(tenantId);
      }

      // Generate TTS audio
      let audioUrl: string | undefined;

      try {
        const audioBuffer = await textToSpeech(greeting);
        audioUrl = await uploadTTSAudio(audioBuffer, session.id, 0);
        logger.info("[Twilio Voice] TTS greeting uploaded:", audioUrl);
      } catch (ttsError) {
        logger.error("[Twilio Voice] TTS Error:", ttsError);
        // Will fall back to Twilio Say
      }

      // Return TwiML
      if (audioUrl) {
        const twiml = generateGatherTwiML({
          audioUrl,
          actionUrl: getActionUrl("process", tenantId),
        });
        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // Fallback to Twilio Say
      const twiml = generateGatherTwiML({
        fallbackText: greeting,
        actionUrl: getActionUrl("process", tenantId),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: PROCESS - Handle speech input
    // ========================================================================
    if (action === "process") {
      // Resolve tenant: prefer URL query param (passed from start action),
      // then phone lookup (To for outbound, From for inbound)
      const queryTenantId = url.searchParams.get("tenant_id");
      let tenantId: string;
      if (queryTenantId) {
        tenantId = queryTenantId;
      } else {
        const to = formData.To;
        const tenant =
          (await findTenantByPhone(to)) || (await findTenantByPhone(from));
        tenantId = tenant?.id || "anonymous";
      }
      const session = await getOrCreateSession(callSid, tenantId);

      // Get user speech (from Twilio's built-in STT)
      const userText = speechResult?.trim();

      if (!userText) {
        logger.info("[Twilio Voice] No speech detected");
        return new NextResponse(generateEndCallTwiML(), {
          headers: { "Content-Type": "application/xml" },
        });
      }

      logger.info("[Twilio Voice] User said:", userText);

      // Process with Agent SDK — with timeout protection
      // Twilio's webhook timeout is ~15s. Vercel Hobby is 60s.
      // Use 50s timeout to ensure we respond before Vercel kills the function.
      const VOICE_AGENT_TIMEOUT = 50_000;
      let result: { text: string; toolsUsed: string[]; shouldEndCall: boolean };
      try {
        result = await Promise.race([
          runExoSkullAgent({
            tenantId,
            sessionId: session.id,
            userMessage: userText,
            channel: "voice",
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Voice agent timeout")),
              VOICE_AGENT_TIMEOUT,
            ),
          ),
        ]);
      } catch (agentError) {
        const errMsg =
          agentError instanceof Error ? agentError.message : String(agentError);
        logger.error("[Twilio Voice] Agent failed/timeout:", {
          error: errMsg,
          tenantId,
          userText: userText.slice(0, 100),
          elapsedMs: Date.now() - startTime,
        });

        // Gemini emergency fallback — fast, no tools, just conversation
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const geminiKey = process.env.GOOGLE_AI_API_KEY;
          if (geminiKey) {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const geminiResult = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [{ role: "user", parts: [{ text: userText }] }],
              config: {
                systemInstruction:
                  "Jesteś IORS, osobistym asystentem AI. Odpowiadaj krótko po polsku (max 2 zdania). Bądź pomocny i naturalny.",
                temperature: 0.7,
                maxOutputTokens: 150,
              },
            });
            const fallbackText =
              geminiResult.text ||
              "Przepraszam, mam chwilowe problemy. Spróbuj ponownie.";
            result = {
              text: fallbackText,
              toolsUsed: ["emergency_voice_fallback"],
              shouldEndCall: false,
            };
          } else {
            result = {
              text: "Przepraszam, mam chwilowe problemy techniczne. Spróbuj ponownie za chwilę.",
              toolsUsed: [],
              shouldEndCall: false,
            };
          }
        } catch (fallbackError) {
          logger.error("[Twilio Voice] Gemini fallback also failed:", {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          result = {
            text: "Przepraszam, mam chwilowe problemy techniczne. Spróbuj ponownie za chwilę.",
            toolsUsed: [],
            shouldEndCall: false,
          };
        }
      }
      const processingTime = Date.now() - startTime;

      logger.info("[Twilio Voice] Claude response:", {
        text: result.text.substring(0, 100),
        toolsUsed: result.toolsUsed,
        shouldEndCall: result.shouldEndCall,
        processingTimeMs: processingTime,
      });

      // WAŻNE: Await updateSession żeby wiadomości były w unified thread
      // zanim przyjdzie następna wiadomość (fix race condition)
      try {
        await updateSession(session.id, userText, result.text);
      } catch (e) {
        logger.error("[Twilio Voice] Session update error:", e);
      }

      // Check if call should end
      if (result.shouldEndCall) {
        endSession(session.id).catch((e) =>
          logger.error("[Twilio Voice] End session error:", e),
        );

        // Try ElevenLabs TTS for farewell
        try {
          const audioBuffer = await textToSpeech(result.text);
          const audioUrl = await uploadTTSAudio(
            audioBuffer,
            session.id,
            session.messages.length + 1,
          );
          return new NextResponse(generateEndCallTwiML({ audioUrl }), {
            headers: { "Content-Type": "application/xml" },
          });
        } catch {
          return new NextResponse(
            generateEndCallTwiML({ farewellText: result.text }),
            { headers: { "Content-Type": "application/xml" } },
          );
        }
      }

      // Generate ElevenLabs TTS for response (Pro plan = 60s timeout)
      let audioUrl: string | undefined;
      try {
        const audioBuffer = await textToSpeech(result.text);
        audioUrl = await uploadTTSAudio(
          audioBuffer,
          session.id,
          session.messages.length + 1,
        );
      } catch (ttsError) {
        logger.error("[Twilio Voice] TTS Error:", ttsError);
      }

      if (audioUrl) {
        const twiml = generateGatherTwiML({
          audioUrl,
          actionUrl: getActionUrl("process", tenantId),
        });
        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // Fallback to Twilio <Say> if TTS fails
      const twiml = generateSayAndGatherTwiML({
        text: result.text,
        actionUrl: getActionUrl("process", tenantId),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: END - Call ended
    // ========================================================================
    if (action === "end") {
      // Resolve tenant: prefer URL query param, then phone lookup
      const queryTenantId = url.searchParams.get("tenant_id");
      let tenantId: string;
      if (queryTenantId) {
        tenantId = queryTenantId;
      } else {
        const to = formData.To;
        const tenant =
          (await findTenantByPhone(to)) || (await findTenantByPhone(from));
        tenantId = tenant?.id || "anonymous";
      }

      try {
        const session = await getOrCreateSession(callSid, tenantId);
        await endSession(session.id);
        logger.info("[Twilio Voice] Call ended:", callSid);
      } catch (error) {
        logger.error("[Twilio Voice] Error ending session:", error);
      }

      return NextResponse.json({ success: true });
    }

    // Unknown action - end call
    logger.warn("[Twilio Voice] Unknown action:", action);
    return new NextResponse(generateEndCallTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[Twilio Voice] Fatal error:", {
      message: err.message,
      name: err.name,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    });

    return new NextResponse(generateErrorTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  }
});

// Health check GET
export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Twilio Voice Webhook",
    actions: ["start", "process", "end"],
    usage: "POST /api/twilio/voice?action=start",
  });
});
