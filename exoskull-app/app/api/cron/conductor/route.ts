/**
 * Process Conductor CRON — "Never Idle" System
 *
 * Runs every 1 minute. Monitors active process count and spawns
 * autonomous work when it drops below MIN_CONCURRENT (default: 2).
 *
 * Flow:
 * 1. Expire stale processes (crashed/timed-out)
 * 2. Count active processes (CRONs + conductor work + async tasks)
 * 3. If active < threshold: pick highest-priority eligible work from catalog
 * 4. Execute work inline (within 55s budget)
 * 5. Return summary for admin dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { runConductorCycle } from "@/lib/conductor/conductor-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(_req: NextRequest) {
  const workerId = `conductor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const result = await runConductorCycle(workerId);

  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export const GET = withCronGuard({ name: "conductor" }, handler);
