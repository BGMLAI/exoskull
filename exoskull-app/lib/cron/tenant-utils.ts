/**
 * Shared Tenant Utilities for Autonomous CRONs
 * Used by: morning-briefing, evening-reflection, impulse, daily-summary
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { dispatchReport } from "@/lib/reports/report-dispatcher";
// appendMessage removed — dispatchReport already writes to unified thread
import { logProactiveOutbound } from "@/lib/autonomy/outbound-triggers";
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
    console.error("[TenantUtils] Failed to fetch tenants:", error);
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
 */
export async function sendProactiveMessage(
  tenantId: string,
  message: string,
  triggerType: string,
  source: string = "cron",
): Promise<{ success: boolean; channel?: string }> {
  try {
    // dispatchReport already appends to unified thread — don't double-write
    const result = await dispatchReport(tenantId, message, "insight");

    await logProactiveOutbound(
      tenantId,
      triggerType,
      result.channel || "web_chat",
    );

    logger.info(`[${source}] Proactive message sent:`, {
      tenantId,
      triggerType,
      channel: result.channel,
    });

    return { success: result.success, channel: result.channel };
  } catch (error) {
    console.error(`[${source}] Failed to send proactive message:`, {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return { success: false };
  }
}
