/**
 * Twilio Delegate Voice Webhook
 *
 * Handles calls IORS makes to THIRD PARTIES on behalf of the user.
 * E.g., calling a pizzeria, doctor, or any external number.
 *
 * Flow:
 * 1. ?action=start - Greet the third party, state purpose
 * 2. ?action=process - Handle conversation with third party
 * 3. ?action=end - Call ended, save transcript, notify user
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  generateGatherTwiML,
  generateSayAndGatherTwiML,
  generateEndCallTwiML,
  generateErrorTwiML,
} from "@/lib/voice/twilio-client";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendMessage } from "@/lib/unified-thread";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
}

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY!;
}

// ============================================================================
// DELEGATE SYSTEM PROMPT
// ============================================================================

function buildDelegatePrompt(metadata: {
  purpose: string;
  instructions: string;
  user_name: string;
}): string {
  return `Dzwonisz W IMIENIU osoby o imieniu ${metadata.user_name}. Jestes asystentem AI ktory wykonuje polecenie.

CEL ROZMOWY: ${metadata.purpose}

INSTRUKCJE: ${metadata.instructions}

ZASADY:
- Przedstaw sie: "Dzien dobry, dzwonie w imieniu ${metadata.user_name}."
- Mow krotko, rzeczowo, uprzejmie.
- Realizuj cel rozmowy - nie zbaczaj z tematu.
- Jesli trzeba podac dane (imie, adres) - uzywaj tego co masz w instrukcjach.
- Jesli czegoś brakuje i musisz zapytac trzecia strone - pytaj.
- Po zalatwieniu sprawy podsumuj krotko co ustalono i pozegnaj sie.
- Max 2-3 zdania na odpowiedz.
- Mow po polsku.`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getActionUrl(action: string, sessionId: string): string {
  return `${getAppUrl()}/api/twilio/voice/delegate?action=${action}&session_id=${sessionId}`;
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
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      logger.error("[Delegate] No session_id provided");
      return new NextResponse(generateErrorTwiML(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    const formData = await parseFormData(req);
    const callSid = formData.CallSid;
    const speechResult = formData.SpeechResult;

    const supabase = getServiceSupabase();

    // Load delegate session
    const { data: session } = await supabase
      .from("exo_voice_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      logger.error("[Delegate] Session not found:", sessionId);
      return new NextResponse(generateErrorTwiML(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    const metadata = {
      purpose: "rozmowa ogólna",
      instructions: "Przeprowadź rozmowę uprzejmie i rzeczowo.",
      user_name: "użytkownik",
      ...(session.metadata || {}),
    };

    logger.info("[Delegate] Request:", {
      action,
      sessionId,
      hasSpeech: !!speechResult,
    });

    // ========================================================================
    // ACTION: START - Greet third party
    // ========================================================================
    if (action === "start") {
      // Update call_sid if needed
      if (callSid && session.call_sid !== callSid) {
        await supabase
          .from("exo_voice_sessions")
          .update({ call_sid: callSid })
          .eq("id", sessionId);
      }

      // Generate opening line with Claude
      const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });
      const systemPrompt = buildDelegatePrompt(metadata);

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 150,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content:
              "Osoba odebała telefon. Przedstaw się i powiedz po co dzwonisz.",
          },
        ],
      });

      const greeting =
        response.content.find(
          (c): c is Anthropic.TextBlock => c.type === "text",
        )?.text || `Dzień dobry, dzwonię w imieniu ${metadata.user_name}.`;

      // Save greeting to messages
      const messages = session.messages || [];
      messages.push({ role: "assistant", content: greeting });
      await supabase
        .from("exo_voice_sessions")
        .update({ messages })
        .eq("id", sessionId);

      const twiml = generateGatherTwiML({
        fallbackText: greeting,
        actionUrl: getActionUrl("process", sessionId),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: PROCESS - Handle third party speech
    // ========================================================================
    if (action === "process") {
      const userText = speechResult?.trim();

      if (!userText) {
        // No speech - ask if they're there
        const twiml = generateSayAndGatherTwiML({
          text: "Halo? Czy jest ktoś?",
          actionUrl: getActionUrl("process", sessionId),
        });
        return new NextResponse(twiml, {
          headers: { "Content-Type": "application/xml" },
        });
      }

      logger.info("[Delegate] Third party said:", userText);

      // Get conversation history
      const messages = session.messages || [];
      messages.push({ role: "user", content: userText });

      // Process with Claude
      const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() });
      const systemPrompt = buildDelegatePrompt(metadata);

      const claudeMessages: Anthropic.MessageParam[] = messages.map(
        (m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }),
      );

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 150,
        system: systemPrompt,
        messages: claudeMessages,
      });

      const responseText =
        response.content.find(
          (c): c is Anthropic.TextBlock => c.type === "text",
        )?.text || "Rozumiem. Dziękuję.";

      // Check if conversation should end
      const shouldEnd = checkDelegateEnd(responseText, userText);

      // Save messages
      messages.push({ role: "assistant", content: responseText });
      await supabase
        .from("exo_voice_sessions")
        .update({ messages })
        .eq("id", sessionId);

      if (shouldEnd || messages.length > 16) {
        // End call
        await supabase
          .from("exo_voice_sessions")
          .update({
            status: "ended",
            ended_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        // Notify user about result (fire and forget)
        notifyUserAboutDelegateResult(
          session.tenant_id,
          metadata,
          messages,
        ).catch((e) => logger.error("[Delegate] Notify error:", e));

        return new NextResponse(
          generateEndCallTwiML({ farewellText: responseText }),
          { headers: { "Content-Type": "application/xml" } },
        );
      }

      // Continue conversation
      const twiml = generateSayAndGatherTwiML({
        text: responseText,
        actionUrl: getActionUrl("process", sessionId),
      });

      return new NextResponse(twiml, {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // ========================================================================
    // ACTION: END
    // ========================================================================
    if (action === "end") {
      const messages = session.messages || [];
      await supabase
        .from("exo_voice_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      // Notify user
      notifyUserAboutDelegateResult(
        session.tenant_id,
        metadata,
        messages,
      ).catch((e) => logger.error("[Delegate] Notify error:", e));

      return NextResponse.json({ success: true });
    }

    return new NextResponse(generateEndCallTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    logger.error("[Delegate] Fatal error:", error);
    return new NextResponse(generateErrorTwiML(), {
      headers: { "Content-Type": "application/xml" },
    });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

const END_PHRASES = [
  "do widzenia",
  "dziękuję",
  "dziekuje",
  "to wszystko",
  "do zobaczenia",
  "pa",
  // "cześć" removed — in Polish it's BOTH greeting AND goodbye
  "trzymaj się",
];

function checkDelegateEnd(
  responseText: string,
  thirdPartyText: string,
): boolean {
  const combined = (responseText + " " + thirdPartyText).toLowerCase();
  return END_PHRASES.some((phrase) => combined.includes(phrase));
}

/**
 * After delegate call ends, notify the user about the result.
 * Uses multi-channel dispatch (preferred → whatsapp → telegram → sms → email → web_chat).
 */
