/**
 * Escalation Manager — Layer 16 Autonomous Outbound
 *
 * Multi-channel escalation pipeline: SMS → Call → Emergency Contact.
 * Creates intervention chains that are processed by the existing
 * intervention-executor CRON (every 15 min).
 *
 * Each escalation step only fires if the user hasn't responded
 * since the previous step.
 */

import { createServiceClient } from "@/lib/supabase/service-client";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

interface EscalationStep {
  level: number;
  channel: "sms" | "voice" | "emergency";
  interventionId: string;
  scheduledFor: string;
  status: "pending" | "sent" | "cancelled";
}

interface EscalationChainPayload {
  escalation_chain_id: string;
  escalation_level: number;
  escalation_reason: string;
  escalation_steps: EscalationStep[];
  only_if_no_response: boolean;
  crisis_type?: string;
}

// ============================================================================
// CREATE ESCALATION CHAIN
// ============================================================================

/**
 * Create a multi-step escalation chain (SMS → Call → Emergency).
 * Returns intervention IDs for the chain.
 *
 * Steps:
 * 1. SMS (immediate or delayed)
 * 2. Call (N hours after SMS, only if no response)
 * 3. Emergency contact (N hours after call, only for crisis + high/critical)
 */
export async function createEscalationChain(
  tenantId: string,
  opts: {
    reason: string;
    initialMessage: string;
    severity: "low" | "medium" | "high" | "critical";
    smsDelayHours?: number;
    callDelayHours?: number;
    emergencyDelayHours?: number;
  },
): Promise<string[]> {
  const supabase = createServiceClient();
  const chainId = crypto.randomUUID();
  const interventionIds: string[] = [];
  const steps: EscalationStep[] = [];

  const now = Date.now();
  const smsDelay = (opts.smsDelayHours ?? 0) * 60 * 60 * 1000;
  const callDelay = (opts.callDelayHours ?? 4) * 60 * 60 * 1000;

  // Get tenant phone
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("phone, display_name")
    .eq("id", tenantId)
    .single();

  if (!tenant?.phone) {
    console.error("[EscalationManager] No phone for tenant:", tenantId);
    return [];
  }

  // ---- Step 1: SMS ----
  const smsScheduledFor = new Date(now + smsDelay).toISOString();

  const { data: smsIntervention, error: smsError } = await supabase.rpc(
    "propose_intervention",
    {
      p_tenant_id: tenantId,
      p_type: "proactive_message",
      p_title: `Proactive: ${opts.reason}`,
      p_description: opts.initialMessage,
      p_action_payload: {
        action: "send_sms",
        phone: tenant.phone,
        message: opts.initialMessage,
        escalation_chain_id: chainId,
        escalation_level: 1,
        escalation_reason: opts.reason,
        only_if_no_response: false,
      },
      p_priority: opts.severity === "critical" ? "critical" : "high",
      p_source_agent: "outbound-engine",
      p_requires_approval: false, // Proactive messages don't need approval
      p_scheduled_for: smsScheduledFor,
    },
  );

  if (smsError) {
    console.error(
      "[EscalationManager] Failed to create SMS intervention:",
      smsError,
    );
    return [];
  }

  const smsId = smsIntervention as string;
  interventionIds.push(smsId);
  steps.push({
    level: 1,
    channel: "sms",
    interventionId: smsId,
    scheduledFor: smsScheduledFor,
    status: "pending",
  });

  // ---- Step 2: Voice Call ----
  const callScheduledFor = new Date(now + smsDelay + callDelay).toISOString();

  const { data: callIntervention, error: callError } = await supabase.rpc(
    "propose_intervention",
    {
      p_tenant_id: tenantId,
      p_type: "proactive_message",
      p_title: `Follow-up call: ${opts.reason}`,
      p_description: `Escalation level 2 — voice call (no SMS response)`,
      p_action_payload: {
        action: "make_call",
        phone: tenant.phone,
        purpose: `Proactive follow-up: ${opts.reason}`,
        escalation_chain_id: chainId,
        escalation_level: 2,
        escalation_reason: opts.reason,
        only_if_no_response: true,
        response_check_since: smsScheduledFor,
      },
      p_priority: opts.severity === "critical" ? "critical" : "high",
      p_source_agent: "outbound-engine",
      p_requires_approval: false,
      p_scheduled_for: callScheduledFor,
    },
  );

  if (!callError && callIntervention) {
    const callId = callIntervention as string;
    interventionIds.push(callId);
    steps.push({
      level: 2,
      channel: "voice",
      interventionId: callId,
      scheduledFor: callScheduledFor,
      status: "pending",
    });
  }

  // ---- Step 3: Emergency Contact (crisis only, high/critical severity) ----
  if (
    opts.emergencyDelayHours &&
    (opts.severity === "high" || opts.severity === "critical")
  ) {
    const emergencyDelay = opts.emergencyDelayHours * 60 * 60 * 1000;
    const emergencyScheduledFor = new Date(
      now + smsDelay + emergencyDelay,
    ).toISOString();

    const { data: emergencyIntervention, error: emergencyError } =
      await supabase.rpc("propose_intervention", {
        p_tenant_id: tenantId,
        p_type: "proactive_message",
        p_title: `Emergency escalation: ${opts.reason}`,
        p_description: `Escalation level 3 — notify emergency contact`,
        p_action_payload: {
          action: "notify_emergency_contact",
          crisis_type: opts.reason === "crisis_followup" ? opts.reason : null,
          escalation_chain_id: chainId,
          escalation_level: 3,
          escalation_reason: opts.reason,
          only_if_no_response: true,
          response_check_since: callScheduledFor,
        },
        p_priority: "critical",
        p_source_agent: "outbound-engine",
        p_requires_approval: false,
        p_scheduled_for: emergencyScheduledFor,
      });

    if (!emergencyError && emergencyIntervention) {
      const emergencyId = emergencyIntervention as string;
      interventionIds.push(emergencyId);
      steps.push({
        level: 3,
        channel: "emergency",
        interventionId: emergencyId,
        scheduledFor: emergencyScheduledFor,
        status: "pending",
      });
    }
  }

  logger.info(
    `[EscalationManager] Chain created: ${chainId} (${steps.length} steps, reason: ${opts.reason})`,
  );

  return interventionIds;
}

