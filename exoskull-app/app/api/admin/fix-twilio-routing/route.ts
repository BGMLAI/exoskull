/**
 * One-time endpoint to fix Twilio routing
 *
 * Call: POST /api/admin/fix-twilio-routing
 * Auth: Requires CRON_SECRET header
 *
 * DELETE THIS FILE AFTER USE
 */

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Numery do przekonfigurowania - oba z VAPI na ExoSkull
const PHONE_NUMBERS_TO_FIX = ["+48732143210", "+48732144112"];

const NEW_VOICE_URL = "https://exoskull.xyz/api/twilio/voice";
const NEW_STATUS_CALLBACK = "https://exoskull.xyz/api/twilio/status";

export async function POST(req: NextRequest) {
  // Simple auth - require CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Missing TWILIO credentials in env" },
      { status: 500 },
    );
  }

  try {
    const client = twilio(accountSid, authToken);
    const numbers = await client.incomingPhoneNumbers.list();

    const results: Array<{
      phone: string;
      sid: string;
      oldVoiceUrl: string | null;
      newVoiceUrl: string;
      updated: boolean;
    }> = [];

    for (const num of numbers) {
      const needsFix = PHONE_NUMBERS_TO_FIX.includes(num.phoneNumber);

      if (needsFix) {
        await client.incomingPhoneNumbers(num.sid).update({
          voiceUrl: NEW_VOICE_URL,
          voiceMethod: "POST",
          statusCallback: NEW_STATUS_CALLBACK,
          statusCallbackMethod: "POST",
        });

        results.push({
          phone: num.phoneNumber,
          sid: num.sid,
          oldVoiceUrl: num.voiceUrl,
          newVoiceUrl: NEW_VOICE_URL,
          updated: true,
        });
      } else {
        results.push({
          phone: num.phoneNumber,
          sid: num.sid,
          oldVoiceUrl: num.voiceUrl,
          newVoiceUrl: num.voiceUrl || "",
          updated: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Twilio routing updated",
      results,
    });
  } catch (error) {
    console.error("[fix-twilio-routing] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "Fix Twilio Routing (one-time)",
    method: "POST",
    auth: "Bearer CRON_SECRET",
    note: "DELETE THIS FILE AFTER USE",
  });
}
