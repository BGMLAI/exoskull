/**
 * Life Signal Triage Engine — universal signal processing for ExoSkull.
 *
 * Processes ALL incoming signals (emails, messages, notifications, events, etc.)
 * and proposes actions that lead to user's goal realization.
 *
 * This is NOT just email triage — it's a universal sense-making layer that:
 * 1. Classifies every signal by urgency and relevance to user's goals
 * 2. Proposes optimal action (respond, task, delegate, build app, etc.)
 * 3. Links signals to active goals when relevant
 * 4. Executes approved actions autonomously
 */

import { aiChat } from "@/lib/ai";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type SignalType =
  | "email"
  | "sms"
  | "whatsapp"
  | "slack"
  | "calendar_event"
  | "notification"
  | "health_alert"
  | "finance_alert"
  | "social_event"
  | "system_event"
  | "web_mention"
  | "app_event";

export type SignalClassification =
  | "urgent"
  | "important"
  | "routine"
  | "noise"
  | "opportunity";

export type ProposedAction =
  | "respond"
  | "create_task"
  | "archive"
  | "forward"
  | "schedule_meeting"
  | "delegate"
  | "research"
  | "connect_to_goal"
  | "ignore"
  | "build_app";

export interface SignalInput {
  signalType: SignalType;
  sourceId?: string;
  sourceChannel?: string;
  fromIdentifier?: string;
  subject?: string;
  snippet?: string;
  fullPayload?: Record<string, unknown>;
}

export interface TriageResult {
  id: string;
  classification: SignalClassification;
  proposedAction: ProposedAction;
  actionParams: Record<string, unknown>;
  draftResponse?: string;
  relatedGoalId?: string;
  reasoning: string;
  confidence: number;
}

// ============================================================================
// MAIN: TRIAGE A SIGNAL
// ============================================================================

/**
 * Triage a single signal — classify, propose action, link to goals.
 */
