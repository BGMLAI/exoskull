import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { autoInstallMods } from "@/lib/builder/proactive-engine";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/complete - Mark onboarding as completed
 */
export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) {
      console.error("[Complete API] No user session");
      return NextResponse.json(
        { error: "Sesja wygasla. Zaloguj sie ponownie." },
        { status: 401 },
      );
    }
    const tenantId = auth.tenantId;

    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));
    const method = body.method || "form";

    logger.info("[Complete API] Starting for user:", tenantId, { method });

    // Update tenant status - THIS IS THE CRITICAL STEP
    const { error: updateError } = await supabase
      .from("exo_tenants")
      .update({
        onboarding_status: "completed",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateError) {
      console.error("[Complete API] Error updating status:", {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        userId: tenantId,
      });
      return NextResponse.json(
        { error: `Blad zapisu statusu: ${updateError.message}` },
        { status: 500 },
      );
    }

    // Non-critical operations below - don't let them break the flow
    try {
      await supabase.from("exo_onboarding_sessions").insert({
        tenant_id: tenantId,
        step: 1,
        step_name: "onboarding",
        completed_at: new Date().toISOString(),
        conversation_id: body.conversationId || null,
        data: { method },
      });
    } catch (e) {
      logger.warn(
        "[Complete API] Non-critical: onboarding session log failed:",
        e,
      );
    }

    // Schedule first check-in if morning time was set
    try {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("morning_checkin_time, preferred_name, checkin_enabled")
        .eq("id", tenantId)
        .single();

      if (tenant?.checkin_enabled && tenant?.morning_checkin_time) {
        const { data: morningJob } = await supabase
          .from("exo_scheduled_jobs")
          .select("id")
          .eq("job_name", "morning_checkin")
          .single();

        if (morningJob) {
          await supabase.from("exo_user_job_preferences").upsert({
            tenant_id: tenantId,
            job_id: morningJob.id,
            enabled: true,
            preferred_time: tenant.morning_checkin_time,
            custom_message: `Cześć ${tenant.preferred_name || ""}! Jak się dziś czujesz?`,
          });
        }
      }
    } catch (e) {
      logger.warn(
        "[Complete API] Non-critical: check-in scheduling failed:",
        e,
      );
    }

    logger.info("[Complete API] Onboarding completed for user:", tenantId);

    // Auto-install Mods based on user goals (fire-and-forget)
    autoInstallMods(tenantId).catch((err) =>
      console.error("[Complete API] Auto-install mods error:", err),
    );

    return NextResponse.json({
      success: true,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("[Complete API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
