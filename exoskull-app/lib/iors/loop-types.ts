/**
 * Pętla Loop System — TypeScript Types
 *
 * Event bus, work queue, and per-tenant adaptive timing types
 * for the IORS 15-minute heartbeat loop.
 */

// ============================================================================
// EVENT BUS
// ============================================================================

export type PetlaEventType =
  | "crisis" // P0
  | "outbound_ready" // P1
  | "proactive_trigger" // P2
  | "data_ingested" // P3
  | "optimization_signal" // P4
  | "maintenance_due"; // P5

export interface PetlaEvent {
  id: string;
  tenant_id: string;
  event_type: PetlaEventType;
  priority: number;
  source: string;
  payload: Record<string, unknown>;
  status: "pending" | "claimed" | "dispatched" | "ignored";
  claimed_by: string | null;
  claimed_at: string | null;
  dispatched_at: string | null;
  dedup_key: string | null;
  created_at: string;
  expires_at: string | null;
}

// ============================================================================
// WORK QUEUE
// ============================================================================

export type SubLoop =
  | "emergency" // P0
  | "outbound" // P1
  | "proactive" // P2
  | "observation" // P3
  | "optimization" // P4
  | "maintenance"; // P5

export interface PetlaWorkItem {
  id: string;
  tenant_id: string;
  sub_loop: SubLoop;
  priority: number;
  handler: string;
  params: Record<string, unknown>;
  scheduled_for: string;
  recurrence: string | null;
  last_run_at: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "paused";
  result: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  locked_until: string | null;
  locked_by: string | null;
  source_event_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================================
// TENANT LOOP CONFIG
// ============================================================================

export type ActivityClass = "active" | "normal" | "dormant" | "sleeping";

export interface TenantLoopConfig {
  tenant_id: string;
  activity_class: ActivityClass;
  eval_interval_minutes: number;
  last_eval_at: string | null;
  next_eval_at: string | null;
  last_activity_at: string | null;
  daily_ai_budget_cents: number;
  daily_ai_spent_cents: number;
  budget_reset_at: string;
  cycles_today: number;
  interventions_today: number;
  timezone: string;
  updated_at: string;
}

// ============================================================================
// SUB-LOOP HANDLER RESULT
// ============================================================================

export interface SubLoopResult {
  handled: boolean;
  cost_cents?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export type SubLoopHandler = (item: PetlaWorkItem) => Promise<SubLoopResult>;
