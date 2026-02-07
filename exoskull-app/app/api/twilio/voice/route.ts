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
  validateTwilioSignature,
} from "@/lib/voice/twilio-client";
import { textToSpeech, uploadTTSAudio } from "@/lib/voice/elevenlabs-tts";
import { logger } from "@/lib/logger";
import {
  getOrCreateSession,
  updateSession,
  endSession,
  processUserMessage,
  generateGreeting,
  findTenantByPhone,
} from "@/lib/voice/conversation-handler";

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

function getActionUrl(action: string): string {
  return `${getAppUrl()}/api/twilio/voice?action=${action}`;
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

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";

    // Parse Twilio form data
    const formData = await parseFormData(req);

    // Verify Twilio signature (mandatory in production)
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioAuthToken) {
      const twilioSignature = req.headers.get("x-twilio-signature") || "";
      const requestUrl = `${getAppUrl()}/api/twilio/voice?action=${action}`;
      if (
        !validateTwilioSignature(
          twilioAuthToken,
          twilioSignature,
          requestUrl,
          formData,
        )
      ) {
        console.error("[Twilio Voice] Signature verification failed");
        return new NextResponse(generateErrorTwiML(), {
          status: 403,
          headers: { "Content-Type": "text/xml" },
        });
      }
    } else {
      logger.warn(
        "[Twilio Voice] TWILIO_AUTH_TOKEN not set — signature verification skipped",
      );
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
    // ACTION: START - New incoming call
    // ========================================================================
    if (action === "start") {
      // For outbound CRON calls, tenant_id comes as query param
      const queryTenantId = url.searchParams.get("tenant_id");
      const jobType = url.searchParams.get("job_type");
      const cronSecret = url.searchParams.get("cron_secret");

      logger.info("[Twilio Voice] New call:", { from, queryTenantId, jobType });

      // Resolve tenant: use query param (outbound, CRON-verified) or lookup by phone (inbound)
      let tenantId: string;
      if (queryTenantId) {
        // Only allow tenant_id override from verified CRON calls
        const validCronSecret = process.env.CRON_SECRET;
        if (!validCronSecret || cronSecret !== validCronSecret) {
          console.error(
            "[Twilio Voice] Rejected tenant_id override — invalid cron_secret",
          );
          const tenant = await findTenantByPhone(from);
          tenantId = tenant?.id || "anonymous";
        } else {
          tenantId = queryTenantId;
        }
      } else {
        const tenant = await findTenantByPhone(from);
        tenantId = tenant?.id || "anonymous";
      }

      // Create session
      const session = await getOrCreateSession(callSid, tenantId);

      // Generate personalized greeting
      const greeting = await generateGreeting(tenantId);

      // Generate TTS audio
      let audioUrl: string | undefined;

      try {
        const audioBuffer = await textToSpeech(greeting);
        audioUrl = await uploadTTSAudio(audioBuffer, session.id, 0);
        logger.info("[Twilio Voice] TTS greeting uploaded:", audioUrl);
      } catch (ttsError) {
        console.error("[Twilio Voice] TTS Error:", ttsError);
        // Will fall back to Twilio Say
      }

      // Return TwiML
      if (audioUrl) {
        const twiml = generateGatherTwiML({
          audioUrl,
          actionUrl: getActionUrl("process"),
        });
        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // Fallback to Twilio Say
      const twiml = generateGatherTwiML({
        fallbackText: greeting,
        actionUrl: getActionUrl("process"),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: PROCESS - Handle speech input
    // ========================================================================
    if (action === "process") {
      // Get session - for outbound calls, From is our Twilio number so
      // we try To first, then From, then fall back to session's tenant_id
      const to = formData.To;
      const tenant =
        (await findTenantByPhone(to)) || (await findTenantByPhone(from));
      const tenantId = tenant?.id || "anonymous";
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

      // Process with Claude
      const result = await processUserMessage(session, userText, {
        recordingUrl: recordingUrl || undefined,
      });
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
        console.error("[Twilio Voice] Session update error:", e);
      }

      // Check if call should end
      if (result.shouldEndCall) {
        endSession(session.id).catch((e) =>
          console.error("[Twilio Voice] End session error:", e),
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
        console.error("[Twilio Voice] TTS Error:", ttsError);
      }

      if (audioUrl) {
        const twiml = generateGatherTwiML({
          audioUrl,
          actionUrl: getActionUrl("process"),
        });
        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      // Fallback to Twilio <Say> if TTS fails
      const twiml = generateSayAndGatherTwiML({
        text: result.text,
        actionUrl: getActionUrl("process"),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: END - Call ended
    // ========================================================================
    if (action === "end") {
      // Find and end session
      const to = formData.To;
      const tenant =
        (await findTenantByPhone(to)) || (await findTenantByPhone(from));
      const tenantId = tenant?.id || "anonymous";

      try {
        const session = await getOrCreateSession(callSid, tenantId);
        await endSession(session.id);
        logger.info("[Twilio Voice] Call ended:", callSid);
      } catch (error) {
        console.error("[Twilio Voice] Error ending session:", error);
      }

      return NextResponse.json({ success: true });
    }

    // Unknown action - end call
    logger.warn("[Twilio Voice] Unknown action:", action);
    return new NextResponse(generateEndCallTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("[Twilio Voice] Fatal error:", error);

    return new NextResponse(generateErrorTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  }
}

// Also handle GET for testing
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    endpoint: "Twilio Voice Webhook",
    actions: ["start", "process", "end"],
    usage: "POST /api/twilio/voice?action=start",
  });
}
