/**
 * Outbound Sub-Loop Handler (P1)
 *
 * Executes approved autonomous actions — calls, messages, scheduling.
 * Gates every action through the autonomy permission system.
 */

import { checkPermission } from "@/lib/iors/autonomy";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
import { completeWork, failWork } from "@/lib/iors/loop";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";
import type { AutonomyActionType, AutonomyDomain } from "@/lib/iors/types";

import { logger } from "@/lib/logger";

/**
 * Check if a similar proposal was already sent to this tenant recently.
 * Prevents spamming the user with repeated permission requests.
 */
async function wasProposalSentRecently(
  tenantId: string,
  actionType: string,
  domain: string,
  cooldownHours = 24,
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const cutoff = new Date(
    Date.now() - cooldownHours * 60 * 60 * 1000,
  ).toISOString();

  const { count } = await supabase
    .from("exo_petla_queue")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("sub_loop", "outbound")
    .eq("status", "completed")
    .gte("completed_at", cutoff)
    .contains("result", { proposed: true, actionType, domain });

  return (count || 0) > 0;
}

export async function handleOutbound(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    // Support both action_type and actionType keys (executor.ts used actionType)
    const actionType =
      (params.action_type as AutonomyActionType) ||
      (params.actionType as AutonomyActionType) ||
      "message";
    const domain = (params.domain as AutonomyDomain) || "*";

    logger.info("[Petla:Outbound] Processing:", {
      tenantId: tenant_id,
      actionType,
      domain,
      handler: item.handler,
    });

    // 1. Check autonomy permission
    const perm = await checkPermission(tenant_id, actionType, domain);

    if (!perm.permitted && !perm.requires_confirmation) {
      // No permission and no confirmation path — skip silently
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
      // Dedup check: don't spam if we already proposed this recently
      const alreadyProposed = await wasProposalSentRecently(
        tenant_id,
        actionType,
        domain,
      );

      if (alreadyProposed) {
        logger.info(
          "[Petla:Outbound] Proposal already sent recently, skipping:",
          {
            tenantId: tenant_id,
            actionType,
            domain,
          },
        );

        if (item.id && item.status === "processing") {
          await completeWork(item.id, {
            skipped: true,
            reason: "proposal_cooldown",
            actionType,
            domain,
          });
        }

        return { handled: true, cost_cents: 0 };
      }

      // Send proposal to user
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

    // 2. Execute the action — permitted, no confirmation needed
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
    logger.error("[Petla:Outbound] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
