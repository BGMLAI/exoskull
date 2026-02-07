/**
 * Pętla Event Classifier
 *
 * Maps event_type → sub_loop + handler + priority.
 * Pure TypeScript, zero AI calls. Fast heuristic classification.
 */

import type { PetlaEvent, PetlaEventType, SubLoop } from "./loop-types";

// ============================================================================
// CLASSIFICATION MAP
// ============================================================================

interface ClassificationResult {
  sub_loop: SubLoop;
  handler: string;
  priority: number;
}

const EVENT_TYPE_MAP: Record<PetlaEventType, ClassificationResult> = {
  crisis: {
    sub_loop: "emergency",
    handler: "escalate_crisis",
    priority: 0,
  },
  outbound_ready: {
    sub_loop: "outbound",
    handler: "execute_outbound",
    priority: 1,
  },
  proactive_trigger: {
    sub_loop: "proactive",
    handler: "deliver_proactive",
    priority: 2,
  },
  data_ingested: {
    sub_loop: "observation",
    handler: "process_data",
    priority: 3,
  },
  optimization_signal: {
    sub_loop: "optimization",
    handler: "run_optimization",
    priority: 4,
  },
  maintenance_due: {
    sub_loop: "maintenance",
    handler: "run_maintenance",
    priority: 5,
  },
};

// ============================================================================
// CLASSIFY
// ============================================================================

/**
 * Classify an event into a sub-loop work item.
 * Uses the event's explicit type + optional handler override from payload.
 */
export function classifyEvent(event: PetlaEvent): ClassificationResult {
  const base = EVENT_TYPE_MAP[event.event_type];

  // Allow payload to override handler (for specific task delegation)
  const handler =
    typeof event.payload.handler === "string"
      ? event.payload.handler
      : base.handler;

  // Allow payload to override priority (within bounds 0-5)
  const priority =
    typeof event.payload.priority === "number" &&
    event.payload.priority >= 0 &&
    event.payload.priority <= 5
      ? event.payload.priority
      : base.priority;

  return {
    sub_loop: base.sub_loop,
    handler,
    priority,
  };
}

/**
 * Check if an event is urgent (P0-P1) and should be processed immediately.
 */
export function isUrgent(event: PetlaEvent): boolean {
  return event.priority <= 1;
}

/**
 * Check if an event should bypass budget gate (safety-critical).
 */
export function bypassesBudget(event: PetlaEvent): boolean {
  return event.event_type === "crisis";
}