// ============================================================================
// RESPONSE DETECTION
// ============================================================================

/**
 * Check if user has responded (any channel) since a given timestamp.
 */
export async function hasUserResponded(
  tenantId: string,
  sinceTimestamp: string,
): Promise<boolean> {
  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("exo_unified_thread")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .gt("created_at", sinceTimestamp)
      .limit(1);

    return (data && data.length > 0) || false;
  } catch (error) {
    console.error("[EscalationManager] Response check failed:", error);
    return false; // Fail safe — assume no response, allow escalation
  }
}

// ============================================================================
// PROCESS ESCALATIONS (called by CRON)
// ============================================================================

/**
 * Process pending escalation interventions.
 * For each "only_if_no_response" intervention that's due:
 * - If user responded → cancel intervention
 * - If user hasn't responded → let it execute normally
 *
 * Called by outbound-monitor CRON every 2 hours.
 */
export async function processEscalations(): Promise<{
  checked: number;
  escalated: number;
  cancelled: number;
}> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  let checked = 0;
  let escalated = 0;
  let cancelled = 0;

  try {
    // Find approved interventions with escalation metadata that are due
    const { data: pending } = await supabase
      .from("exo_interventions")
      .select("id, tenant_id, action_payload, scheduled_for, status")
      .in("status", ["proposed", "approved"])
      .lte("scheduled_for", now)
      .not("action_payload->only_if_no_response", "is", null)
      .limit(50);

    if (!pending || pending.length === 0) {
      return { checked: 0, escalated: 0, cancelled: 0 };
    }

    for (const intervention of pending) {
      checked++;
      const payload = intervention.action_payload as EscalationChainPayload;

      if (!payload.only_if_no_response) continue;

      const responseCheckSince = (
        intervention.action_payload as Record<string, unknown>
      ).response_check_since as string;
      if (!responseCheckSince) continue;

      const responded = await hasUserResponded(
        intervention.tenant_id,
        responseCheckSince,
      );

      if (responded) {
        // User responded — cancel this and all later steps in chain
        await cancelChainFrom(
          payload.escalation_chain_id,
          payload.escalation_level,
        );
        cancelled++;
        logger.info(
          `[EscalationManager] Cancelled escalation: user responded (chain: ${payload.escalation_chain_id}, level: ${payload.escalation_level})`,
        );
      } else {
        // No response — approve for execution (intervention-executor will pick it up)
        if (intervention.status === "proposed") {
          await supabase.rpc("approve_intervention", {
            p_intervention_id: intervention.id,
            p_approved_by: "escalation-manager",
          });
        }
        escalated++;
        logger.info(
          `[EscalationManager] Escalating: level ${payload.escalation_level} (chain: ${payload.escalation_chain_id})`,
        );
      }
    }
  } catch (error) {
    console.error("[EscalationManager] processEscalations failed:", error);
  }

  return { checked, escalated, cancelled };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Cancel all pending interventions in an escalation chain from a given level.
 */
async function cancelChainFrom(
  chainId: string,
  fromLevel: number,
): Promise<void> {
  try {
    const supabase = createServiceClient();

    // Find all pending interventions in this chain at or above this level
    const { data: chainInterventions } = await supabase
      .from("exo_interventions")
      .select("id, action_payload")
      .in("status", ["proposed", "approved"])
      .eq("action_payload->>escalation_chain_id", chainId);

    if (!chainInterventions) return;

    for (const intervention of chainInterventions) {
      const payload = intervention.action_payload as EscalationChainPayload;
      if (payload.escalation_level >= fromLevel) {
        await supabase
          .from("exo_interventions")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", intervention.id);

        // Remove from queue
        await supabase
          .from("exo_intervention_queue")
          .delete()
          .eq("intervention_id", intervention.id);
      }
    }
  } catch (error) {
    console.error("[EscalationManager] Failed to cancel chain:", error);
  }
}
