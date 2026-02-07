/**
 * Pętla Loop Orchestrator
 *
 * Central coordination for the IORS heartbeat loop system.
 * Three CRONs call into this class:
 *   - petla (1min)   → processUrgentEvent(), batchEnqueueEvents()
 *   - loop-15 (15min) → evaluateTenant(), processQueuedWork()
 *   - loop-daily (24h) → runDeepAnalysis(), resetDailyBudgets(), reclassifyTenants()
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logAdminError } from "@/lib/admin/logger";
import { classifyEvent, isUrgent } from "./loop-classifier";
import type {
  PetlaEvent,
  PetlaWorkItem,
  TenantLoopConfig,
  SubLoop,
  SubLoopResult,
  ActivityClass,
} from "./loop-types";

// ============================================================================
// EVENT BUS OPERATIONS
// ============================================================================

/**
 * Claim one urgent event (P0-P1) from the event bus.
 */
export async function claimUrgentEvent(
  workerId: string,
): Promise<PetlaEvent | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("claim_petla_event", {
    p_worker_id: workerId,
    p_max_priority: 1, // Only P0-P1
    p_lock_seconds: 55,
  });

  if (error) {
    console.error("[Petla] Failed to claim urgent event:", {
      error: error.message,
      workerId,
    });
    return null;
  }

  const event = Array.isArray(data) ? data[0] : data;
  return (event as PetlaEvent) || null;
}

/**
 * Batch-enqueue lower priority events (P2-P5) into the work queue.
 * Returns count of events enqueued.
 */
export async function batchEnqueueEvents(
  workerId: string,
  limit = 20,
): Promise<number> {
  const supabase = getServiceSupabase();

  // Fetch pending P2-P5 events
  const { data: events, error } = await supabase
    .from("exo_petla_events")
    .select("*")
    .eq("status", "pending")
    .gte("priority", 2)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !events?.length) return 0;

  let enqueued = 0;

  for (const event of events as PetlaEvent[]) {
    try {
      const classification = classifyEvent(event);

      // Insert work item into queue
      const { error: insertErr } = await supabase
        .from("exo_petla_queue")
        .insert({
          tenant_id: event.tenant_id,
          sub_loop: classification.sub_loop,
          priority: classification.priority,
          handler: classification.handler,
          params: event.payload,
          source_event_id: event.id,
          status: "queued",
        });

      if (!insertErr) {
        // Mark event as dispatched
        await supabase
          .from("exo_petla_events")
          .update({
            status: "dispatched",
            dispatched_at: new Date().toISOString(),
            claimed_by: workerId,
          })
          .eq("id", event.id);

        enqueued++;
      }
    } catch (err) {
      console.error("[Petla] Failed to enqueue event:", {
        eventId: event.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return enqueued;
}

/**
 * Mark an event as dispatched after processing.
 */
export async function markEventDispatched(eventId: string): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("exo_petla_events")
    .update({ status: "dispatched", dispatched_at: new Date().toISOString() })
    .eq("id", eventId);
}

// ============================================================================
// WORK QUEUE OPERATIONS
// ============================================================================

/**
 * Claim one work item from the queue for the specified sub-loops.
 */
export async function claimQueuedWork(
  workerId: string,
  subLoops: SubLoop[],
): Promise<PetlaWorkItem | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("claim_petla_work", {
    p_worker_id: workerId,
    p_sub_loops: subLoops,
    p_lock_seconds: 55,
  });

  if (error) {
    console.error("[Petla] Failed to claim work:", {
      error: error.message,
      workerId,
      subLoops,
    });
    return null;
  }

  const item = Array.isArray(data) ? data[0] : data;
  return (item as PetlaWorkItem) || null;
}

/**
 * Mark work item as completed.
 */
export async function completeWork(
  itemId: string,
  result: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("exo_petla_queue")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
      locked_until: null,
      locked_by: null,
    })
    .eq("id", itemId);
}

/**
 * Mark work item as failed. Re-queues if retries remain.
 */
