/**
 * Proactive Worker — Check if tenant needs a proactive message.
 * Reuses impulse-style logic: overdue tasks, undelivered insights, pending interventions.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { quickStateCheck } from "@/lib/iors/loop";
import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function runProactiveCheck(ctx: WorkContext): Promise<WorkResult> {
  const tenantId = ctx.tenantId!;
  const db = getServiceSupabase();

  try {
    const state = await quickStateCheck(tenantId);
    let actionsDelivered = 0;

    // A: Overdue task reminder
    if (state.overdueTasks > 0) {
      const { data: overdue } = await db
        .from("user_ops")
        .select("id, title")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .lt("due_date", new Date().toISOString())
        .limit(3);

      if (overdue && overdue.length > 0) {
        const taskNames = overdue.map((t) => t.title).join(", ");
        await sendProactiveMessage(
          tenantId,
          `Masz ${overdue.length} zaległy${overdue.length > 1 ? "ch" : ""} task${overdue.length > 1 ? "ów" : ""}: ${taskNames}. Chcesz je przesunąć czy zamknąć?`,
          "overdue_reminder",
          "web_chat" as never,
        );
        actionsDelivered++;
      }
    }

    // B: Undelivered insights
    if (state.undeliveredInsights > 0 && actionsDelivered < 2) {
      const { data: insights } = await db
        .from("exo_insight_deliveries")
        .select("id, source_table, source_id")
        .eq("tenant_id", tenantId)
        .is("delivered_at", null)
        .limit(1);

      if (insights && insights.length > 0) {
        await db
          .from("exo_insight_deliveries")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", insights[0].id);
        actionsDelivered++;
      }
    }

    return {
      success: true,
      costCents: 0,
      result: {
        actionsDelivered,
        overdue: state.overdueTasks,
        insights: state.undeliveredInsights,
      },
    };
  } catch (err) {
    logger.error("[ProactiveWorker] Failed:", { tenantId, error: err });
    return {
      success: false,
      costCents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
