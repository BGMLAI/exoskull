// =====================================================
// CRON: /api/cron/skill-lifecycle
// Archives unused dynamic skills (>30 days)
// Schedule: daily at 03:00 UTC
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import {
  archiveUnusedSkills,
  getSkillStats,
} from "@/lib/skills/registry/lifecycle-manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Archive unused skills
    const archiveResult = await archiveUnusedSkills(30);

    // Get stats
    const stats = await getSkillStats();

    return NextResponse.json({
      success: true,
      archived: archiveResult.archivedCount,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] skill-lifecycle error:", error);
    return NextResponse.json(
      {
        error: "Skill lifecycle cron failed",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
