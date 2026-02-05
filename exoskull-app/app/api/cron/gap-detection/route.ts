// =====================================================
// CRON: /api/cron/gap-detection
// Runs gap detection for all active tenants (weekly)
// Schedule: Sundays at 09:00 UTC
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron/auth";
import { detectGaps } from "@/lib/agents/specialized/gap-detector";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Get active tenants
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id")
      .in("subscription_status", ["active", "trial"])
      .limit(100);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        status: "completed",
        tenants_checked: 0,
        message: "No active tenants",
        duration_ms: Date.now() - startTime,
      });
    }

    let successCount = 0;
    let errorCount = 0;
    let totalGaps = 0;
    const errors: Array<{ tenant_id: string; error: string }> = [];

    for (const tenant of tenants) {
      try {
        const result = await detectGaps(tenant.id, true); // forceRun=true (CRON is the trigger)

        if (result.success) {
          successCount++;
          const data = result.result as Record<string, number> | undefined;
          totalGaps += data?.gapsDetected || 0;
        } else {
          errorCount++;
          errors.push({
            tenant_id: tenant.id,
            error: result.error || "Unknown error",
          });
        }
      } catch (error) {
        errorCount++;
        errors.push({
          tenant_id: tenant.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log("[GapDetection] Cron complete:", {
      tenantsChecked: tenants.length,
      successCount,
      errorCount,
      totalGaps,
      durationMs: duration,
    });

    return NextResponse.json({
      status: "completed",
      tenants_checked: tenants.length,
      success_count: successCount,
      error_count: errorCount,
      total_gaps: totalGaps,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      duration_ms: duration,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GapDetection] Cron failed:", { error: errorMsg });
    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 },
    );
  }
}
