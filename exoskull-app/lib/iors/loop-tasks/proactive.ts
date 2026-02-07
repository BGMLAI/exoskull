/**
 * Proactive Sub-Loop Handler (P2)
 *
 * Delivers insights, reminders, suggestions to users.
 * Respects quiet hours from personality settings.
 * Uses Gemini Flash (Tier 1) for message formatting.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
import { appendMessage } from "@/lib/unified-thread";
import { completeWork, failWork } from "@/lib/iors/loop";
import { checkPermission } from "@/lib/iors/autonomy";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";
import type { IORSPersonality } from "@/lib/iors/types";
import { DEFAULT_PERSONALITY } from "@/lib/iors/types";

/**
 * Check if current time is within user's communication hours.
 */
function isWithinCommunicationHours(
  personality: IORSPersonality,
  timezone: string,
): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value || "12",
      10,
    );
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value || "0",
      10,
    );
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = personality.communication_hours.start
      .split(":")
      .map(Number);
    const [endH, endM] = personality.communication_hours.end
      .split(":")
      .map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // Default to allowing communication on error
  }
}

export async function handleProactive(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  const { tenant_id, params } = item;

  try {
    const supabase = getServiceSupabase();

    // 1. Load tenant personality + timezone
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("iors_personality, timezone, language")
      .eq("id", tenant_id)
      .single();

    const personality: IORSPersonality =
      tenant?.iors_personality || DEFAULT_PERSONALITY;
    const timezone = tenant?.timezone || "Europe/Warsaw";

    // 2. Check autonomy permission for proactive messaging
    const perm = await checkPermission(tenant_id, "message", "*");
    if (!perm.permitted) {
      console.log("[Petla:Proactive] No 'message' permission, skipping:", {
        tenantId: tenant_id,
      });
      if (item.id && item.status === "processing") {
        await completeWork(item.id, {
          skipped: true,
          reason: "no_message_permission",
        });
      }
      return { handled: true, cost_cents: 0 };
    }

    // 3. Check quiet hours
    if (!isWithinCommunicationHours(personality, timezone)) {
      console.log("[Petla:Proactive] Outside communication hours, deferring:", {
        tenantId: tenant_id,
        hours: personality.communication_hours,
      });

      // Re-queue for later (push scheduled_for forward by 1 hour)
      if (item.id && item.status === "processing") {
        await supabase
          .from("exo_petla_queue")
          .update({
            status: "queued",
            scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            locked_until: null,
            locked_by: null,
          })
          .eq("id", item.id);
      }

      return { handled: true, cost_cents: 0, details: { deferred: true } };
    }

    // 4. Get the message to send
    const message = (params.message as string) || (params.text as string);

    if (!message) {
      console.log("[Petla:Proactive] No message content, skipping:", {
        tenantId: tenant_id,
      });
      if (item.id && item.status === "processing") {
        await completeWork(item.id, { skipped: true, reason: "no_message" });
      }
      return { handled: true, cost_cents: 0 };
    }

    // 5. Dispatch via preferred channel
    const result = await dispatchReport(tenant_id, message, "insight");

    // 6. Log to unified thread
    await appendMessage(tenant_id, {
      role: "assistant",
      content: message,
      channel: "web_chat",
      direction: "outbound",
      source_type: "web_chat",
      metadata: {
        petla_event: true,
        sub_loop: "proactive",
        delivered_via: result.channel,
        handler: item.handler,
      },
    });

    if (item.id && item.status === "processing") {
      await completeWork(item.id, {
        delivered: result.success,
        channel: result.channel,
      });
    }

    return { handled: true, cost_cents: 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[Petla:Proactive] Failed:", {
      tenantId: tenant_id,
      error: err.message,
    });

    if (item.id && item.status === "processing") {
      await failWork(item.id, err.message);
    }

    return { handled: false, error: err.message };
  }
}
