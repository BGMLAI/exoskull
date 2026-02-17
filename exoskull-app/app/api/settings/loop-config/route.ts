/**
 * Loop Config Settings API
 *
 * GET: Returns full exo_tenant_loop_config + recent cycle stats
 * PATCH: Updates user_eval_interval_minutes, daily_ai_budget_cents
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    // Parallel: loop config + today's cycle count + today's intervention count
    const today = new Date().toISOString().slice(0, 10);
    const [configResult, cyclesResult, interventionsResult] =
      await Promise.allSettled([
        supabase
          .from("exo_tenant_loop_config")
          .select("*")
          .eq("tenant_id", tenantId)
          .single(),
        supabase
          .from("admin_cron_runs")
          .select("*", { count: "exact", head: true })
          .eq("cron_name", "loop-15")
          .gte("started_at", `${today}T00:00:00Z`),
        supabase
          .from("exo_interventions")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", `${today}T00:00:00Z`),
      ]);

    const config =
      configResult.status === "fulfilled" ? configResult.value.data : null;
    const cyclesToday =
      cyclesResult.status === "fulfilled" ? (cyclesResult.value.count ?? 0) : 0;
    const interventionsToday =
      interventionsResult.status === "fulfilled"
        ? (interventionsResult.value.count ?? 0)
        : 0;

    return NextResponse.json({
      config: config ?? null,
      stats: {
        cyclesToday,
        interventionsToday,
      },
    });
  } catch (error) {
    logger.error("[LoopConfigAPI] GET Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const PATCH = withApiLog(async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const body = await req.json();
    const updatePayload: Record<string, unknown> = {};

    // User eval interval
    if (body.user_eval_interval_minutes !== undefined) {
      const val = body.user_eval_interval_minutes;
      if (val === null || val === "auto") {
        updatePayload.user_eval_interval_minutes = null;
      } else {
        const n = Number(val);
        const validIntervals = [0, 5, 15, 30, 60];
        if (validIntervals.includes(n)) {
          updatePayload.user_eval_interval_minutes = n === 0 ? null : n;
        }
      }
    }

    // Daily AI budget
    if (body.daily_ai_budget_cents !== undefined) {
      const n = Number(body.daily_ai_budget_cents);
      if (!isNaN(n) && n >= 10 && n <= 500) {
        updatePayload.daily_ai_budget_cents = Math.round(n);
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("exo_tenant_loop_config")
      .update(updatePayload)
      .eq("tenant_id", tenantId);

    if (error) {
      logger.error("[LoopConfigAPI] PATCH failed:", {
        userId: tenantId,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Failed to update loop config" },
        { status: 500 },
      );
    }

    return NextResponse.json({ updated: updatePayload });
  } catch (error) {
    logger.error("[LoopConfigAPI] PATCH Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
