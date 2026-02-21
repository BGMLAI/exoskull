/**
 * Pętla CRON — 1-Minute Heartbeat
 *
 * Ultra-fast event triage. Zero AI calls. Pure DB + heuristic logic.
 *
 * Each invocation:
 * 1. Claims ONE P0/P1 urgent event → dispatches immediately
 * 2. If no urgent: batch-enqueues P2-P5 events to work queue
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  claimUrgentEvent,
  batchEnqueueEvents,
  markEventDispatched,
} from "@/lib/iors/loop";
import { isUrgent } from "@/lib/iors/loop-classifier";
import { logActivity } from "@/lib/activity-log";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const workerId = `petla-${Date.now()}`;

  try {
    // Step 1: Try to claim an urgent event (P0-P1)
    const urgentEvent = await claimUrgentEvent(workerId);

    if (urgentEvent) {
      // Dispatch immediately based on type
      if (urgentEvent.priority === 0) {
        // P0: Emergency — handle via emergency sub-loop
        const { handleEmergency } =
          await import("@/lib/iors/loop-tasks/emergency");
        await handleEmergency({
          id: urgentEvent.id,
          tenant_id: urgentEvent.tenant_id,
          sub_loop: "emergency",
          priority: 0,
          handler: "escalate_crisis",
          params: urgentEvent.payload,
          scheduled_for: new Date().toISOString(),
          recurrence: null,
          last_run_at: null,
          status: "processing",
          result: null,
          error: null,
          retry_count: 0,
          max_retries: 1,
          locked_until: null,
          locked_by: workerId,
          source_event_id: urgentEvent.id,
          created_at: urgentEvent.created_at,
          completed_at: null,
        });
      } else {
        // P1: Outbound — handle via outbound sub-loop
        const { handleOutbound } =
          await import("@/lib/iors/loop-tasks/outbound");
        await handleOutbound({
          id: urgentEvent.id,
          tenant_id: urgentEvent.tenant_id,
          sub_loop: "outbound",
          priority: 1,
          handler: "execute_outbound",
          params: urgentEvent.payload,
          scheduled_for: new Date().toISOString(),
          recurrence: null,
          last_run_at: null,
          status: "processing",
          result: null,
          error: null,
          retry_count: 0,
          max_retries: 2,
          locked_until: null,
          locked_by: workerId,
          source_event_id: urgentEvent.id,
          created_at: urgentEvent.created_at,
          completed_at: null,
        });
      }

      await markEventDispatched(urgentEvent.id);

      logActivity({
        tenantId: urgentEvent.tenant_id,
        actionType: "loop_eval",
        actionName: `petla_${urgentEvent.event_type}`,
        description: `Petla: zdarzenie P${urgentEvent.priority} (${urgentEvent.event_type})`,
        source: "petla",
        metadata: {
          eventId: urgentEvent.id,
          priority: urgentEvent.priority,
          eventType: urgentEvent.event_type,
        },
      });

      return NextResponse.json({
        ok: true,
        processed: 1,
        priority: urgentEvent.priority,
        eventType: urgentEvent.event_type,
        durationMs: Date.now() - startTime,
      });
    }

    // Step 2: No urgent events — batch-enqueue lower priority
    const batched = await batchEnqueueEvents(workerId, 20);

    return NextResponse.json({
      ok: true,
      processed: 0,
      batched,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error("[Petla] Error:", error);
    return NextResponse.json(
      { error: "Petla processing failed" },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "petla" }, handler);
