/**
 * Drip Engine Cron
 *
 * Runs every 6 hours.
 * Processes active drip sequences (onboarding, reengagement, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { processDripSequences } from "@/lib/marketing/drip-engine";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await processDripSequences();
    const duration = Date.now() - startTime;

    logger.info("[DripCron] Complete:", { ...result, durationMs: duration });

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

export const GET = withCronGuard({ name: "drip-engine" }, handler);