export async function failWork(
  itemId: string,
  errorMessage: string,
): Promise<{ exhausted: boolean }> {
  const supabase = getServiceSupabase();

  const { data: item } = await supabase
    .from("exo_petla_queue")
    .select("retry_count, max_retries")
    .eq("id", itemId)
    .single();

  const newRetryCount = (item?.retry_count || 0) + 1;
  const maxRetries = item?.max_retries || 2;
  const exhausted = newRetryCount >= maxRetries;

  await supabase
    .from("exo_petla_queue")
    .update({
      status: exhausted ? "failed" : "queued",
      error: errorMessage,
      retry_count: newRetryCount,
      locked_until: null,
      locked_by: null,
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", itemId);

  if (exhausted) {
    await logAdminError(
      "petla:work-exhausted",
      "error",
      `Work item ${itemId} exhausted retries: ${errorMessage}`,
      { itemId },
    );
  }

  return { exhausted };
}

// ============================================================================
// TENANT EVALUATION (loop-15)
// ============================================================================

/**
 * Get tenants due for loop evaluation.
 */
export async function getTenantsDueForEval(
  limit = 5,
): Promise<TenantLoopConfig[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("get_tenants_due_for_eval", {
    p_limit: limit,
  });

  if (error) {
    console.error("[Petla] Failed to get tenants for eval:", {
      error: error.message,
    });
    return [];
  }

  return (data as TenantLoopConfig[]) || [];
}

/**
 * Quick state check for a tenant — DB only, no AI.
 * Returns a snapshot of what's interesting.
 */
export async function quickStateCheck(tenantId: string): Promise<{
  needsEval: boolean;
  pendingInterventions: number;
  overdueTasks: number;
  undeliveredInsights: number;
  hoursSinceLastContact: number;
}> {
  const supabase = getServiceSupabase();

  // Run checks in parallel
  const [interventions, tasks, insights, lastMsg] = await Promise.all([
    supabase
      .from("exo_autonomy_interventions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "proposed"),

    supabase
      .from("exo_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .lte("due_date", new Date().toISOString()),

    supabase
      .from("exo_insight_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("delivered_at", null),

    supabase
      .from("exo_unified_messages")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const pendingInterventions = interventions.count || 0;
  const overdueTasks = tasks.count || 0;
  const undeliveredInsights = insights.count || 0;

  const lastContactTime = lastMsg.data?.created_at
    ? new Date(lastMsg.data.created_at).getTime()
    : 0;
  const hoursSinceLastContact = lastContactTime
    ? (Date.now() - lastContactTime) / (1000 * 60 * 60)
    : 999;

  const needsEval =
    pendingInterventions > 0 ||
    overdueTasks > 0 ||
    undeliveredInsights > 0 ||
    hoursSinceLastContact > 24;

  return {
    needsEval,
    pendingInterventions,
    overdueTasks,
    undeliveredInsights,
    hoursSinceLastContact,
  };
}

/**
 * Classify a tenant's activity class based on their recent behavior.
 */
export function classifyActivity(
  config: TenantLoopConfig,
  currentHourInTz: number = new Date().getHours(),
): ActivityClass {
  const lastActivity = config.last_activity_at
    ? new Date(config.last_activity_at).getTime()
    : 0;
  const hoursSinceActivity = lastActivity
    ? (Date.now() - lastActivity) / (1000 * 60 * 60)
    : 999;

  // Sleep detection (simple: 23:00-07:00 in user's timezone)
  if (currentHourInTz >= 23 || currentHourInTz < 7) {
    return "sleeping";
  }

  if (hoursSinceActivity < 0.5) return "active";
  if (hoursSinceActivity < 24) return "normal";
  return "dormant";
}

/**
 * Update tenant loop state after evaluation.
 */
export async function updateTenantLoopState(
  tenantId: string,
  activityClass?: ActivityClass,
  aiCostCents = 0,
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase.rpc("update_tenant_loop_state", {
    p_tenant_id: tenantId,
    p_activity_class: activityClass || null,
    p_ai_cost_cents: aiCostCents,
  });

  if (error) {
    console.error("[Petla] Failed to update tenant loop state:", {
      tenantId,
      error: error.message,
    });
  }
}

// ============================================================================
// DAILY OPERATIONS (loop-daily)
// ============================================================================

/**
 * Reset daily budgets and counters for all tenants.
 */
export async function resetDailyBudgets(): Promise<number> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_tenant_loop_config")
    .update({
      daily_ai_spent_cents: 0,
      cycles_today: 0,
      interventions_today: 0,
      budget_reset_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .neq("daily_ai_spent_cents", 0) // Only update non-zero rows
    .select("tenant_id");

  if (error) {
    console.error("[Petla] Failed to reset daily budgets:", {
      error: error.message,
    });
    return 0;
  }

  return data?.length || 0;
}

/**
 * Reclassify all tenants' activity class based on recent patterns.
 */
export async function reclassifyTenants(): Promise<number> {
  const supabase = getServiceSupabase();

  const { data: configs, error } = await supabase
    .from("exo_tenant_loop_config")
    .select("*");

  if (error || !configs?.length) return 0;

  let reclassified = 0;

  for (const config of configs as TenantLoopConfig[]) {
    const newClass = classifyActivity(config);
    if (newClass !== config.activity_class) {
      await updateTenantLoopState(config.tenant_id, newClass);
      reclassified++;
    }
  }

  return reclassified;
}

/**
 * Prune old events from the event bus (older than N days).
 */
export async function pruneOldEvents(daysOld = 7): Promise<number> {
  const supabase = getServiceSupabase();
  const cutoff = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("exo_petla_events")
    .delete()
    .lt("created_at", cutoff)
    .in("status", ["dispatched", "ignored"])
    .select("id");

  if (error) {
    console.error("[Petla] Failed to prune old events:", {
      error: error.message,
    });
    return 0;
  }

  return data?.length || 0;
}

/**
 * Prune completed/failed work items from queue (older than N days).
 */
export async function pruneOldWorkItems(daysOld = 7): Promise<number> {
  const supabase = getServiceSupabase();
  const cutoff = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("exo_petla_queue")
    .delete()
    .lt("created_at", cutoff)
    .in("status", ["completed", "failed"])
    .select("id");

  if (error) {
    console.error("[Petla] Failed to prune old work items:", {
      error: error.message,
    });
    return 0;
  }

  return data?.length || 0;
}

// ============================================================================
// EVENT EMISSION HELPER
// ============================================================================

/**
 * Emit a petla event from TypeScript code (wraps the RPC).
 */
export async function emitEvent(params: {
  tenantId: string;
  eventType: PetlaEvent["event_type"];
  priority?: number;
  source?: string;
  payload?: Record<string, unknown>;
  dedupKey?: string;
  expiresMinutes?: number;
}): Promise<string | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("emit_petla_event", {
    p_tenant_id: params.tenantId,
    p_event_type: params.eventType,
    p_priority: params.priority ?? 3,
    p_source: params.source ?? "system",
    p_payload: params.payload ?? {},
    p_dedup_key: params.dedupKey ?? null,
    p_expires_minutes: params.expiresMinutes ?? 60,
  });

  if (error) {
    console.error("[Petla] Failed to emit event:", {
      error: error.message,
      tenantId: params.tenantId,
      eventType: params.eventType,
    });
    return null;
  }

  return data as string | null;
}
