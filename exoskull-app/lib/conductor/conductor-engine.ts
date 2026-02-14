/**
 * Conductor Engine — Core selection and execution logic.
 *
 * Called by the conductor CRON every minute. Ensures the system
 * maintains at least MIN_CONCURRENT active processes at all times.
 *
 * Flow:
 * 1. Expire stale processes
 * 2. Count active processes
 * 3. If deficit: select + execute work from catalog
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getActiveTenants } from "@/lib/cron/tenant-utils";
import {
  expireStaleProcesses,
  countActiveProcesses,
  claimConductorWork,
  completeProcess,
  getDailySpend,
  getWorkLastCompleted,
  type ActiveProcessCounts,
} from "./process-registry";
import {
  WORK_CATALOG,
  sortByPriority,
  type WorkCatalogEntry,
  type WorkCategory,
  type WorkContext,
} from "./work-catalog";
import { logger } from "@/lib/logger";

const CONDUCTOR_TIMEOUT_MS = 55_000;

interface ConductorConfig {
  minConcurrent: number;
  maxConcurrent: number;
  maxWorkPerMinute: number;
  dailyBudgetCents: number;
  enabled: boolean;
  workPriorities: Record<WorkCategory, number>;
}

export interface ConductorCycleResult {
  expired: number;
  activeProcesses: ActiveProcessCounts;
  deficit: number;
  workSpawned: Array<{
    id: string;
    tenant?: string;
    durationMs: number;
    costCents: number;
    success: boolean;
  }>;
  budgetSpent: number;
  budgetRemaining: number;
  durationMs: number;
  skippedReason?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

async function loadConfig(): Promise<ConductorConfig> {
  const db = getServiceSupabase();
  const { data } = await db.from("exo_conductor_config").select("key, value");

  const cfg: Record<string, unknown> = {};
  for (const row of data || []) {
    cfg[row.key] = row.value;
  }

  const defaultPriorities: Record<WorkCategory, number> = {
    user_facing: 100,
    intelligence: 80,
    system_maintenance: 50,
    optimization: 30,
    speculative: 10,
  };

  return {
    minConcurrent: Number(cfg.min_concurrent ?? 2),
    maxConcurrent: Number(cfg.max_concurrent ?? 5),
    maxWorkPerMinute: Number(cfg.max_conductor_work_per_minute ?? 2),
    dailyBudgetCents: Number(cfg.daily_system_budget_cents ?? 100),
    enabled: cfg.enabled !== false,
    workPriorities:
      (cfg.work_priorities as Record<WorkCategory, number>) ??
      defaultPriorities,
  };
}

// ============================================================================
// WORK SELECTION
// ============================================================================

async function isCooldownElapsed(
  entry: WorkCatalogEntry,
  tenantId?: string,
): Promise<boolean> {
  if (entry.cooldownMinutes <= 0) return true;
  const lastCompleted = await getWorkLastCompleted(entry.id, tenantId ?? null);
  if (!lastCompleted) return true;
  const elapsed = (Date.now() - lastCompleted.getTime()) / 60_000;
  return elapsed >= entry.cooldownMinutes;
}

async function selectWork(
  config: ConductorConfig,
  budgetRemaining: number,
  timeRemaining: number,
  tenantIds: string[],
): Promise<{ entry: WorkCatalogEntry; tenantId?: string } | null> {
  const sorted = sortByPriority(WORK_CATALOG, config.workPriorities);

  for (const entry of sorted) {
    // Skip if too expensive
    if (entry.estimatedCostCents > budgetRemaining) continue;
    // Skip if won't fit in time budget
    if (entry.maxDurationMs > timeRemaining) continue;

    if (entry.perTenant) {
      // Try each tenant (round-robin via random shuffle for fairness)
      const shuffled = [...tenantIds].sort(() => Math.random() - 0.5);
      for (const tid of shuffled) {
        if (!(await isCooldownElapsed(entry, tid))) continue;
        try {
          const ctx: WorkContext = {
            workerId: "",
            processId: "",
            tenantId: tid,
            budgetRemainingCents: budgetRemaining,
            timeRemainingMs: timeRemaining,
            startTime: Date.now(),
          };
          if (await entry.isEligible(ctx)) {
            return { entry, tenantId: tid };
          }
        } catch (err) {
          logger.warn(`[Conductor] Eligibility check failed: ${entry.id}`, {
            tenant: tid,
            error: err instanceof Error ? err.message : err,
          });
        }
      }
    } else {
      // Global work
      if (!(await isCooldownElapsed(entry))) continue;
      try {
        const ctx: WorkContext = {
          workerId: "",
          processId: "",
          budgetRemainingCents: budgetRemaining,
          timeRemainingMs: timeRemaining,
          startTime: Date.now(),
        };
        if (await entry.isEligible(ctx)) {
          return { entry };
        }
      } catch (err) {
        logger.warn(`[Conductor] Eligibility check failed: ${entry.id}`, {
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  return null;
}

// ============================================================================
// MAIN CYCLE
// ============================================================================

export async function runConductorCycle(
  workerId: string,
): Promise<ConductorCycleResult> {
  const cycleStart = Date.now();

  // Step 1: Expire stale processes
  const expired = await expireStaleProcesses();
  if (expired > 0) {
    logger.info(`[Conductor] Expired ${expired} stale processes`);
  }

  // Step 2: Count active
  const activeProcesses = await countActiveProcesses();

  // Step 3: Load config
  const config = await loadConfig();
  if (!config.enabled) {
    return {
      expired,
      activeProcesses,
      deficit: 0,
      workSpawned: [],
      budgetSpent: 0,
      budgetRemaining: config.dailyBudgetCents,
      durationMs: Date.now() - cycleStart,
      skippedReason: "disabled",
    };
  }

  // Step 4: Calculate deficit
  const deficit = Math.max(0, config.minConcurrent - activeProcesses.total);

  if (deficit <= 0) {
    return {
      expired,
      activeProcesses,
      deficit: 0,
      workSpawned: [],
      budgetSpent: 0,
      budgetRemaining: config.dailyBudgetCents,
      durationMs: Date.now() - cycleStart,
    };
  }

  // Step 5: Check budget
  const dailySpend = await getDailySpend();
  let budgetRemaining = config.dailyBudgetCents - dailySpend;

  // Step 6: Get tenants for per-tenant work
  const tenants = await getActiveTenants();
  const tenantIds = tenants.map((t) => t.id);

  // Step 7: Fill deficit
  const workSpawned: ConductorCycleResult["workSpawned"] = [];
  const slotsToFill = Math.min(deficit, config.maxWorkPerMinute);

  for (let i = 0; i < slotsToFill; i++) {
    const timeRemaining = CONDUCTOR_TIMEOUT_MS - (Date.now() - cycleStart);
    if (timeRemaining < 10_000) break; // Not enough time for any work

    const selection = await selectWork(
      config,
      budgetRemaining,
      timeRemaining,
      tenantIds,
    );
    if (!selection) {
      logger.info("[Conductor] No eligible work found for remaining slots");
      break;
    }

    const { entry, tenantId } = selection;

    // Atomic claim (dedup)
    const processId = await claimConductorWork(
      workerId,
      entry.id,
      tenantId ?? null,
    );

    if (!processId) {
      logger.info(`[Conductor] Work ${entry.id} already running, skipping`);
      continue;
    }

    // Execute inline
    const workStart = Date.now();
    logger.info(
      `[Conductor] Executing: ${entry.id}${tenantId ? ` (tenant: ${tenantId.slice(0, 8)})` : ""}`,
    );

    try {
      const ctx: WorkContext = {
        workerId,
        processId,
        tenantId,
        budgetRemainingCents: budgetRemaining,
        timeRemainingMs: Math.min(entry.maxDurationMs, timeRemaining - 5_000),
        startTime: workStart,
      };

      const result = await entry.execute(ctx);
      const durationMs = Date.now() - workStart;

      await completeProcess(
        processId,
        result.success ? "completed" : "failed",
        result.result ?? null,
        result.error ?? null,
        result.costCents,
      );

      budgetRemaining -= result.costCents;

      workSpawned.push({
        id: entry.id,
        tenant: tenantId?.slice(0, 8),
        durationMs,
        costCents: result.costCents,
        success: result.success,
      });

      logger.info(
        `[Conductor] Completed: ${entry.id} in ${durationMs}ms (cost: ${result.costCents}c)`,
      );
    } catch (err) {
      const durationMs = Date.now() - workStart;
      const errMsg = err instanceof Error ? err.message : String(err);

      await completeProcess(processId, "failed", null, errMsg, 0);

      workSpawned.push({
        id: entry.id,
        tenant: tenantId?.slice(0, 8),
        durationMs,
        costCents: 0,
        success: false,
      });

      logger.error(`[Conductor] Failed: ${entry.id}`, {
        error: errMsg,
        durationMs,
      });
    }
  }

  return {
    expired,
    activeProcesses,
    deficit,
    workSpawned,
    budgetSpent:
      dailySpend + workSpawned.reduce((sum, w) => sum + w.costCents, 0),
    budgetRemaining,
    durationMs: Date.now() - cycleStart,
  };
}
