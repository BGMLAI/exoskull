// =====================================================
// CRON: /api/cron/skill-lifecycle
// Archives unused dynamic skills (>30 days)
// Schedule: daily at 03:00 UTC
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  archiveUnusedSkills,
  getSkillStats,
  expireOldSuggestions,
  revokeUnhealthySkills,
} from "@/lib/skills/registry/lifecycle-manager";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(request: NextRequest) {
  try {
    // Archive unused skills
    const archiveResult = await archiveUnusedSkills(30);

    // Expire old skill suggestions (>14 days pending)
    const expiredCount = await expireOldSuggestions(14);

    // Revoke unhealthy skills (>30% error rate)
    const revokeResult = await revokeUnhealthySkills();

    // Get stats
    const stats = await getSkillStats();

    return NextResponse.json({
      success: true,
      archived: archiveResult.archivedCount,
      suggestions_expired: expiredCount,
      skills_revoked: revokeResult.revokedCount,
      revoked_skills: revokeResult.skills,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[CRON] skill-lifecycle error:", error);
    return NextResponse.json(
      { error: "Skill lifecycle cron failed" },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "skill-lifecycle" }, handler);
