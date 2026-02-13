/**
 * Bot Identity Manager
 *
 * Manages ExoSkull bot's communication identity for outbound actions.
 * Controls how the bot introduces itself when calling/emailing on behalf of the user.
 *
 * Two modes:
 * 1. "behalf" - "Dzwonię w imieniu [User Name], jestem [Bot Name], asystent AI."
 * 2. "assistant" - "Jestem [Bot Name], asystent [User Name]."
 * 3. "custom" - User-defined introduction text
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface BotIdentity {
  displayName: string;
  outboundPhone: string | null;
  outboundEmail: string;
  introductionStyle: "behalf" | "assistant" | "custom";
  customIntroduction: string | null;
}

export interface OutboundCallConfig {
  enabled: boolean;
  maxPerDay: number;
  allowThirdParty: boolean;
  allowCheckinCalls: boolean;
  allowAlertCalls: boolean;
}

export interface IdentityContext {
  botIdentity: BotIdentity;
  outboundCalls: OutboundCallConfig;
  userName: string;
  userPhone: string | null;
  userEmail: string | null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load the bot's identity configuration for a tenant
 */
export async function getBotIdentity(
  tenantId: string,
): Promise<IdentityContext> {
  const supabase = getServiceSupabase();

  const { data: tenant, error } = await supabase
    .from("exo_tenants")
    .select("voice_config, iors_name, name, phone, email")
    .eq("id", tenantId)
    .single();

  if (error) {
    logger.warn("[IdentityManager] Failed to load tenant:", {
      tenantId,
      error: error.message,
    });
  }

  const voiceConfig = (tenant?.voice_config as Record<string, unknown>) || {};
  const botId = (voiceConfig.bot_identity as Record<string, unknown>) || {};
  const outbound =
    (voiceConfig.outbound_calls as Record<string, unknown>) || {};

  return {
    botIdentity: {
      displayName:
        (botId.display_name as string) ||
        (tenant?.iors_name as string) ||
        "IORS",
      outboundPhone: (botId.outbound_phone as string) || null,
      outboundEmail: (botId.outbound_email as string) || "iors@exoskull.xyz",
      introductionStyle:
        (botId.introduction_style as BotIdentity["introductionStyle"]) ||
        "behalf",
      customIntroduction: (botId.custom_introduction as string) || null,
    },
    outboundCalls: {
      enabled: (outbound.enabled as boolean) ?? true,
      maxPerDay: (outbound.max_per_day as number) ?? 5,
      allowThirdParty: (outbound.allow_third_party as boolean) ?? true,
      allowCheckinCalls: (outbound.allow_checkin_calls as boolean) ?? true,
      allowAlertCalls: (outbound.allow_alert_calls as boolean) ?? true,
    },
    userName: (tenant?.name as string) || "użytkownik",
    userPhone: (tenant?.phone as string) || null,
    userEmail: (tenant?.email as string) || null,
  };
}

/**
 * Generate the introduction text for outbound calls
 */
export function generateIntroduction(
  identity: BotIdentity,
  userName: string,
  purpose?: string,
): string {
  switch (identity.introductionStyle) {
    case "behalf":
      return `Dzień dobry, dzwonię w imieniu ${userName}. Jestem ${identity.displayName}, asystent AI.${purpose ? ` Dzwonię w sprawie: ${purpose}.` : ""}`;

    case "assistant":
      return `Dzień dobry, jestem ${identity.displayName}, asystent ${userName}.${purpose ? ` ${purpose}.` : ""}`;

    case "custom":
      if (identity.customIntroduction) {
        return identity.customIntroduction
          .replace(/\{user_name\}/g, userName)
          .replace(/\{bot_name\}/g, identity.displayName)
          .replace(/\{purpose\}/g, purpose || "");
      }
      // Fallback to "behalf" if no custom text
      return `Dzień dobry, dzwonię w imieniu ${userName}. Jestem ${identity.displayName}.${purpose ? ` ${purpose}.` : ""}`;

    default:
      return `Dzień dobry, jestem ${identity.displayName}.${purpose ? ` ${purpose}.` : ""}`;
  }
}

/**
 * Check if outbound action is allowed based on config and daily limits
 */
export async function canMakeOutboundCall(
  tenantId: string,
  callType: "checkin" | "alert" | "third_party",
): Promise<{ allowed: boolean; reason?: string }> {
  const identity = await getBotIdentity(tenantId);
  const { outboundCalls } = identity;

  if (!outboundCalls.enabled) {
    return { allowed: false, reason: "Outbound calls are disabled" };
  }

  // Check call type permission
  if (callType === "checkin" && !outboundCalls.allowCheckinCalls) {
    return { allowed: false, reason: "Check-in calls are disabled" };
  }
  if (callType === "alert" && !outboundCalls.allowAlertCalls) {
    return { allowed: false, reason: "Alert calls are disabled" };
  }
  if (callType === "third_party" && !outboundCalls.allowThirdParty) {
    return { allowed: false, reason: "Third-party calls are disabled" };
  }

  // Check daily limit
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { count, error } = await supabase
    .from("exo_voice_sessions")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("started_at", `${today}T00:00:00Z`)
    .lte("started_at", `${today}T23:59:59Z`);

  if (error) {
    logger.warn("[IdentityManager] Failed to count daily calls:", {
      tenantId,
      error: error.message,
    });
    // Allow on error (fail open for calls)
    return { allowed: true };
  }

  if ((count ?? 0) >= outboundCalls.maxPerDay) {
    return {
      allowed: false,
      reason: `Daily call limit reached (${outboundCalls.maxPerDay}/day)`,
    };
  }

  return { allowed: true };
}

/**
 * Get the "from" identity for email communication
 */
export function getEmailFromAddress(identity: BotIdentity): string {
  return `${identity.displayName} <${identity.outboundEmail}>`;
}

/**
 * Get the phone number to use for outbound calls
 * Falls back to system Twilio number
 */
export function getOutboundPhone(identity: BotIdentity): string {
  return identity.outboundPhone || process.env.TWILIO_PHONE_NUMBER || "";
}