export async function triageSignal(
  tenantId: string,
  signal: SignalInput,
): Promise<TriageResult> {
  const supabase = getServiceSupabase();

  // Collect user context for informed triage
  const [activeGoals, recentSignals] = await Promise.all([
    supabase
      .from("exo_user_goals")
      .select("id, name, category, target_value, target_unit")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .then((r) => r.data || []),
    supabase
      .from("exo_signal_triage")
      .select("signal_type, from_identifier, classification, proposed_action")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then((r) => r.data || []),
  ]);

  // AI classification + action proposal
  const triageData = await classifyWithAI(signal, activeGoals, recentSignals);

  // Persist triage
  const { data: row, error } = await supabase
    .from("exo_signal_triage")
    .insert({
      tenant_id: tenantId,
      signal_type: signal.signalType,
      source_id: signal.sourceId,
      source_channel: signal.sourceChannel,
      from_identifier: signal.fromIdentifier,
      subject: signal.subject,
      snippet: signal.snippet,
      full_payload: signal.fullPayload || {},
      classification: triageData.classification,
      proposed_action: triageData.proposedAction,
      action_params: triageData.actionParams,
      draft_response: triageData.draftResponse,
      related_goal_id: triageData.relatedGoalId,
      reasoning: triageData.reasoning,
      confidence: triageData.confidence,
      status: "proposed",
      proposed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !row) {
    logger.error("[SignalTriage] Failed to persist:", {
      error: error?.message,
      signal: signal.subject,
    });
    throw new Error(`Failed to persist signal triage: ${error?.message}`);
  }

  // Notify user if not noise
  if (triageData.classification !== "noise") {
    const actionLabel =
      ACTION_LABELS[triageData.proposedAction] || triageData.proposedAction;
    const urgencyEmoji =
      triageData.classification === "urgent"
        ? "!!!"
        : triageData.classification === "important"
          ? "!"
          : "";

    const goalLink = triageData.relatedGoalId
      ? ` (powiązane z celem: ${activeGoals.find((g) => g.id === triageData.relatedGoalId)?.name || "?"})`
      : "";

    const message =
      `${urgencyEmoji} [${signal.signalType}] Od: ${signal.fromIdentifier || "?"}\n` +
      `Temat: ${signal.subject || "(brak)"}\n` +
      `Proponuję: ${actionLabel}${goalLink}\n` +
      `${triageData.draftResponse ? `\nDraft: "${triageData.draftResponse.slice(0, 100)}..."\n` : ""}` +
      `Powiedz "tak" lub opisz co zrobić.`;

    await sendProactiveMessage(
      tenantId,
      message,
      "signal_triage",
      "triage-engine",
    );
  }

  return {
    id: row.id as string,
    classification: triageData.classification,
    proposedAction: triageData.proposedAction,
    actionParams: triageData.actionParams,
    draftResponse: triageData.draftResponse,
    relatedGoalId: triageData.relatedGoalId,
    reasoning: triageData.reasoning,
    confidence: triageData.confidence,
  };
}

// ============================================================================
// BATCH: PROCESS PENDING SIGNALS FROM ALL SOURCES
// ============================================================================

/**
 * Collect and triage signals from all integrated sources.
 * Called by the signal-triage CRON.
 */
export async function processNewSignals(maxSignals: number = 20): Promise<{
  processed: number;
  urgent: number;
  goalLinked: number;
  errors: number;
}> {
  const supabase = getServiceSupabase();
  const result = { processed: 0, urgent: 0, goalLinked: 0, errors: 0 };

  // 1. Collect new emails (analyzed but not triaged)
  const emailSignals = await collectEmailSignals(supabase, maxSignals);

  // 2. Collect new messages from unified thread (inbound, not yet triaged)
  const messageSignals = await collectMessageSignals(supabase, maxSignals);

  // 3. Collect calendar events approaching
  const calendarSignals = await collectCalendarSignals(supabase);

  // 4. Collect health alerts
  const healthSignals = await collectHealthSignals(supabase);

  const allSignals = [
    ...emailSignals,
    ...messageSignals,
    ...calendarSignals,
    ...healthSignals,
  ].slice(0, maxSignals);

  // Triage each signal
  for (const { tenantId, signal } of allSignals) {
    try {
      const triage = await triageSignal(tenantId, signal);
      result.processed++;
      if (triage.classification === "urgent") result.urgent++;
      if (triage.relatedGoalId) result.goalLinked++;
    } catch (error) {
      result.errors++;
      logger.error("[SignalTriage] Processing error:", {
        signal: signal.subject,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return result;
}

// ============================================================================
// EXECUTE APPROVED TRIAGE ACTION
// ============================================================================

/**
 * Execute a triage action after user approval.
 */
export async function executeTriageAction(
  triageId: string,
): Promise<{ success: boolean; result?: string }> {
  const supabase = getServiceSupabase();

  const { data: triage } = await supabase
    .from("exo_signal_triage")
    .select("*")
    .eq("id", triageId)
    .single();

  if (!triage) return { success: false, result: "Triage not found" };

  const { getActionExecutor } = await import("@/lib/autonomy/action-executor");
  const executor = getActionExecutor();

  const tenantId = triage.tenant_id as string;
  const action = triage.proposed_action as ProposedAction;
  const params = triage.action_params as Record<string, unknown>;

  let execResult: { success: boolean; result?: string };

  switch (action) {
    case "respond": {
      const result = await executor.execute({
        type: "send_email",
        tenantId,
        params: {
          to: params.to || triage.from_identifier,
          subject: params.subject || `Re: ${triage.subject || ""}`,
          body: triage.draft_response || (params.body as string),
        },
        skipPermissionCheck: true,
      });
      execResult = {
        success: result.success,
        result: result.success
          ? `Odpowiedź wysłana do ${params.to || triage.from_identifier}`
          : result.error,
      };
      break;
    }

    case "create_task": {
      const result = await executor.execute({
        type: "create_task",
        tenantId,
        params: {
          title:
            params.title ||
            `[${triage.signal_type}] ${triage.subject || "Nowe zadanie"}`,
          description:
            params.description ||
            `Źródło: ${triage.signal_type} od ${triage.from_identifier}\n${triage.snippet || ""}`,
          priority: params.priority || "medium",
        },
        skipPermissionCheck: true,
      });
      execResult = {
        success: result.success,
        result: result.success ? `Zadanie utworzone` : result.error,
      };
      break;
    }

    case "schedule_meeting": {
      const result = await executor.execute({
        type: "create_event",
        tenantId,
        params: {
          title: params.title || `Spotkanie: ${triage.subject || ""}`,
          startTime: params.startTime,
          endTime: params.endTime,
          description: params.description || triage.snippet,
        },
        skipPermissionCheck: true,
      });
      execResult = {
        success: result.success,
        result: result.success ? `Spotkanie zaplanowane` : result.error,
      };
      break;
    }

    case "connect_to_goal": {
      // Link signal to goal for strategy engine to pick up
      if (triage.related_goal_id) {
        execResult = {
          success: true,
          result: `Sygnał połączony z celem`,
        };
      } else {
        execResult = { success: false, result: "Brak powiązanego celu" };
      }
      break;
    }

    case "archive":
    case "ignore": {
      execResult = { success: true, result: "Zarchiwizowano" };
      break;
    }

    default: {
      execResult = {
        success: false,
        result: `Nieobsługiwana akcja: ${action}`,
      };
    }
  }

  // Update triage status
  await supabase
    .from("exo_signal_triage")
    .update({
      status: execResult.success ? "executed" : "pending",
      executed_at: execResult.success ? new Date().toISOString() : undefined,
    })
    .eq("id", triageId);

  return execResult;
}

// ============================================================================
// SIGNAL COLLECTORS
// ============================================================================

interface CollectedSignal {
  tenantId: string;
  signal: SignalInput;
}

async function collectEmailSignals(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
): Promise<CollectedSignal[]> {
  // Get analyzed emails not yet triaged
  const { data: emails } = await supabase
    .from("exo_analyzed_emails")
    .select(
      "id, tenant_id, from_email, from_name, subject, snippet, category, priority_score, analysis_status",
    )
    .eq("analysis_status", "completed")
    .gt("priority_score", 30) // Skip low-priority/spam
    .not(
      "id",
      "in",
      supabase
        .from("exo_signal_triage")
        .select("source_id")
        .eq("signal_type", "email"),
    )
    .order("date_received", { ascending: false })
    .limit(limit);

  // Fallback: if subquery doesn't work, filter manually
  if (!emails) return [];

  // Check which emails already have triages
  const emailIds = emails.map((e) => e.id);
  const { data: existingTriages } = await supabase
    .from("exo_signal_triage")
    .select("source_id")
    .eq("signal_type", "email")
    .in("source_id", emailIds);

  const existingIds = new Set((existingTriages || []).map((t) => t.source_id));

  return emails
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({
      tenantId: e.tenant_id,
      signal: {
        signalType: "email" as const,
        sourceId: e.id,
        sourceChannel: "gmail",
        fromIdentifier: e.from_email,
        subject: e.subject,
        snippet: e.snippet,
        fullPayload: {
          from_name: e.from_name,
          category: e.category,
          priority_score: e.priority_score,
        },
      },
    }));
}

async function collectMessageSignals(
  supabase: ReturnType<typeof getServiceSupabase>,
  limit: number,
): Promise<CollectedSignal[]> {
  // Inbound messages not yet triaged (last 30 min)
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: messages } = await supabase
    .from("exo_unified_thread")
    .select("id, tenant_id, content, channel, role, created_at, metadata")
    .eq("role", "user")
    .eq("direction", "inbound")
    .gte("created_at", since)
    .in("channel", ["sms", "whatsapp", "slack"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!messages) return [];

  // Filter out already triaged
  const msgIds = messages.map((m) => m.id);
  const { data: existingTriages } = await supabase
    .from("exo_signal_triage")
    .select("source_id")
    .in("signal_type", ["sms", "whatsapp", "slack"])
    .in("source_id", msgIds);

  const existingIds = new Set((existingTriages || []).map((t) => t.source_id));

  return messages
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({
      tenantId: m.tenant_id,
      signal: {
        signalType: m.channel as SignalType,
        sourceId: m.id,
        sourceChannel: m.channel,
        fromIdentifier: (m.metadata as Record<string, unknown>)?.from as string,
        subject: undefined,
        snippet: (m.content as string)?.slice(0, 300),
        fullPayload: { content: m.content, metadata: m.metadata },
      },
    }));
}

async function collectCalendarSignals(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<CollectedSignal[]> {
  // Calendar events in next 2 hours that might need prep
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data: events } = await supabase
    .from("exo_health_metrics")
    .select("id, tenant_id, metric_type, value, notes, recorded_at")
    .eq("metric_type", "calendar_event")
    .gte("recorded_at", now.toISOString())
    .lte("recorded_at", twoHoursLater.toISOString())
    .limit(5);

  if (!events) return [];

  return events.map((e) => ({
    tenantId: e.tenant_id,
    signal: {
      signalType: "calendar_event" as const,
      sourceId: e.id,
      sourceChannel: "google_calendar",
      subject: e.notes || "Wydarzenie kalendarza",
      snippet: `Za ${Math.round((new Date(e.recorded_at).getTime() - now.getTime()) / 60000)} min`,
    },
  }));
}

async function collectHealthSignals(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<CollectedSignal[]> {
  // Recent health anomalies
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: alerts } = await supabase
    .from("exo_health_metrics")
    .select("id, tenant_id, metric_type, value, unit, notes, recorded_at")
    .gte("recorded_at", hourAgo)
    .or(
      "metric_type.eq.heart_rate_alert,metric_type.eq.stress_alert,metric_type.eq.sleep_alert",
    )
    .limit(5);

  if (!alerts) return [];

  return alerts.map((a) => ({
    tenantId: a.tenant_id,
    signal: {
      signalType: "health_alert" as const,
      sourceId: a.id,
      sourceChannel: "health_monitor",
      subject: `Health alert: ${a.metric_type}`,
      snippet: `${a.value} ${a.unit || ""} - ${a.notes || ""}`,
    },
  }));
}

// ============================================================================
// AI CLASSIFICATION
// ============================================================================

async function classifyWithAI(
  signal: SignalInput,
  activeGoals: Record<string, unknown>[],
  recentSignals: Record<string, unknown>[],
): Promise<{
  classification: SignalClassification;
  proposedAction: ProposedAction;
  actionParams: Record<string, unknown>;
  draftResponse?: string;
  relatedGoalId?: string;
  reasoning: string;
  confidence: number;
}> {
  const goalsContext =
    activeGoals.length > 0
      ? `\nAKTYWNE CELE UŻYTKOWNIKA:\n${activeGoals.map((g) => `- ${g.name} (${g.category}): ${g.target_value || "?"} ${g.target_unit || ""}`).join("\n")}`
      : "";

  const response = await aiChat(
    [
      {
        role: "system",
        content: `Jesteś systemem triage w ExoSkull — Adaptive Life Operating System.
Analizujesz przychodzące sygnały i proponujesz OPTYMALNE DZIAŁANIE prowadzące do realizacji celów użytkownika.

KLASYFIKACJA:
- urgent: wymaga natychmiastowej reakcji (<1h)
- important: ważne, ale może poczekać (dziś)
- routine: standardowe, regularne
- noise: spam, nieistotne, automatyczne powiadomienia
- opportunity: okazja powiązana z celami użytkownika

PROPONOWANE AKCJE:
- respond: odpowiedz (wygeneruj draft)
- create_task: utwórz zadanie
- archive: zarchiwizuj
- forward: przekaż komuś
- schedule_meeting: zaplanuj spotkanie
- delegate: deleguj
- research: zbadaj temat
- connect_to_goal: połącz z aktywnym celem
- ignore: ignoruj
- build_app: wymaga zbudowania narzędzia/aplikacji

ZASADY:
1. ZAWSZE sprawdź czy sygnał jest powiązany z celami użytkownika
2. Jeśli tak — proponuj akcję prowadzącą do realizacji celu
3. Jeśli to okazja — zaproponuj jak ją wykorzystać
4. Dla "respond" — wygeneruj draft odpowiedzi
5. action_params muszą zawierać konkretne dane do wykonania

Zwróć TYLKO JSON:
{
  "classification": "urgent|important|routine|noise|opportunity",
  "proposedAction": "respond|create_task|...",
  "actionParams": { "konkretne parametry" },
  "draftResponse": "draft odpowiedzi jeśli respond, null jeśli nie",
  "relatedGoalId": "UUID celu jeśli powiązane, null jeśli nie",
  "reasoning": "dlaczego ta akcja",
  "confidence": 0.0-1.0
}`,
      },
      {
        role: "user",
        content: `SYGNAŁ:
Typ: ${signal.signalType}
Od: ${signal.fromIdentifier || "nieznany"}
Temat: ${signal.subject || "(brak)"}
Treść: ${signal.snippet || "(brak)"}
Kanał: ${signal.sourceChannel || "?"}${goalsContext}`,
      },
    ],
    {
      taskCategory: "classification", // Tier 1 — Gemini Flash (cheap)
      maxTokens: 500,
      temperature: 0,
    },
  );

  try {
    let content = response.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(content);

    return {
      classification: parsed.classification || "routine",
      proposedAction: parsed.proposedAction || "archive",
      actionParams: parsed.actionParams || {},
      draftResponse: parsed.draftResponse || undefined,
      relatedGoalId: parsed.relatedGoalId || undefined,
      reasoning: parsed.reasoning || "",
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.7)),
    };
  } catch {
    return {
      classification: "routine",
      proposedAction: "archive",
      actionParams: {},
      reasoning: "AI classification failed — defaulting to archive",
      confidence: 0.3,
    };
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTION_LABELS: Record<ProposedAction, string> = {
  respond: "Odpowiedz",
  create_task: "Utwórz zadanie",
  archive: "Zarchiwizuj",
  forward: "Przekaż",
  schedule_meeting: "Zaplanuj spotkanie",
  delegate: "Deleguj",
  research: "Zbadaj",
  connect_to_goal: "Połącz z celem",
  ignore: "Ignoruj",
  build_app: "Zbuduj narzędzie",
};
