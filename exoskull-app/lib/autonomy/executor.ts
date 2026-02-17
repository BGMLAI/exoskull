/**
 * Autonomy Executor
 *
 * Executes approved interventions from the queue.
 * Dispatches action_type to appropriate handler (GHL messaging, calls, tasks).
 *
 * Called by:
 * 1. Cron job (/api/cron/intervention-executor) for auto-execution after timeout
 * 2. Direct approval flow when user says "działaj" / "ok"
 */

import twilio from "twilio";
import { makeOutboundCall } from "../voice/twilio-client";
import { appendMessage } from "../unified-thread";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emitEvent } from "@/lib/iors/loop";
import { createTask } from "@/lib/tasks/task-service";

import { getAlignmentGuardian } from "./guardian";
import { logger } from "@/lib/logger";
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  };
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY;
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
}

// ============================================================================
// TYPES
// ============================================================================

interface Intervention {
  id: string;
  tenant_id: string;
  intervention_type: string;
  title: string;
  description: string | null;
  action_payload: Record<string, unknown>;
  priority: string;
  status: string;
  scheduled_for: string | null;
  retry_count: number;
  max_retries: number;
}

interface QueueItem {
  id: string;
  intervention_id: string;
  tenant_id: string;
  priority: number;
  scheduled_at: string;
  attempts: number;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  error?: string;
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a single intervention by ID.
 */
export async function executeIntervention(
  interventionId: string,
): Promise<ExecutionResult> {
  const supabase = getServiceSupabase();

  // Load intervention
  const { data: intervention, error: loadError } = await supabase
    .from("exo_interventions")
    .select("*")
    .eq("id", interventionId)
    .single();

  if (loadError || !intervention) {
    logger.error("[Executor] Intervention not found:", interventionId);
    return {
      success: false,
      message: "Intervention not found",
      error: loadError?.message,
    };
  }

  // Mark as executing
  await supabase
    .from("exo_interventions")
    .update({ status: "executing", updated_at: new Date().toISOString() })
    .eq("id", interventionId);

  try {
    // Guardian re-check before execution (rules may have changed since approval)
    try {
      const guardian = getAlignmentGuardian();
      const verdict = await guardian.verifyBenefit(intervention.tenant_id, {
        id: intervention.id,
        type: intervention.intervention_type as any,
        title: intervention.title,
        description: intervention.description || "",
        actionPayload: intervention.action_payload as any,
        priority: intervention.priority as any,
        requiresApproval: false,
        reasoning: "pre-execution re-check",
      });
      if (verdict.action === "blocked") {
        logger.warn("[Executor] Guardian blocked intervention:", {
          interventionId,
          reason: verdict.reasoning,
        });
        await supabase
          .from("exo_interventions")
          .update({
            status: "blocked",
            execution_error: `Guardian blocked: ${verdict.reasoning}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", interventionId);
        await supabase
          .from("exo_intervention_queue")
          .delete()
          .eq("intervention_id", interventionId);
        return {
          success: false,
          message: `Guardian blocked: ${verdict.reasoning}`,
        };
      }
    } catch (guardianError) {
      // Guardian failure should not block execution — log and continue
      logger.warn("[Executor] Guardian check failed, proceeding:", {
        interventionId,
        error:
          guardianError instanceof Error
            ? guardianError.message
            : String(guardianError),
      });
    }

    // Validate action type against whitelist before dispatching
    const actionType =
      ((intervention.action_payload as Record<string, unknown>)
        ?.action as string) || intervention.intervention_type;
    if (!ALLOWED_ACTION_TYPES.has(actionType)) {
      logger.warn("[Executor] Rejected unknown action type:", {
        interventionId,
        actionType,
      });
      await supabase
        .from("exo_interventions")
        .update({
          status: "failed",
          execution_error: `Rejected: action type "${actionType}" is not in the allowed whitelist`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interventionId);
      await supabase
        .from("exo_intervention_queue")
        .delete()
        .eq("intervention_id", interventionId);
      return {
        success: false,
        message: `Rejected: action type "${actionType}" is not whitelisted`,
      };
    }

    const result = await dispatchAction(intervention as Intervention);

    // Mark as completed
    await supabase
      .from("exo_interventions")
      .update({
        status: "completed",
        executed_at: new Date().toISOString(),
        execution_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq("id", interventionId);

    // Remove from queue
    await supabase
      .from("exo_intervention_queue")
      .delete()
      .eq("intervention_id", interventionId);

    // Emit outbound_ready event for Pętla loop
    // Use action_type (snake_case) to match what outbound handler reads
    emitEvent({
      tenantId: intervention.tenant_id,
      eventType: "outbound_ready",
      priority: 1,
      source: "executor",
      payload: {
        interventionId,
        action_type:
          (intervention.action_payload as Record<string, unknown>)?.action ||
          "send_notification",
        message: result.message,
      },
      dedupKey: `executor:${interventionId}`,
    }).catch((err) => logger.error("[Executor] emitEvent failed:", err));

    // Notify user about completed action
    await notifyUser(intervention as Intervention, result);

    logger.info("[Executor] Completed:", {
      interventionId,
      result: result.message,
    });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update retry count
    const retryCount = (intervention.retry_count || 0) + 1;
    const maxRetries = intervention.max_retries || 3;

    if (retryCount >= maxRetries) {
      // Mark as failed
      await supabase
        .from("exo_interventions")
        .update({
          status: "failed",
          retry_count: retryCount,
          execution_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interventionId);

      // Remove from queue
      await supabase
        .from("exo_intervention_queue")
        .delete()
        .eq("intervention_id", interventionId);
    } else {
      // Back to approved for retry
      await supabase
        .from("exo_interventions")
        .update({
          status: "approved",
          retry_count: retryCount,
          execution_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", interventionId);

      // Update queue for retry (delay 5 minutes per retry)
      await supabase
        .from("exo_intervention_queue")
        .update({
          scheduled_at: new Date(
            Date.now() + retryCount * 5 * 60 * 1000,
          ).toISOString(),
          locked_until: null,
          last_error: errorMessage,
          attempts: retryCount,
        })
        .eq("intervention_id", interventionId);
    }

    logger.error("[Executor] Failed:", {
      interventionId,
      error: errorMessage,
      retryCount,
    });
    return { success: false, message: "Execution failed", error: errorMessage };
  }
}

/**
 * Process all due items in the intervention queue.
 * Called by the cron job.
 */
export async function processQueue(
  limit: number = 10,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  // Fetch due queue items (not locked)
  const { data: items, error } = await supabase
    .from("exo_intervention_queue")
    .select("*, exo_interventions(status)")
    .lte("scheduled_at", now)
    .or("locked_until.is.null,locked_until.lte." + now)
    .order("priority", { ascending: false })
    .limit(limit);

  if (error || !items?.length) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // Filter only approved interventions
  const dueItems = items.filter(
    (item: QueueItem & { exo_interventions: { status: string } }) =>
      item.exo_interventions?.status === "approved",
  );

  let succeeded = 0;
  let failed = 0;

  for (const item of dueItems) {
    // Lock the item (5 minute lock)
    await supabase
      .from("exo_intervention_queue")
      .update({
        locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        locked_by: "cron-executor",
      })
      .eq("id", item.id);

    const result = await executeIntervention(item.intervention_id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  logger.info("[Executor] Queue processed:", {
    total: dueItems.length,
    succeeded,
    failed,
  });
  return { processed: dueItems.length, succeeded, failed };
}

/**
 * Process interventions that have passed their approval timeout.
 * Auto-approves and queues them for execution.
 */
export async function processTimeouts(): Promise<number> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  // Find proposed interventions with expired scheduled_for (timeout passed)
  const { data: timedOut } = await supabase
    .from("exo_interventions")
    .select("id, tenant_id, priority")
    .eq("status", "proposed")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", now)
    .is("expires_at", null)
    .limit(20);

  if (!timedOut?.length) return 0;

  let autoApproved = 0;

  for (const intervention of timedOut) {
    // Auto-approve (timeout = implicit consent)
    const { error } = await supabase.rpc("approve_intervention", {
      p_intervention_id: intervention.id,
      p_approved_by: "auto_timeout",
    });

    if (!error) {
      autoApproved++;
      logger.info("[Executor] Auto-approved after timeout:", intervention.id);
    }
  }

  return autoApproved;
}

// ============================================================================
// ACTION DISPATCH
// ============================================================================

/**
 * Whitelist of allowed action types that dispatchAction can execute.
 * Any action_type not in this set will be rejected before dispatch.
 */
const ALLOWED_ACTION_TYPES = new Set([
  "send_sms",
  "send_email",
  "send_whatsapp",
  "make_call",
  "create_task",
  "task_creation",
  "proactive_message",
  "send_notification",
  "trigger_checkin",
  "gap_detection",
  "run_automation",
  "automation_trigger",
  "notify_emergency_contact",
  "custom",
]);

async function dispatchAction(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const payload = intervention.action_payload;
  const actionType =
    (payload.action as string) || intervention.intervention_type;

  switch (actionType) {
    case "send_sms":
      return await handleSendSms(intervention);
    case "send_email":
      return await handleSendEmail(intervention);
    case "send_whatsapp":
      return await handleSendWhatsApp(intervention);
    case "make_call":
      return await handleMakeCall(intervention);
    case "create_task":
    case "task_creation":
      return await handleCreateTask(intervention);
    case "proactive_message":
    case "send_notification":
    case "trigger_checkin":
    case "gap_detection":
      return await handleProactiveMessage(intervention);
    case "run_automation":
    case "automation_trigger":
      return await handleRunAutomationFromIntervention(intervention);
    case "notify_emergency_contact":
      return await handleNotifyEmergencyContact(intervention);
    case "custom":
      return await handleCustomActionFromIntervention(intervention);
    default:
      return { success: false, message: `Unknown action type: ${actionType}` };
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleSendSms(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { phone, message, to } = intervention.action_payload as {
    phone?: string;
    message?: string;
    to?: string;
  };
  const targetPhone = phone || to;

  if (!targetPhone || !message) {
    return { success: false, message: "Missing phone or message in payload" };
  }

  const tw = getTwilioConfig();
  const twilioClient = twilio(tw.accountSid, tw.authToken);
  await twilioClient.messages.create({
    to: targetPhone,
    from: tw.phoneNumber,
    body: message as string,
  });

  await appendMessage(intervention.tenant_id, {
    role: "assistant",
    content: `[Autonomiczna akcja] SMS do ${targetPhone}: ${message}`,
    channel: "sms",
    direction: "outbound",
    source_type: "intervention",
    source_id: intervention.id,
  }).catch((err) => {
    logger.error("[Executor] Failed to log SMS message:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });

  return { success: true, message: `SMS wysłany do ${targetPhone}` };
}

async function handleSendEmail(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { email, to, subject, body, message } = intervention.action_payload as {
    email?: string;
    to?: string;
    subject?: string;
    body?: string;
    message?: string;
  };
  const targetEmail = email || to;
  const emailBody = body || message;

  if (!targetEmail || !emailBody) {
    return { success: false, message: "Missing email or body in payload" };
  }

  const resendKey = getResendApiKey();
  if (!resendKey) {
    return {
      success: false,
      message: "Email not configured (missing RESEND_API_KEY)",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "IORS <iors@exoskull.xyz>",
      to: [targetEmail],
      subject: subject || "Wiadomość od IORS",
      text: emailBody,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[Executor] Resend email error:", errorText);
    return { success: false, message: `Email failed: ${response.status}` };
  }

  await appendMessage(intervention.tenant_id, {
    role: "assistant",
    content: `[Autonomiczna akcja] Email do ${targetEmail}: ${subject || "(bez tematu)"}`,
    channel: "email",
    direction: "outbound",
    source_type: "intervention",
    source_id: intervention.id,
  }).catch((err) => {
    logger.error("[Executor] Failed to log email message:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });

  return { success: true, message: `Email wysłany do ${targetEmail}` };
}

async function handleSendWhatsApp(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { phone, message, to } = intervention.action_payload as {
    phone?: string;
    message?: string;
    to?: string;
  };
  const targetPhone = phone || to;

  if (!targetPhone || !message) {
    return { success: false, message: "Missing phone or message in payload" };
  }

  const { getWhatsAppClient } = await import("@/lib/channels/whatsapp/client");
  const client = getWhatsAppClient();
  if (!client) {
    return {
      success: false,
      message:
        "WhatsApp not configured (missing META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID)",
    };
  }

  await client.sendTextMessage(targetPhone, message as string);

  await appendMessage(intervention.tenant_id, {
    role: "assistant",
    content: `[Autonomiczna akcja] WhatsApp do ${targetPhone}: ${message}`,
    channel: "whatsapp",
    direction: "outbound",
    source_type: "intervention",
    source_id: intervention.id,
  }).catch((err) => {
    logger.error("[Executor] Failed to log WhatsApp message:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });

  return { success: true, message: `WhatsApp wysłany do ${targetPhone}` };
}

async function handleMakeCall(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { phone, purpose, instructions } = intervention.action_payload as {
    phone?: string;
    purpose?: string;
    instructions?: string;
  };

  if (!phone) {
    return { success: false, message: "Missing phone number" };
  }

  const result = await makeOutboundCall({
    to: phone,
    webhookUrl: `${getAppUrl()}/api/twilio/voice?action=start`,
    statusCallbackUrl: `${getAppUrl()}/api/twilio/status`,
    timeout: 30,
  });

  await appendMessage(intervention.tenant_id, {
    role: "assistant",
    content: `[Autonomiczna akcja] Dzwonię pod ${phone}: ${purpose || ""}`,
    channel: "voice",
    direction: "outbound",
    source_type: "intervention",
    source_id: intervention.id,
  }).catch((err) => {
    logger.error("[Executor] Failed to log call message:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });

  return {
    success: true,
    message: `Zadzwoniono pod ${phone} (SID: ${result.callSid})`,
  };
}

async function handleCreateTask(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { title, priority } = intervention.action_payload as {
    title?: string;
    priority?: number;
  };

  if (!title) {
    return { success: false, message: "Missing task title" };
  }

  const result = await createTask(intervention.tenant_id, {
    title,
    priority: (priority || 2) as 1 | 2 | 3 | 4,
    status: "pending",
    context: {
      source: "intervention",
      intervention_id: intervention.id,
    },
  });

  if (!result.id) {
    return {
      success: false,
      message: `Failed to create task: ${result.error || "unknown"}`,
    };
  }

  return { success: true, message: `Zadanie utworzone: "${title}"` };
}

async function handleProactiveMessage(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const payload = intervention.action_payload as {
    message?: string;
    params?: { message?: string; message_pl?: string };
  };
  const message = payload.message || payload.params?.message;

  if (!message) {
    return { success: false, message: "Missing message" };
  }

  // Use multi-channel dispatchReport (9-channel fallback chain)
  const { dispatchReport } = await import("@/lib/reports/report-dispatcher");
  const result = await dispatchReport(
    intervention.tenant_id,
    message,
    "proactive",
  );

  return {
    success: result.success,
    message: result.success
      ? `Wiadomość wysłana via ${result.channel}`
      : `Nie udało się wysłać: ${result.error || "brak dostępnych kanałów"}`,
  };
}

async function handleRunAutomationFromIntervention(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { automationId, params } = intervention.action_payload as {
    automationId?: string;
    params?: Record<string, unknown>;
  };

  if (!automationId) {
    return {
      success: false,
      message: "Missing automationId in action_payload",
    };
  }

  // Delegate to ActionExecutor (single source of truth)
  const { getActionExecutor } = await import("./action-executor");
  const executor = getActionExecutor();
  const result = await executor.execute({
    type: "run_automation",
    tenantId: intervention.tenant_id,
    params: { automationId, params },
    interventionId: intervention.id,
    skipPermissionCheck: true, // Already approved via intervention flow
  });

  return {
    success: result.success,
    message: result.success
      ? `Automation executed: ${(result.data as Record<string, unknown>)?.automationName || automationId}`
      : `Automation failed: ${result.error}`,
  };
}

async function handleCustomActionFromIntervention(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const payload = intervention.action_payload as Record<string, unknown>;
  const actionName =
    (payload.actionName as string) || (payload.action as string);

  if (!actionName || actionName === "custom") {
    return { success: false, message: "Missing actionName in action_payload" };
  }

  const { getActionExecutor } = await import("./action-executor");
  const executor = getActionExecutor();
  const result = await executor.execute({
    type: "custom",
    tenantId: intervention.tenant_id,
    params: { actionName, params: payload.params || {} },
    interventionId: intervention.id,
    skipPermissionCheck: true,
  });

  return {
    success: result.success,
    message: result.success
      ? `Custom action "${actionName}" executed`
      : `Custom action "${actionName}" failed: ${result.error}`,
  };
}

async function handleNotifyEmergencyContact(
  intervention: Intervention,
): Promise<ExecutionResult> {
  const { notifyEmergencyContact } = await import("./emergency-notifier");
  const result = await notifyEmergencyContact(
    intervention.tenant_id,
    intervention.description || "Crisis follow-up",
    intervention.action_payload.crisis_type as string | undefined,
  );

  await appendMessage(intervention.tenant_id, {
    role: "system",
    content: result.success
      ? `[Autonomiczna akcja] Powiadomiono kontakt awaryjny: ${result.contactedName}`
      : `[Autonomiczna akcja] Nie udało się powiadomić kontaktu awaryjnego: ${result.error}`,
    channel: "sms",
    direction: "outbound",
    source_type: "intervention",
    source_id: intervention.id,
  }).catch((err) => {
    logger.error("[Executor] Failed to log emergency notification:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });

  return {
    success: result.success,
    message: result.success
      ? `Kontakt awaryjny powiadomiony: ${result.contactedName}`
      : `Nie udało się: ${result.error}`,
  };
}

// ============================================================================
// USER NOTIFICATION
// ============================================================================

async function notifyUser(
  intervention: Intervention,
  result: ExecutionResult,
): Promise<void> {
  // Log to unified thread that action was completed
  await appendMessage(intervention.tenant_id, {
    role: "system",
    content: `Wykonano zaplanowaną akcję: ${intervention.title}. Wynik: ${result.message}`,
    channel: "web_chat",
    source_type: "intervention",
    source_id: intervention.id,
    metadata: { executionResult: result },
  }).catch((err) => {
    logger.error("[Executor] Failed to log user notification:", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: intervention.tenant_id,
      interventionId: intervention.id,
    });
  });
}
