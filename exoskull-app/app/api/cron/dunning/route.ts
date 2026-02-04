/**
 * Dunning Management Cron
 *
 * Runs every 6 hours to process failed payment retries.
 */

import { NextRequest, NextResponse } from "next/server";
import { processDunning } from "@/lib/business/dunning";

export const dynamic = "force-dynamic";

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || "exoskull-cron-2026";
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret === cronSecret) return true;

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const result = await processDunning();
    const duration = Date.now() - startTime;

    console.log("[Dunning] Cron complete:", {
      ...result,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      result,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Dunning] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}
