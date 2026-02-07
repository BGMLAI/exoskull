/**
 * CRON Health API — comprehensive health status of all CRON jobs.
 *
 * Returns circuit breaker state, dependency status, recent runs,
 * dead letter stats, and overall health classification.
 */

import { NextResponse } from "next/server";
import { requireAdmin, getAdminSupabase } from "@/lib/admin/auth";
import { getDeadLetterStats } from "@/lib/async-tasks/dead-letter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const db = getAdminSupabase();

    // Parallel queries
    const [healthRes, circuitRes, depsRes, deadLetterStats] = await Promise.all(
      [
        db.rpc("get_cron_health_summary", { p_hours: 48 }),
        db.from("admin_cron_circuit_breaker").select("*"),
        db.from("admin_cron_dependencies").select("*"),
        getDeadLetterStats(),
      ],
    );

    const healthMap = new Map(
      (healthRes.data || []).map((h: { cron_name: string }) => [
        h.cron_name,
        h,
      ]),
    );
    const circuitMap = new Map(
      (circuitRes.data || []).map((c: { cron_name: string }) => [
        c.cron_name,
        c,
      ]),
    );

    // Build dependency map
    const depMap = new Map<string, string[]>();
    for (const dep of depsRes.data || []) {
      if (!depMap.has(dep.cron_name)) depMap.set(dep.cron_name, []);
      depMap.get(dep.cron_name)!.push(dep.depends_on);
    }

    // Get all known cron names from health data
    const cronNames = new Set<string>();
    for (const h of healthRes.data || []) cronNames.add(h.cron_name);
    for (const c of circuitRes.data || []) cronNames.add(c.cron_name);

    const crons = Array.from(cronNames)
      .sort()
      .map((name) => {
        const health = healthMap.get(name) as
          | Record<string, unknown>
          | undefined;
        const cb = circuitMap.get(name) as Record<string, unknown> | undefined;
        return {
          name,
          last_run: health
            ? {
                status: health.last_status,
                duration_ms: health.avg_duration_ms,
                at: health.last_run_at,
              }
            : null,
          stats_48h: health
            ? {
                total: health.total_runs,
                success: health.successful_runs,
                failed: health.failed_runs,
                avg_duration_ms: health.avg_duration_ms,
              }
            : null,
          circuit_breaker: cb
            ? {
                state: cb.state,
                consecutive_failures: cb.consecutive_failures,
                cooldown_until: cb.cooldown_until,
                last_error: cb.last_error,
              }
            : { state: "closed", consecutive_failures: 0 },
          dependencies: depMap.get(name) || [],
        };
      });

    // Calculate overall health
    const openCircuits = crons.filter(
      (c) => c.circuit_breaker.state === "open",
    ).length;
    const halfOpenCircuits = crons.filter(
      (c) => c.circuit_breaker.state === "half-open",
    ).length;

    let overall_health: "healthy" | "degraded" | "critical" = "healthy";
    if (openCircuits >= 3 || deadLetterStats.unreviewed >= 20) {
      overall_health = "critical";
    } else if (
      openCircuits >= 1 ||
      halfOpenCircuits >= 1 ||
      deadLetterStats.unreviewed >= 5
    ) {
      overall_health = "degraded";
    }

    return NextResponse.json({
      overall_health,
      crons,
      dead_letters: deadLetterStats,
      circuit_breakers: {
        open: openCircuits,
        half_open: halfOpenCircuits,
        total: circuitRes.data?.length || 0,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminCronHealth] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
