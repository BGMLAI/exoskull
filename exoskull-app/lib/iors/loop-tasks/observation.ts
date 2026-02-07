/**
 * Observation Sub-Loop Handler (P3)
 *
 * Monitors data, detects patterns and anomalies.
 * Delegates to MAPE-K Monitor + Analyze phases.
 * If issues detected → emits P2 proactive events for follow-up.
 */

import { emitEvent, completeWork, failWork } from "@/lib/iors/loop";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

export async function handleObservation(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    console.log("[Petla:Observation] Processing:", {
      tenantId: tenant_id,
      handler: item.handler,
      dataSource: params.source,
    });

    // Delegate to specific handlers based on the handler field
    switch (item.handler) {
      case "process_data": {
        // Generic data ingestion observation — lightweight check
        // The data is already in Bronze/Silver; just note that new data arrived
        break;
      }

      case "run_mape_k": {
        // Full MAPE-K cycle — heavy, only triggered by loop-15 when warranted
        try {
          const { MAPEKLoop } = await import("@/lib/autonomy/mape-k-loop");
          const loop = new MAPEKLoop();
          const result = await loop.runCycle(
            tenant_id,
            "event",
            JSON.stringify(params),
          );

          // If MAPE-K generated interventions, emit proactive events
          if (
            result &&
            typeof result === "object" &&
            "interventionsCreated" in result
          ) {
            const interventions = (result as { interventionsCreated: number })
              .interventionsCreated;
            if (interventions > 0) {
              await emitEvent({
                tenantId: tenant_id,
                eventType: "proactive_trigger",
                priority: 2,
                source: "mape-k",
                payload: {
                  message: `MAPE-K detected ${interventions} intervention(s) for review.`,
                  handler: "deliver_proactive",
                },
                dedupKey: `mape-k:${tenant_id}:${new Date().toISOString().slice(0, 13)}`,
              });
            }
          }
        } catch (mapeErr) {
          console.error("[Petla:Observation] MAPE-K failed:", {
            tenantId: tenant_id,
            error: mapeErr instanceof Error ? mapeErr.message : mapeErr,
          });
          // Non-fatal — observation continues even if MAPE-K fails
        }
        break;
      }

      default:
        console.log("[Petla:Observation] Unknown handler:", item.handler);
    }

    if (item.id && item.status === "processing") {
      await completeWork(item.id, { observed: true, handler: item.handler });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Observation] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
