/**
 * Shared Tenant Utilities for Autonomous CRONs
 * Used by: morning-briefing, evening-reflection, impulse, daily-summary
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
// appendMessage removed — dispatchReport already writes to unified thread
import {
  canSendProactive,
  logProactiveOutbound,
} from "@/lib/autonomy/outbound-triggers";
import { pushNotifyTenant } from "@/lib/push/fcm";
import { logger } from "@/lib/logger";

export interface ActiveTenant {
  id: string;
  phone: string | null;
  name: string | null;
  timezone: string;
  language: string | null;
  schedule_settings: any;
  iors_personality: any;
}

/**
 * Get all active tenants with phone numbers.
 */
export async function getActiveTenants(): Promise<ActiveTenant[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("exo_tenants")
    .select(
      "id, phone, name, timezone, language, schedule_settings, iors_personality",
    )
    .not("phone", "is", null);

  if (error) {
    logger.error("[TenantUtils] Failed to fetch tenants:", error);
    return [];
  }
  return data || [];
}

/**
 * Check if current time is within given hours in tenant's timezone.
 */
export function isWithinHours(
  timezone: string,
  startHour: number,
  endHour: number,
): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Europe/Warsaw",
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= startHour && hour < endHour;
  } catch {
    return false;
  }
}

/**
 * Get current hour in tenant's timezone.
 */
export function getCurrentHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Europe/Warsaw",
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getHours();
  }
}

/**
 * Check if it's quiet hours for a tenant (default 23:00-07:00).
 */
export function isQuietHours(timezone: string, personality?: any): boolean {
  const quietStart = personality?.communication_hours?.end
    ? parseInt(personality.communication_hours.end)
    : 23;
  const quietEnd = personality?.communication_hours?.start
    ? parseInt(personality.communication_hours.start)
    : 7;
  const hour = getCurrentHour(timezone);

  if (quietStart > quietEnd) {
    // Wraps midnight: e.g., 23:00-07:00
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

/**
 * Send a proactive message to a tenant with full logging.
 * Includes built-in rate limiting and per-trigger dedup (6h window).
 */
export async function sendProactiveMessage(
  tenantId: string,
  message: string,
  triggerType: string,
  source: string = "cron",
): Promise<{ success: boolean; channel?: string }> {
  try {
    // Gate 1: Daily rate limit (max 8 proactive messages per day)
    const allowed = await canSendProactive(tenantId);
    if (!allowed) {
      logger.info(`[${source}] Proactive blocked — daily limit reached`, {
        tenantId,
        triggerType,
      });
      return { success: false };
    }

    // Gate 2: Per-trigger dedup — same trigger_type sent within last 6 hours?
    const supabase = getServiceSupabase();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("exo_proactive_log")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("trigger_type", triggerType)
      .gte("created_at", sixHoursAgo);

    if ((recentCount || 0) > 0) {
      logger.debug(
        `[${source}] Proactive deduped — ${triggerType} sent within 6h`,
        { tenantId },
      );
      return { success: false };
    }

    // dispatchReport already appends to unified thread — don't double-write
    const result = await dispatchReport(tenantId, message, "insight");

    // Also push to mobile devices (fire-and-forget)
    pushNotifyTenant(tenantId, "ExoSkull", message.slice(0, 200), {
      type: triggerType,
      source,
    });

    await logProactiveOutbound(
      tenantId,
      triggerType,
      result.channel || "web_chat",
    );

    // Store message_sid for delivery tracking (if SMS was used)
    if (result.messageSid) {
      await supabase
        .from("exo_proactive_log")
        .update({ message_sid: result.messageSid })
        .eq("tenant_id", tenantId)
        .eq("trigger_type", triggerType)
        .is("message_sid", null)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    logger.info(`[${source}] Proactive message sent:`, {
      tenantId,
      triggerType,
      channel: result.channel,
      messageSid: result.messageSid,
    });

    return { success: result.success, channel: result.channel };
  } catch (error) {
    logger.error(`[${source}] Failed to send proactive message:`, {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return { success: false };
  }
}
