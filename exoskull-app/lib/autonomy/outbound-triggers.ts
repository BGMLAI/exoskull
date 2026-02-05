/**
 * Outbound Triggers — Layer 16 Autonomous Outbound
 *
 * Detects conditions that should trigger proactive outbound:
 * 1. Crisis follow-up (after crisis detected in conversation)
 * 2. Inactivity detection (no messages for N hours)
 * 3. Negative emotion trend (3+ negative emotions in 24h)
 *
 * All triggers create escalation chains via escalation-manager.
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import type { CrisisType, CrisisSeverity } from "@/lib/emotion/types";
import { createEscalationChain } from "./escalation-manager";

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if tenant has exceeded daily proactive limit.
 * Crisis follow-ups are exempt from limits.
 */
export async function canSendProactive(
  tenantId: string,
  isCrisis: boolean = false,
): Promise<boolean> {
  if (isCrisis) return true;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase.rpc("get_daily_proactive_count", {
      p_tenant_id: tenantId,
    });

    const count = (data as number) || 0;
    return count < 2; // Max 2 proactive per day (non-crisis)
  } catch (error) {
    console.error("[OutboundTriggers] Rate limit check failed:", error);
    return false; // Fail closed — don't send if unsure
  }
}

/**
 * Log a proactive outbound event for rate limiting.
 */
export async function logProactiveOutbound(
  tenantId: string,
  triggerType: string,
  channel: string,
  interventionId?: string,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("exo_proactive_log").insert({
      tenant_id: tenantId,
      intervention_id: interventionId,
      trigger_type: triggerType,
      channel,
    });
  } catch (error) {
    console.error(
      "[OutboundTriggers] Failed to log proactive outbound:",
      error,
    );
  }
}

// ============================================================================
// TRIGGER 1: CRISIS FOLLOW-UP
// ============================================================================

const CRISIS_MESSAGES: Record<string, string> = {
  suicide:
    "Hej, sprawdzam jak się czujesz po naszej rozmowie. Jestem tu jeśli chcesz pogadać. Odpowiedz albo oddzwoń. Telefon Zaufania: 116 123.",
  panic:
    "Cześć, chciałem sprawdzić jak się czujesz po wczorajszym ataku paniki. Mam nadzieję że jest lepiej. Napisz jak możesz.",
  trauma:
    "Hej, myślę o Tobie po naszej ostatniej rozmowie. Jak się trzymasz? Jestem tu. Odpowiedz kiedy będziesz gotowy/a.",
  substance:
    "Cześć, sprawdzam jak się czujesz. Pamiętaj — Monar: 801 199 990. Napisz albo oddzwoń jak chcesz pogadać.",
};

/**
 * Schedule proactive follow-up after crisis detected in conversation.
 * Creates SMS → Call → Emergency escalation chain.
 *
 * Called from conversation-handler.ts when crisis.detected === true.
 * Fire-and-forget (never throws).
 */
export async function scheduleCrisisFollowUp(
  tenantId: string,
  crisisType: CrisisType,
  severity: CrisisSeverity,
): Promise<void> {
  try {
    const message = CRISIS_MESSAGES[crisisType] || CRISIS_MESSAGES["suicide"];

    // Check if we already have a recent crisis follow-up for this tenant
    const supabase = createServiceClient();
    const { data: recent } = await supabase
      .from("exo_proactive_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("trigger_type", "crisis_followup")
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(1);

    if (recent && recent.length > 0) {
      console.log(
        "[OutboundTriggers] Skipping crisis follow-up — already scheduled in last 24h",
      );
      return;
    }

    const interventionIds = await createEscalationChain(tenantId, {
      reason: "crisis_followup",
      initialMessage: message,
      severity,
      smsDelayHours: 4, // SMS 4 hours after crisis conversation
      callDelayHours: 24, // Call 24h later if no response
      emergencyDelayHours:
        severity === "high" || severity === "critical" ? 48 : undefined,
    });

    await logProactiveOutbound(
      tenantId,
      "crisis_followup",
      "sms",
      interventionIds[0],
    );

    console.log(
      `[OutboundTriggers] Crisis follow-up scheduled: ${crisisType} (${severity}), ${interventionIds.length} interventions`,
    );
  } catch (error) {
    console.error(
      "[OutboundTriggers] Failed to schedule crisis follow-up:",
      error,
    );
  }
}

// ============================================================================
// TRIGGER 2: INACTIVITY DETECTION
// ============================================================================

/**
 * Detect if user has been inactive for longer than threshold.
 * Checks exo_unified_thread for last user message.
 */
export async function detectInactivity(
  tenantId: string,
  thresholdHours: number = 48,
): Promise<{ inactive: boolean; lastActivityAt: string | null }> {
  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("exo_unified_thread")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!data || data.length === 0) {
      return { inactive: true, lastActivityAt: null };
    }

    const lastActivity = new Date(data[0].created_at);
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const inactive = lastActivity < threshold;

    return {
      inactive,
      lastActivityAt: data[0].created_at,
    };
  } catch (error) {
    console.error("[OutboundTriggers] Inactivity check failed:", error);
    return { inactive: false, lastActivityAt: null };
  }
}

