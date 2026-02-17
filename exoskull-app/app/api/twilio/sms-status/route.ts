/**
 * Twilio SMS Status Callback
 *
 * Receives SMS delivery status updates from Twilio.
 * Updates exo_proactive_log with delivery confirmation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";

export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const messageSid = formData.get("MessageSid")?.toString();
    const messageStatus = formData.get("MessageStatus")?.toString();

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ success: true });
    }

    logger.info("[Twilio SMS Status] Update:", { messageSid, messageStatus });

    // Only update on terminal delivery statuses
    const terminalStatuses = ["delivered", "undelivered", "failed", "read"];
    if (!terminalStatuses.includes(messageStatus)) {
      return NextResponse.json({ success: true });
    }

    const supabase = getServiceSupabase();

    const updateData: Record<string, unknown> = {
      delivery_status: messageStatus,
    };

    if (messageStatus === "delivered" || messageStatus === "read") {
      updateData.delivered_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("exo_proactive_log")
      .update(updateData)
      .eq("message_sid", messageSid);

    if (error) {
      logger.error("[Twilio SMS Status] Update failed:", {
        messageSid,
        error: error.message,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Twilio SMS Status] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
});
