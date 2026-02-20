/**
 * Test endpoint: sends a test SMS to verify the autonomy pipeline works.
 * Protected by CRON_SECRET. DELETE THIS AFTER TESTING.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const authResult = verifyCronAuth(req);
  if (!authResult.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = "be769cc4-43db-4b26-bcc2-046c6653e3b3";
  const message =
    "ExoSkull test: Pipeline autonomii aktywny. Default grants załadowane, MAPE-K podłączony do loop-15, outcome tracker gotowy. System działa.";

  try {
    const result = await sendProactiveMessage(
      tenantId,
      message,
      "system_test",
      "manual_test",
    );

    logger.info("[TestSMS] Result:", result);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Test SMS sent via ${result.channel || "unknown"}`,
    });
  } catch (error) {
    logger.error("[TestSMS] Failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
