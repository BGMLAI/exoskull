/**
 * Outbound Caller
 *
 * Enables ExoSkull to call the user proactively via VAPI.
 * Triggers: morning briefing, alerts, emergency, reminders.
 *
 * Also manages bot identity (email, phone) for external communication.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

export interface OutboundCallRequest {
  tenantId: string;
  reason:
    | "morning_briefing"
    | "alert"
    | "emergency"
    | "reminder"
    | "follow_up"
    | "custom";
  message: string;
  priority: "low" | "normal" | "high" | "critical";
  phoneNumber?: string; // Override — defaults to tenant's phone
}

export interface OutboundCallResult {
  success: boolean;
  callId?: string;
  error?: string;
  duration?: number;
}

export interface BotIdentity {
  tenantId: string;
  botEmail?: string;
  botPhoneNumber?: string;
  displayName: string;
  organization?: string;
}

// ============================================================================
// VAPI OUTBOUND CALL
// ============================================================================

/**
 * Make an outbound call to the user via VAPI
 */
export async function callUser(
  req: OutboundCallRequest,
): Promise<OutboundCallResult> {
  const vapiApiKey = process.env.VAPI_API_KEY;
  const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!vapiApiKey) {
    return { success: false, error: "VAPI_API_KEY not configured" };
  }

  // Get user's phone number if not provided
  let phoneNumber = req.phoneNumber;
  if (!phoneNumber) {
    const supabase = getServiceSupabase();
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("phone_number")
      .eq("id", req.tenantId)
      .maybeSingle();

    phoneNumber = tenant?.phone_number;
  }

  if (!phoneNumber) {
    return { success: false, error: "No phone number configured for user" };
  }

  logger.info("[OutboundCaller:start]", {
    tenantId: req.tenantId.slice(0, 8),
    reason: req.reason,
    priority: req.priority,
  });

  try {
    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vapiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: vapiPhoneNumberId,
        customer: {
          number: phoneNumber,
        },
        assistantId: process.env.VAPI_ASSISTANT_ID,
        assistantOverrides: {
          firstMessage: req.message,
          model: {
            messages: [
              {
                role: "system",
                content: `You are calling the user proactively. Reason: ${req.reason}. Priority: ${req.priority}. Message: ${req.message}. Be brief and direct. Speak in Polish.`,
              },
            ],
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error("[OutboundCaller:failed]", {
        status: response.status,
        body: errText,
      });
      return { success: false, error: `VAPI call failed: ${response.status}` };
    }

    const data = await response.json();

    // Log the call
    const supabase = getServiceSupabase();
    await supabase.from("exo_outbound_calls").insert({
      tenant_id: req.tenantId,
      call_id: data.id,
      reason: req.reason,
      priority: req.priority,
      message: req.message,
      phone_number: phoneNumber,
      status: "initiated",
    });

    logger.info("[OutboundCaller:success]", {
      tenantId: req.tenantId.slice(0, 8),
      callId: data.id,
    });

    return { success: true, callId: data.id };
  } catch (err) {
    logger.error("[OutboundCaller:error]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================================
// BOT IDENTITY MANAGEMENT
// ============================================================================

/**
 * Get or create bot identity for a tenant
 */
export async function getBotIdentity(tenantId: string): Promise<BotIdentity> {
  const supabase = getServiceSupabase();

  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("iors_name, preferences, voice_config")
    .eq("id", tenantId)
    .maybeSingle();

  const preferences = (tenant?.preferences || {}) as Record<string, string>;

  return {
    tenantId,
    botEmail: preferences.bot_email || undefined,
    botPhoneNumber: process.env.EXOSKULL_PHONE_NUMBER || undefined,
    displayName: tenant?.iors_name || "ExoSkull Assistant",
    organization: preferences.organization || undefined,
  };
}

/**
 * Update bot identity for a tenant
 */
export async function updateBotIdentity(
  tenantId: string,
  updates: Partial<
    Pick<
      BotIdentity,
      "botEmail" | "botPhoneNumber" | "displayName" | "organization"
    >
  >,
): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { data: current } = await supabase
    .from("exo_tenants")
    .select("preferences")
    .eq("id", tenantId)
    .maybeSingle();

  const preferences = {
    ...((current?.preferences as Record<string, unknown>) || {}),
  };

  if (updates.botEmail !== undefined) preferences.bot_email = updates.botEmail;
  if (updates.botPhoneNumber !== undefined)
    preferences.bot_phone = updates.botPhoneNumber;
  if (updates.organization !== undefined)
    preferences.organization = updates.organization;

  const { error } = await supabase
    .from("exo_tenants")
    .update({
      preferences,
      ...(updates.displayName ? { iors_name: updates.displayName } : {}),
    })
    .eq("id", tenantId);

  return !error;
}

/**
 * Check if user is currently online (has active session)
 */
export async function isUserOnline(tenantId: string): Promise<boolean> {
  const supabase = getServiceSupabase();

  // Check for recent web activity (last 5 min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count } = await supabase
    .from("exo_unified_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", fiveMinAgo);

  return (count || 0) > 0;
}
