/**
 * Highlight Decay CRON Handler
 *
 * Runs daily at 3 AM to decay unused highlights
 *
 * Schedule: 0 3 * * * (daily at 3 AM)
 */

import { NextRequest, NextResponse } from "next/server";
import { runDecay } from "@/lib/learning/self-updater";
import { verifyCronAuth } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================================
// AUTHENTICATION
// ============================================================================

function validateCronAuth(request: NextRequest): boolean {
  // Shared cron auth (Bearer token, x-cron-secret header, dev bypass)
  if (verifyCronAuth(request)) return true;

  // Additional: internal pg_cron call (via service role)
  const serviceKey = request.headers.get("x-service-key");
  if (serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return true;
  }

  return false;
}

// ============================================================================
// GET HANDLER (for Vercel CRON)
// ============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!validateCronAuth(request)) {
    console.warn("[HighlightDecay] Unauthorized CRON attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[HighlightDecay] Starting decay cycle...");

  try {
    const result = await runDecay();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      highlights_decayed: result.decayed,
    };

    console.log("[HighlightDecay] Decay completed:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[HighlightDecay] Decay failed:", error);
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
