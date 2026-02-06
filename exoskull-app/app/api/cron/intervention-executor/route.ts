/**
 * Intervention Executor Cron
 *
 * Runs every 15 minutes to:
 * 1. Auto-approve interventions that have passed their timeout
 * 2. Execute approved interventions from the queue
 *
 * Vercel cron: every 15 minutes
 */

import { NextRequest, NextResponse } from "next/server";
import { processQueue, processTimeouts } from "@/lib/autonomy/executor";
import { withCronGuard } from "@/lib/admin/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Step 1: Auto-approve timed-out interventions
    const autoApproved = await processTimeouts();

    // Step 2: Execute due items from queue
    const queueResult = await processQueue(10);

    const duration = Date.now() - startTime;

    console.log("[InterventionExecutor] Cron complete:", {
      autoApproved,
      ...queueResult,
      durationMs: duration,
    });

    return NextResponse.json({
      ok: true,
      autoApproved,
      ...queueResult,
      durationMs: duration,
    });
  } catch (error) {
    console.error("[InterventionExecutor] Cron error:", error);
    return NextResponse.json(
      {
        error: "Intervention executor failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "intervention-executor" }, handler);
