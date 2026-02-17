/**
 * POST /api/onboarding/birth-chat
 *
 * Unified birth flow endpoint for web onboarding (Voice + Chat).
 * Uses the FULL processUserMessage pipeline with 30+ IORS tools
 * and BIRTH_SYSTEM_PROMPT_PREFIX.
 *
 * Accepts: { message: string, generateAudio?: boolean }
 * Returns: { text, toolsUsed, isComplete, audio? }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  getOrCreateSession,
  updateSession,
} from "@/lib/voice/conversation-handler";
import { runExoSkullAgent } from "@/lib/agent-sdk";
import {
  BIRTH_SYSTEM_PROMPT_PREFIX,
  BIRTH_FIRST_MESSAGE,
} from "@/lib/iors/birth-prompt";
import { completeBirth } from "@/lib/iors/birth-flow";
import { textToSpeech } from "@/lib/voice/elevenlabs-tts";

import { withApiLog } from "@/lib/api/request-logger";
import { withRateLimit } from "@/lib/api/rate-limit-guard";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(
  withRateLimit("ai_requests", async function POST(request: NextRequest) {
    try {
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;
      const tenantId = auth.tenantId;

      const { message, generateAudio = false } = await request.json();

      if (!message || typeof message !== "string") {
        return NextResponse.json(
          { error: "Message is required" },
          { status: 400 },
        );
      }

      // Special case: greeting TTS request (voice mode initial load)
      if (message === "__birth_greeting__") {
        let audioBase64: string | null = null;
        if (generateAudio) {
          try {
            const audioBuffer = await textToSpeech(BIRTH_FIRST_MESSAGE);
            audioBase64 = Buffer.from(audioBuffer).toString("base64");
          } catch (ttsError) {
            logger.error("[BirthChat] Greeting TTS error:", ttsError);
          }
        }
        return NextResponse.json({
          text: BIRTH_FIRST_MESSAGE,
          toolsUsed: [],
          isComplete: false,
          audio: audioBase64,
        });
      }

      // Stable session key per user (survives page refresh)
      const sessionKey = `birth-${tenantId}`;
      const session = await getOrCreateSession(sessionKey, tenantId);

      // Process through Agent SDK with birth prompt prefix (all tools available)
      const result = await runExoSkullAgent({
        tenantId: tenantId,
        sessionId: session.id,
        userMessage: message,
        channel: "web_chat",
        systemPromptPrefix: BIRTH_SYSTEM_PROMPT_PREFIX,
        maxTokens: 1024,
      });

      // Check for birth completion marker
      const birthMatch = result.text.match(
        /###BIRTH_COMPLETE###\s*([\s\S]*?)\s*###END_BIRTH_COMPLETE###/,
      );

      let responseText = result.text;
      let isComplete = false;

      if (birthMatch) {
        // Clean the response (remove JSON block)
        responseText = result.text
          .replace(/###BIRTH_COMPLETE###[\s\S]*###END_BIRTH_COMPLETE###/, "")
          .trim();
        isComplete = true;

        // Complete birth synchronously (await — we need confirmation before redirect)
        try {
          await completeBirth(tenantId, birthMatch[1]);
        } catch (err) {
          logger.error("[BirthChat] completeBirth failed:", {
            userId: tenantId,
            error: err instanceof Error ? err.message : err,
          });
          // Still mark as complete on client — next middleware check will redirect properly
        }
      }

      // Persist to session + unified thread
      await updateSession(session.id, message, responseText, {
        tenantId: tenantId,
        channel: "web_chat",
      });

      // Optional TTS audio generation (for voice mode)
      let audioBase64: string | null = null;
      if (generateAudio && responseText) {
        try {
          const audioBuffer = await textToSpeech(responseText);
          audioBase64 = Buffer.from(audioBuffer).toString("base64");
        } catch (ttsError) {
          logger.error("[BirthChat] TTS error:", ttsError);
          // Continue without audio — text response still valid
        }
      }

      return NextResponse.json({
        text: responseText,
        toolsUsed: result.toolsUsed,
        isComplete,
        audio: audioBase64,
      });
    } catch (error) {
      logger.error("[BirthChat] Error:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return NextResponse.json(
        { error: "Failed to process message" },
        { status: 500 },
      );
    }
  }),
);