/**
 * Handle inactivity trigger — create SMS escalation.
 */
export async function handleInactivityTrigger(
  tenantId: string,
): Promise<boolean> {
  if (!(await canSendProactive(tenantId))) {
    return false;
  }

  // Check we haven't already sent an inactivity message recently
  const supabase = createServiceClient();
  const { data: recent } = await supabase
    .from("exo_proactive_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("trigger_type", "inactivity")
    .gte(
      "created_at",
      new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 72h dedup
    )
    .limit(1);

  if (recent && recent.length > 0) return false;

  const interventionIds = await createEscalationChain(tenantId, {
    reason: "inactivity",
    initialMessage:
      "Dawno się nie słyszało! Wszystko ok? Odpisz albo oddzwoń kiedy możesz.",
    severity: "low",
    smsDelayHours: 0,
    callDelayHours: 6,
  });

  if (interventionIds.length > 0) {
    await logProactiveOutbound(
      tenantId,
      "inactivity",
      "sms",
      interventionIds[0],
    );
    return true;
  }

  return false;
}

// ============================================================================
// TRIGGER 3: NEGATIVE EMOTION TREND
// ============================================================================

/**
 * Detect concerning negative emotion trend in recent history.
 */
export async function detectEmotionTrend(
  tenantId: string,
  windowHours: number = 24,
): Promise<{
  concerning: boolean;
  negativeCount: number;
  avgValence: number;
}> {
  try {
    const supabase = createServiceClient();
    const since = new Date(
      Date.now() - windowHours * 60 * 60 * 1000,
    ).toISOString();

    const { data } = await supabase
      .from("exo_emotion_log")
      .select("valence, primary_emotion, intensity")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    if (!data || data.length === 0) {
      return { concerning: false, negativeCount: 0, avgValence: 0 };
    }

    const negativeEntries = data.filter(
      (e) => e.valence !== null && parseFloat(String(e.valence)) < -0.4,
    );
    const totalValence = data.reduce(
      (sum, e) => sum + (e.valence ? parseFloat(String(e.valence)) : 0),
      0,
    );
    const avgValence = totalValence / data.length;

    return {
      concerning: negativeEntries.length >= 3,
      negativeCount: negativeEntries.length,
      avgValence: Math.round(avgValence * 100) / 100,
    };
  } catch (error) {
    console.error("[OutboundTriggers] Emotion trend check failed:", error);
    return { concerning: false, negativeCount: 0, avgValence: 0 };
  }
}

/**
 * Handle negative emotion trend — create wellness check-in.
 */
export async function handleEmotionTrendTrigger(
  tenantId: string,
): Promise<boolean> {
  if (!(await canSendProactive(tenantId))) {
    return false;
  }

  // Dedup: no emotion trend messages within 48h
  const supabase = createServiceClient();
  const { data: recent } = await supabase
    .from("exo_proactive_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("trigger_type", "emotion_trend")
    .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recent && recent.length > 0) return false;

  const interventionIds = await createEscalationChain(tenantId, {
    reason: "emotion_trend",
    initialMessage:
      "Hej, zauważyłem że ostatnio było ciężko. Jak się trzymasz? Chcesz pogadać?",
    severity: "medium",
    smsDelayHours: 0,
    callDelayHours: 4,
  });

  if (interventionIds.length > 0) {
    await logProactiveOutbound(
      tenantId,
      "emotion_trend",
      "sms",
      interventionIds[0],
    );
    return true;
  }

  return false;
}
