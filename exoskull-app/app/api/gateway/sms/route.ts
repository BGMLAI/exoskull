/**
 * SMS Gateway Route (Twilio Inbound)
 *
 * POST - Incoming SMS from Twilio webhook
 *        Parses form data, validates signature, routes through
 *        Unified Message Gateway for full AI pipeline.
 *
 * Twilio sends: From, To, Body, MessageSid, etc. as form-encoded POST.
 * We must return TwiML (or empty 200) — Twilio does NOT retry on 200.
 *
 * Setup: Configure Twilio phone number → Messaging webhook URL:
 *   https://exoskull.xyz/api/gateway/sms (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@/lib/gateway/gateway";
import type { GatewayMessage } from "@/lib/gateway/types";
import { validateTwilioSignature } from "@/lib/voice/twilio-client";
import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// =====================================================
// POST - INCOMING SMS FROM TWILIO
// =====================================================

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    // 1. Parse form data (Twilio sends application/x-www-form-urlencoded)
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const from = params.From || "";
    const to = params.To || "";
    const body = params.Body || "";
    const messageSid = params.MessageSid || "";

    if (!from || !body) {
      logger.warn("[SMS Gateway] Missing From or Body in webhook");
      return twimlResponse();
    }

    logger.info("[SMS Gateway] Inbound SMS:", {
      from,
      to,
      messageSid,
      bodyLength: body.length,
    });

    // 2. Validate Twilio signature (skip in dev for testing)
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken && process.env.NODE_ENV === "production") {
      const signature = req.headers.get("x-twilio-signature") || "";
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/gateway/sms`
        : `https://exoskull.xyz/api/gateway/sms`;

      if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
        logger.error("[SMS Gateway] Invalid Twilio signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    // 3. Build GatewayMessage and route through full AI pipeline
    const gatewayMsg: GatewayMessage = {
      channel: "sms",
      tenantId: "unknown", // gateway.resolveTenant will look up by phone
      from,
      text: body.trim(),
      metadata: {
        message_sid: messageSid,
        to_number: to,
        twilio_params: {
          NumMedia: params.NumMedia,
          NumSegments: params.NumSegments,
          SmsStatus: params.SmsStatus,
        },
      },
    };

    const response = await handleInboundMessage(gatewayMsg);

    // 4. Send AI response back via SMS (Twilio REST API)
    await sendSmsReply(from, response.text);

    logger.info("[SMS Gateway] Reply sent:", {
      to: from,
      toolsUsed: response.toolsUsed,
      responseLength: response.text.length,
    });

    // Return empty TwiML — we send the reply via REST API, not TwiML <Message>
    return twimlResponse();
  } catch (error) {
    logger.error("[SMS Gateway] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Always return 200 to prevent Twilio retries
    return twimlResponse();
  }
});

// =====================================================
// GET - HEALTH CHECK
// =====================================================

export async function GET() {
  return NextResponse.json({
    channel: "sms",
    status: "active",
    hasTwilioConfig: !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    ),
  });
}

// =====================================================
// HELPERS
// =====================================================

/** Return empty TwiML response (Twilio requires valid XML or empty 200) */
function twimlResponse(): NextResponse {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}

/** Send SMS reply via Twilio REST API */
async function sendSmsReply(to: string, text: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.error("[SMS Gateway] Missing Twilio credentials for reply");
    return;
  }

  // Twilio SMS limit is 1600 chars — truncate if needed
  const truncated = text.length > 1500 ? text.substring(0, 1497) + "..." : text;

  const statusCallbackUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/sms-status`
    : undefined;

  const params = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: truncated,
  });
  if (statusCallbackUrl) {
    params.set("StatusCallback", statusCallbackUrl);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("[SMS Gateway] Twilio send failed:", {
      status: response.status,
      body: errorBody,
      to,
    });
  }
}
