/**
 * Emergency Sub-Loop Handler (P0)
 *
 * Crisis escalation — calls emergency contacts, sends all-channel alerts.
 * Delegates to existing emergency-contact.ts for contact management.
 */

import { escalateToCrisisContact } from "@/lib/iors/emergency-contact";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
import { appendMessage } from "@/lib/unified-thread";
import { completeWork, failWork } from "@/lib/iors/loop";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

import { logger } from "@/lib/logger";
export async function handleEmergency(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    logger.info("[Petla:Emergency] Crisis detected:", {
      tenantId: tenant_id,
      source: params.source,
    });

    // 1. Escalate to emergency contact (sends SMS + optional call)
    const escalationResult = await escalateToCrisisContact(
      tenant_id,
      (params.reason as string) || "Crisis detected by IORS system",
      (params.severity as string) || "high",
    );

    // 2. Send alert to user on preferred channel
    const alertMessage =
      params.language === "en"
        ? "I noticed something concerning. Please know that help is available. Your emergency contact has been notified."
        : "Zauważyłem coś niepokojącego. Pamiętaj, że pomoc jest dostępna. Twój kontakt alarmowy został powiadomiony.";

    await dispatchReport(tenant_id, alertMessage, "insight");

    // 3. Log to unified thread
    await appendMessage(tenant_id, {
      role: "system",
      content: `[CRISIS ESCALATION] Emergency contact notified. Reason: ${params.reason || "crisis detected"}`,
      channel: "web_chat",
      direction: "outbound",
      source_type: "web_chat",
      metadata: {
        petla_event: true,
        sub_loop: "emergency",
        escalation_result: escalationResult,
      },
    });

    if (item.id && item.status === "processing") {
      await completeWork(item.id, {
        escalated: true,
        contactNotified: !!escalationResult,
      });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    logger.error("[Petla:Emergency] Failed:", {
      tenantId: tenant_id,
      error: err.message,
      stack: err.stack,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