async function notifyUserAboutDelegateResult(
  tenantId: string,
  metadata: Record<string, string>,
  messages: { role: string; content: string }[],
): Promise<void> {
  const supabase = getServiceSupabase();

  // Get user's preferred name
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("preferred_name")
    .eq("id", tenantId)
    .single();

  // Build summary from last few messages
  const lastMessages = messages.slice(-4);
  const summary = lastMessages
    .map(
      (m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "IORS" : "Rozmówca"}: ${m.content}`,
    )
    .join("\n");

  const notificationBody = `${tenant?.preferred_name || "Hej"}, zadzwoniłem w sprawie: ${metadata.purpose}.\n\nPodsumowanie:\n${summary}`;

  // Log to unified thread
  await appendMessage(tenantId, {
    role: "assistant",
    content: `[Rozmowa delegowana — ${metadata.purpose}]\n${summary}`,
    channel: "voice",
    direction: "outbound",
    source_type: "voice_session",
  }).catch((err) =>
    logger.warn("[Delegate] Failed to append to thread:", {
      error: err instanceof Error ? err.message : String(err),
    }),
  );

  // Dispatch via multi-channel fallback
  try {
    const { dispatchReport } = await import("@/lib/reports/report-dispatcher");
    const result = await dispatchReport(
      tenantId,
      notificationBody,
      "proactive",
    );
    logger.info("[Delegate] Notification dispatched:", {
      channel: result.channel,
      success: result.success,
    });
  } catch (dispatchError) {
    logger.error("[Delegate] Notification dispatch failed:", {
      error:
        dispatchError instanceof Error
          ? dispatchError.message
          : String(dispatchError),
      tenantId,
    });
  }
}

// Also handle GET for testing
export const GET = withApiLog(async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Twilio Delegate Voice Webhook",
    description: "Handles calls IORS makes to third parties on behalf of user",
  });
});
