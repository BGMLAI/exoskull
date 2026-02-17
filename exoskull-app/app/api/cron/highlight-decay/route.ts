/**
 * Highlight Decay CRON Handler
 *
 * Runs daily at 3 AM to decay unused highlights
 *
 * Schedule: 0 3 * * * (daily at 3 AM)
 */

import { NextRequest, NextResponse } from "next/server";
import { runDecay } from "@/lib/learning/self-updater";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// ADDITIONAL AUTH (service key for pg_cron calls)
// ============================================================================

function validateServiceKey(request: NextRequest): boolean {
  const serviceKey = request.headers.get("x-service-key");
  if (serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return true;
  }
  return false;
}

// ============================================================================
// GET HANDLER (for Vercel CRON)
// ============================================================================

async function getHandler(request: NextRequest) {
  const startTime = Date.now();

  logger.info("[HighlightDecay] Starting decay cycle...");

  try {
    const result = await runDecay();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      highlights_decayed: result.decayed,
    };

    logger.info("[HighlightDecay] Decay completed:", response);
    return NextResponse.json(response);
  } catch (error) {
    logger.error("[HighlightDecay] Decay failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "highlight-decay" }, getHandler);
