/**
 * Process Registry — TypeScript wrappers around process conductor RPCs.
 *
 * All operations are atomic (single RPC call) to prevent race conditions
 * between concurrent conductor instances.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

export type ProcessType =
  | "cron"
  | "conductor_work"
  | "async_task"
  | "event_handler";

export interface ActiveProcessCounts {
  total: number;
  cron: number;
  conductor: number;
  async: number;
  event: number;
}

/**
 * Register a running process in the registry.
 * Returns the process UUID (used to mark completion later).
 */
export async function registerProcess(
  processType: ProcessType,
  processName: string,
  workerId: string,
  tenantId?: string | null,
  workCatalogId?: string | null,
  params: Record<string, unknown> = {},
  ttlSeconds = 65,
): Promise<string | null> {
  try {
    const { data, error } = await getServiceSupabase().rpc("register_process", {
      p_process_type: processType,
      p_process_name: processName,
      p_worker_id: workerId,
      p_tenant_id: tenantId ?? null,
      p_work_catalog_id: workCatalogId ?? null,
      p_params: params,
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      console.error("[ProcessRegistry] register failed:", error.message);
      return null;
    }

    return data as string;
  } catch (err) {
    console.error("[ProcessRegistry] register error:", err);
    return null;
  }
}

/**
 * Mark a process as completed/failed.
 */
export async function completeProcess(
  processId: string,
  status: "completed" | "failed" = "completed",
  result?: Record<string, unknown> | null,
  errorMsg?: string | null,
  costCents = 0,
): Promise<void> {
  try {
    await getServiceSupabase().rpc("complete_process", {
      p_process_id: processId,
      p_status: status,
      p_result: result ?? null,
      p_error: errorMsg ?? null,
      p_cost_cents: costCents,
    });
  } catch (err) {
    console.error("[ProcessRegistry] complete error:", err);
  }
}

/**
 * Expire stale processes (TTL exceeded or no heartbeat for >120s).
 * Returns count of expired processes.
 */
export async function expireStaleProcesses(): Promise<number> {
  try {
    const { data, error } = await getServiceSupabase().rpc(
      "expire_stale_processes",
    );
    if (error) {
      console.error("[ProcessRegistry] expire error:", error.message);
      return 0;
    }
    return (data as number) || 0;
  } catch (err) {
    console.error("[ProcessRegistry] expire error:", err);
    return 0;
  }
}

/**
 * Count currently active processes by type.
 */
export async function countActiveProcesses(): Promise<ActiveProcessCounts> {
  const fallback: ActiveProcessCounts = {
    total: 0,
    cron: 0,
    conductor: 0,
    async: 0,
    event: 0,
  };
  try {
    const { data, error } = await getServiceSupabase().rpc(
      "count_active_processes",
    );
    if (error) {
      console.error("[ProcessRegistry] count error:", error.message);
      return fallback;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fallback;
    return {
      total: row.total_active ?? 0,
      cron: row.cron_active ?? 0,
      conductor: row.conductor_active ?? 0,
      async: row.async_active ?? 0,
      event: row.event_active ?? 0,
    };
  } catch (err) {
    console.error("[ProcessRegistry] count error:", err);
    return fallback;
  }
}

/**
 * Atomically claim a conductor work item (dedup check + registration).
 * Returns processId or null if already running.
 */
export async function claimConductorWork(
  workerId: string,
  workCatalogId: string,
  tenantId?: string | null,
  params: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { data, error } = await getServiceSupabase().rpc(
      "claim_conductor_work",
      {
        p_worker_id: workerId,
        p_work_catalog_id: workCatalogId,
        p_tenant_id: tenantId ?? null,
        p_params: params,
      },
    );

    if (error) {
      console.error("[ProcessRegistry] claim error:", error.message);
      return null;
    }

    return (data as string) || null;
  } catch (err) {
    console.error("[ProcessRegistry] claim error:", err);
    return null;
  }
}

/**
 * Get total conductor spend today (in cents).
 */
export async function getDailySpend(): Promise<number> {
  try {
    const { data, error } = await getServiceSupabase().rpc(
      "get_conductor_daily_spend",
    );
    if (error) return 0;
    return (data as number) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get last completed timestamp for a work catalog entry (for cooldown checks).
 */
export async function getWorkLastCompleted(
  workCatalogId: string,
  tenantId?: string | null,
): Promise<Date | null> {
  try {
    const { data, error } = await getServiceSupabase().rpc(
      "get_work_last_completed",
      {
        p_work_catalog_id: workCatalogId,
        p_tenant_id: tenantId ?? null,
      },
    );
    if (error || !data) return null;
    return new Date(data as string);
  } catch {
    return null;
  }
}
