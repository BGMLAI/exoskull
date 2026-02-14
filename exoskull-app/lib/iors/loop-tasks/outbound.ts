/**
 * Outbound Sub-Loop Handler (P1)
 *
 * Executes approved autonomous actions — calls, messages, scheduling.
 * Gates every action through the autonomy permission system.
 */

import { checkPermission } from "@/lib/iors/autonomy";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
import { completeWork, failWork } from "@/lib/iors/loop";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";
import type { AutonomyActionType, AutonomyDomain } from "@/lib/iors/types";

import { logger } from "@/lib/logger";
export async function handleOutbound(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    const actionType = (params.action_type as AutonomyActionType) || "message";
    const domain = (params.domain as AutonomyDomain) || "*";

    logger.info("[Petla:Outbound] Processing:", {
      tenantId: tenant_id,
      actionType,
      domain,
      handler: item.handler,
    });

    // 1. Check autonomy permission
    const perm = await checkPermission(tenant_id, actionType, domain);

    if (!perm.permitted) {
      logger.info("[Petla:Outbound] No permission, skipping:", {
        tenantId: tenant_id,
        actionType,
        domain,
      });

      if (item.id && item.status === "processing") {
        await completeWork(item.id, {
          skipped: true,
          reason: "no_permission",
        });
      }

      return { handled: true, cost_cents: 0 };
    }

    if (perm.requires_confirmation) {
      // Propose to user instead of executing
      const proposalMessage =
        (params.message as string) ||
        `IORS chce wykonać akcję: ${actionType} w domenie ${domain}. Czy wyrażasz zgodę?`;

      await dispatchReport(tenant_id, proposalMessage, "insight");

      if (item.id && item.status === "processing") {
        await completeWork(item.id, {
          proposed: true,
          actionType,
          domain,
        });
      }

      return { handled: true, cost_cents: 0 };
    }

    // 2. Execute the action
    // NOTE: dispatchReport() already calls appendMessage() internally,
    // so we do NOT call appendMessage() here to avoid duplicate messages.
    const message = (params.message as string) || "";
    if (message) {
      await dispatchReport(tenant_id, message, "insight");
    }

    if (item.id && item.status === "processing") {
      await completeWork(item.id, {
        executed: true,
        actionType,
        domain,
      });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Outbound] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
