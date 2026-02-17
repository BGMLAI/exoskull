// =====================================================
// CRON: /api/cron/skill-health
// Runs sandbox health checks on all approved skills.
// Revokes skills that fail 3 consecutive checks.
// Schedule: daily at 03:30 UTC
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { runHealthCheck } from "@/lib/skills/verification/smoke-test";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(_request: NextRequest) {
  const supabase = getServiceSupabase();

  // Fetch all approved, non-archived skills
  const { data: skills, error: fetchError } = await supabase
    .from("exo_generated_skills")
    .select("id, tenant_id, slug, executor_code, security_audit")
    .eq("approval_status", "approved")
    .is("archived_at", null);

  if (fetchError) {
    logger.error("[CRON] skill-health fetch error:", fetchError);
    return NextResponse.json(
      { error: "Failed to fetch skills", details: fetchError.message },
      { status: 500 },
    );
  }

  if (!skills || skills.length === 0) {
    return NextResponse.json({
      success: true,
      checked: 0,
      failed: 0,
      revoked: 0,
      timestamp: new Date().toISOString(),
    });
  }

  let checked = 0;
  let failed = 0;
  let revoked = 0;
  const failures: string[] = [];

  for (const skill of skills) {
    checked++;

    try {
      const result = await runHealthCheck(
        skill.executor_code,
        skill.tenant_id,
        skill.id,
      );

      const audit =
        typeof skill.security_audit === "object" && skill.security_audit
          ? (skill.security_audit as Record<string, unknown>)
          : {};

      const prevFailures =
        typeof audit.consecutiveHealthFailures === "number"
          ? audit.consecutiveHealthFailures
          : 0;

      if (!result.passed) {
        failed++;
        const newFailCount = prevFailures + 1;

        logger.warn(
          `[CRON] skill-health FAIL: ${skill.slug} (${newFailCount} consecutive)`,
          result.errors,
        );

        // 3 consecutive failures → revoke
        if (newFailCount >= 3) {
          await supabase
            .from("exo_generated_skills")
            .update({
              approval_status: "revoked",
              rejection_reason: `Auto-revoked: ${newFailCount} consecutive health check failures. Last errors: ${result.errors.join("; ")}`,
              security_audit: {
                ...audit,
                consecutiveHealthFailures: newFailCount,
                lastHealthCheck: new Date().toISOString(),
                lastHealthErrors: result.errors,
              },
              last_audit_at: new Date().toISOString(),
            })
            .eq("id", skill.id);

          revoked++;
          failures.push(`${skill.slug} (REVOKED after ${newFailCount} fails)`);
        } else {
          await supabase
            .from("exo_generated_skills")
            .update({
              security_audit: {
                ...audit,
                consecutiveHealthFailures: newFailCount,
                lastHealthCheck: new Date().toISOString(),
                lastHealthErrors: result.errors,
              },
              last_audit_at: new Date().toISOString(),
            })
            .eq("id", skill.id);

          failures.push(`${skill.slug} (fail ${newFailCount}/3)`);
        }
      } else {
        // Passed — reset consecutive failure counter
        if (prevFailures > 0) {
          await supabase
            .from("exo_generated_skills")
            .update({
              security_audit: {
                ...audit,
                consecutiveHealthFailures: 0,
                lastHealthCheck: new Date().toISOString(),
                lastHealthErrors: [],
              },
              last_audit_at: new Date().toISOString(),
            })
            .eq("id", skill.id);
        }
      }
    } catch (error) {
      logger.error(
        `[CRON] skill-health error on ${skill.slug}:`,
        (error as Error).message,
      );
      failures.push(`${skill.slug} (exception: ${(error as Error).message})`);
      failed++;
    }
  }

  logger.info(
    `[CRON] skill-health complete: ${checked} checked, ${failed} failed, ${revoked} revoked`,
  );

  return NextResponse.json({
    success: true,
    checked,
    failed,
    revoked,
    failures,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withCronGuard({ name: "skill-health" }, handler);
