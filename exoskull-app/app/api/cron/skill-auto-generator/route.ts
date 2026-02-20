/**
 * Skill Auto-Generator CRON
 *
 * Schedule: Daily @ 4 AM UTC
 * Processes pending skill suggestions → generates → auto-approves low-risk.
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { autoGenerateSkills } from "@/lib/skills/auto-generator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await autoGenerateSkills();

    logger.info("[CRON:skill-auto-generator] Completed:", {
      ...result,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error("[CRON:skill-auto-generator] Failed:", {
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        error: "Skill auto-generator failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "skill-auto-generator" }, handler);
