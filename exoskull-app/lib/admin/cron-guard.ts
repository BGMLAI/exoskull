/**
 * CRON Guard — Reliability wrapper for all CRON routes.
 *
 * Provides:
 * - Auth verification (reuses verifyCronAuth)
 * - DB-backed circuit breaker (serverless-safe)
 * - Dependency chain validation (ETL pipeline)
 * - Timeout enforcement (55s under Vercel 60s limit)
 * - Structured logging via existing admin logger
 *
 * Replaces the unused withCronLogging() from cron-wrapper.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { logCronStart, logCronComplete, logCronFailed } from "./logger";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  registerProcess,
  completeProcess,
} from "@/lib/conductor/process-registry";

import { logger } from "@/lib/logger";
type CronHandler = (req: NextRequest) => Promise<NextResponse>;

interface CronGuardOptions {
  /** CRON identifier (e.g., "bronze-etl") */
  name: string;
  /** Names of CRONs that must have succeeded recently */
  dependencies?: string[];
  /** Circuit breaker config */
  circuitBreaker?: {
    /** Consecutive failures before opening circuit (default: 3) */
    failureThreshold?: number;
    /** Minutes to wait before half-open retry (default: 30) */
    cooldownMinutes?: number;
  };
  /** Max execution time in ms (default: 55000) */
  timeoutMs?: number;
}

/**
 * Wrap a CRON route handler with auth, circuit breaker, dependency checks, and logging.
 *
 * Usage:
 * ```ts
 * async function handler(req: NextRequest) { ... }
 * export const GET = withCronGuard({ name: "engagement-scoring" }, handler);
 * ```
 */
export function withCronGuard(
  options: CronGuardOptions,
  handler: CronHandler,
): CronHandler {
  const {
    name,
    dependencies = [],
    circuitBreaker = {},
    timeoutMs = 55_000,
  } = options;

  const failureThreshold = circuitBreaker.failureThreshold ?? 3;
  const cooldownMinutes = circuitBreaker.cooldownMinutes ?? 30;

  return async (req: NextRequest) => {
    // 1. Auth
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getServiceSupabase();

    // 2. Circuit breaker check
    const { data: cbRows } = await db
      .from("admin_cron_circuit_breaker")
      .select("state, cooldown_until, consecutive_failures")
      .eq("cron_name", name)
      .maybeSingle();

    if (cbRows?.state === "open") {
      const cooldownUntil = cbRows.cooldown_until
        ? new Date(cbRows.cooldown_until)
        : null;
      if (cooldownUntil && cooldownUntil > new Date()) {
        logger.warn(
          `[CronGuard:${name}] Circuit OPEN — skipping (cooldown until ${cbRows.cooldown_until})`,
        );
        return NextResponse.json({
          skipped: true,
          reason: "circuit_breaker_open",
          cooldown_until: cbRows.cooldown_until,
          consecutive_failures: cbRows.consecutive_failures,
        });
      }
      // Cooldown expired → half-open, allow test run
      console.info(`[CronGuard:${name}] Circuit HALF-OPEN — allowing test run`);
    }

    // 3. Dependency check
    if (dependencies.length > 0) {
      const { data: depStatus } = await db.rpc("check_cron_dependencies", {
        p_cron_name: name,
      });

      const unsatisfied = (depStatus || []).filter(
        (d: { satisfied: boolean }) => !d.satisfied,
      );
      if (unsatisfied.length > 0) {
        // Staleness bypass: if this CRON hasn't succeeded in >24h, run anyway
        // to prevent permanent cascade blockage (e.g. gold-etl blocked forever)
        const { data: lastRun } = await db
          .from("admin_cron_runs")
          .select("completed_at")
          .eq("cron_name", name)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastSuccess = lastRun?.completed_at
          ? new Date(lastRun.completed_at)
          : null;
        const hoursSinceSuccess = lastSuccess
          ? (Date.now() - lastSuccess.getTime()) / (1000 * 60 * 60)
          : Infinity;

        if (hoursSinceSuccess > 24) {
          logger.warn(
            `[CronGuard:${name}] Dependencies not met but CRON stale (${Math.round(hoursSinceSuccess)}h since last success) — bypassing`,
          );
        } else {
          const reasons = unsatisfied.map(
            (d: {
              dependency: string;
              last_success: string | null;
              required_within_hours: number;
            }) =>
              `${d.dependency}: last success ${d.last_success || "never"} (required within ${d.required_within_hours}h)`,
          );
          logger.warn(
            `[CronGuard:${name}] Dependencies not met:`,
            reasons.join(", "),
          );
          return NextResponse.json({
            skipped: true,
            reason: "dependency_not_met",
            unsatisfied_dependencies: reasons,
          });
        }
      }
    }

    // 4. Start logging
    const runId = await logCronStart(name);

    // 4.5 Register in process registry (makes all CRONs visible to conductor)
    const cronWorkerId = `cron-${name}-${Date.now()}`;
    const processId = await registerProcess(
      "cron",
      name,
      cronWorkerId,
      undefined,
      undefined,
      {},
      Math.ceil(timeoutMs / 1000) + 10,
    );

    // 5. Execute with timeout
    try {
      const response = await Promise.race([
        handler(req),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      const status = response.status;

      // Extract result summary from response body
      let resultSummary: Record<string, unknown> = {};
      try {
        const cloned = response.clone();
        resultSummary = await cloned.json();
      } catch {
        /* not JSON */
      }

      if (status >= 400) {
        const errorMsg = (resultSummary?.error as string) || `HTTP ${status}`;
        await logCronFailed(runId, new Error(errorMsg), status);
        await db.rpc("record_cron_failure", {
          p_cron_name: name,
          p_error: errorMsg,
          p_failure_threshold: failureThreshold,
          p_cooldown_minutes: cooldownMinutes,
        });
        if (processId)
          await completeProcess(processId, "failed", null, errorMsg);
      } else {
        await logCronComplete(runId, resultSummary, status);
        await db.rpc("record_cron_success", { p_cron_name: name });
        if (processId)
          await completeProcess(processId, "completed", resultSummary);
      }

      return response;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await logCronFailed(runId, error);
      await db.rpc("record_cron_failure", {
        p_cron_name: name,
        p_error: errMsg,
        p_failure_threshold: failureThreshold,
        p_cooldown_minutes: cooldownMinutes,
      });
      if (processId) await completeProcess(processId, "failed", null, errMsg);

      return NextResponse.json(
        { error: errMsg, cron: name, timestamp: new Date().toISOString() },
        { status: 500 },
      );
    }
  };
}
