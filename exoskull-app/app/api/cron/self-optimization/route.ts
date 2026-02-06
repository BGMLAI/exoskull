/**
 * Self-Optimization CRON — L10 MAPE-K Auto-Trigger
 *
 * Runs every 6 hours to execute MAPE-K cycles for all active tenants.
 * Each cycle: Monitor → Analyze → Plan → Execute → Knowledge
 *
 * Schedule: every 6 hours (Vercel cron)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runAutonomyCycle } from "@/lib/autonomy/mape-k-loop";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TENANT_TIMEOUT_MS = 30_000; // 30s max per tenant

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    tenantsProcessed: 0,
    cyclesCompleted: 0,
    cyclesFailed: 0,
    totalProposed: 0,
    totalExecuted: 0,
    errors: 0,
  };

  try {
    const supabase = createServiceClient();

    // Get all active tenants
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id")
      .eq("status", "active");

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        ...results,
        message: "No active tenants",
        durationMs: Date.now() - startTime,
      });
    }

    // Process each tenant with timeout
    for (const tenant of tenants) {
      results.tenantsProcessed++;

      try {
        const cycleResult = await Promise.race([
          runAutonomyCycle(tenant.id, "cron"),
          new Promise<null>((_, reject) =>
            setTimeout(
              () => reject(new Error("Tenant cycle timeout")),
              TENANT_TIMEOUT_MS,
            ),
          ),
        ]);

        if (cycleResult && cycleResult.success) {
          results.cyclesCompleted++;
          results.totalProposed += cycleResult.plan.interventions.length;
          results.totalExecuted += cycleResult.execute.interventionsExecuted;
        } else {
          results.cyclesFailed++;
          if (cycleResult?.error) {
            console.error(
              `[SelfOptimization] Cycle failed for tenant ${tenant.id}:`,
              cycleResult.error,
            );
          }
        }
      } catch (error) {
        results.errors++;
        results.cyclesFailed++;
        console.error(
          `[SelfOptimization] Error for tenant ${tenant.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const duration = Date.now() - startTime;

    console.log("[SelfOptimization] CRON complete:", {
      ...results,
      durationMs: duration,
    });

    return NextResponse.json({
      ok: true,
      ...results,
      durationMs: duration,
    });
  } catch (error) {
    console.error("[SelfOptimization] CRON error:", error);
    return NextResponse.json(
      {
        error: "Self-optimization failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
