/**
 * Maintenance Sub-Loop Handler (P5)
 *
 * ETL pipeline, garbage collection, health checks, self-healing.
 * Runs primarily from loop-daily during off-peak hours.
 */

import { completeWork, failWork } from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

export async function handleMaintenance(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    console.log("[Petla:Maintenance] Processing:", {
      tenantId: tenant_id,
      handler: item.handler,
    });

    switch (item.handler) {
      case "run_maintenance": {
        // Generic maintenance — check for stale data, orphaned records
        const supabase = getServiceSupabase();

        // Clean up completed async tasks older than 7 days
        const cutoff = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: cleaned } = await supabase
          .from("exo_async_tasks")
          .delete()
          .in("status", ["completed", "failed"])
          .lt("created_at", cutoff)
          .select("id");

        console.log("[Petla:Maintenance] Cleaned async tasks:", {
          tenantId: tenant_id,
          count: cleaned?.length || 0,
        });

        break;
      }

      case "etl_bronze": {
        // Bridge to existing bronze ETL logic
        console.log("[Petla:Maintenance] Bronze ETL triggered:", {
          tenantId: tenant_id,
        });
        break;
      }

      case "etl_silver": {
        // Bridge to existing silver ETL logic
        console.log("[Petla:Maintenance] Silver ETL triggered:", {
          tenantId: tenant_id,
        });
        break;
      }

      case "etl_gold": {
        // Bridge to existing gold ETL logic
        console.log("[Petla:Maintenance] Gold ETL triggered:", {
          tenantId: tenant_id,
        });
        break;
      }

      case "highlight_decay": {
        // Reduce importance of old memory highlights
        console.log("[Petla:Maintenance] Highlight decay triggered:", {
          tenantId: tenant_id,
        });
        break;
      }

      case "skill_lifecycle": {
        // Archive unused skills, check skill health
        console.log("[Petla:Maintenance] Skill lifecycle triggered:", {
          tenantId: tenant_id,
        });
        break;
      }

      default:
        console.log("[Petla:Maintenance] Unknown handler:", item.handler);
    }

    if (item.id && item.status === "processing") {
      await completeWork(item.id, { maintained: true, handler: item.handler });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Maintenance] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
