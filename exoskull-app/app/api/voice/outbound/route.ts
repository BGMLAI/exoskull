/**
 * Outbound Call API
 *
 * POST: Initiate an outbound call from the bot
 *
 * Types:
 * - morning_briefing: Scheduled morning check-in call TO user
 * - alert: Alert/emergency call TO user
 * - emergency: Critical emergency call TO user
 * - reminder: Reminder call TO user
 * - follow_up: Follow-up call TO user
 * - custom: Custom call with arbitrary message
 *
 * Auth: session-based (user must be logged in)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { callUser } from "@/lib/communication/outbound-caller";
import type { OutboundCallRequest } from "@/lib/communication/outbound-caller";

export const dynamic = "force-dynamic";

const VALID_REASONS: OutboundCallRequest["reason"][] = [
  "morning_briefing",
  "alert",
  "emergency",
  "reminder",
  "follow_up",
  "custom",
];

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await req.json();
    const { reason, message, priority, phoneNumber } = body;

    // Validate reason
    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        {
          error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate message
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const result = await callUser({
      tenantId: tenantId,
      reason,
      message,
      priority: priority || "normal",
      phoneNumber,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 422,
    });
  } catch (error) {
    console.error("[OutboundCallAPI] Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
