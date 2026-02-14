/**
 * Internal Push Notification Trigger
 *
 * POST /api/mobile/push/send
 * Auth: CRON_SECRET (internal use only)
 * Body: { tenantId: string, title: string, body: string, data?: Record<string, string> }
 *
 * Sends push notification to all registered devices for a tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendPushToTenant } from "@/lib/push/fcm";

export async function POST(req: NextRequest) {
  // Internal auth via CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tenantId, title, body: messageBody, data } = body;

  if (!tenantId || !title || !messageBody) {
    return NextResponse.json(
      { error: "Missing tenantId, title, or body" },
      { status: 400 },
    );
  }

  try {
    const result = await sendPushToTenant(tenantId, {
      title,
      body: messageBody,
      data,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PushSend] Error:", {
      error: error instanceof Error ? error.message : error,
      tenantId,
    });
    return NextResponse.json({ error: "Failed to send push" }, { status: 500 });
  }
}
