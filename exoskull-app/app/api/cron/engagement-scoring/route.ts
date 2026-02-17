/**
 * Engagement Scoring Cron
 *
 * Runs daily at 07:00 UTC.
 * Calculates engagement scores and churn risk for all active tenants.
 * Triggers re-engagement sequences for high-risk users.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateAllEngagementScores,
  getChurnRiskUsers,
} from "@/lib/marketing/engagement";
import { triggerReengagement } from "@/lib/marketing/drip-engine";
import { withCronGuard } from "@/lib/admin/cron-guard";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Calculate scores
    const scores = await calculateAllEngagementScores();

    // Auto-trigger reengagement for high churn risk
    const churnRiskUsers = await getChurnRiskUsers(0.7);
    let reengagementsTriggered = 0;

    for (const user of churnRiskUsers) {
      try {
        await triggerReengagement(user.tenant_id);
        reengagementsTriggered++;
      } catch (error) {
        logger.error("[EngagementCron] Reengagement trigger error:", {
          error: error instanceof Error ? error.message : String(error),
          tenantId: user.tenant_id,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[EngagementCron] Complete:", {
      processed: scores.processed,
      errors: scores.errors,
      highChurnUsers: churnRiskUsers.length,
      reengagementsTriggered,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      scores_calculated: scores.processed,
      score_errors: scores.errors,
      high_churn_users: churnRiskUsers.length,
      reengagements_triggered: reengagementsTriggered,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[EngagementCron] Failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "engagement-scoring" }, handler);
