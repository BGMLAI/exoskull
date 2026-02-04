/**
 * Drip Engine Cron
 *
 * Runs every 6 hours.
 * Processes active drip sequences (onboarding, reengagement, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { processDripSequences } from "@/lib/marketing/drip-engine";
import { verifyCronAuth } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const result = await processDripSequences();
    const duration = Date.now() - startTime;

    console.log("[DripCron] Complete:", { ...result, durationMs: duration });

    return NextResponse.json({
      status: "completed",
      ...result,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[DripCron] Failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}
