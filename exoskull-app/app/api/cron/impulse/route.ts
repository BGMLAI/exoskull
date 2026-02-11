/**
 * Impulse CRON — Autonomous Task Executor
 *
 * Schedule: Every 30 minutes
 * The core autonomous engine. Asks "What can I DO for the user right now?"
 * then DOES it.
 *
 * Action checks (priority order):
 * A. Overdue tasks → reminder
 * B. Undelivered insights → deliver + mark
 * C. Goal deadlines approaching → warning
 * D. Pending approved interventions → execute
 * E. Stale email sync → log warning
 *
 * Rate limited: max 3 message actions per tenant per cycle.
 * Quiet hours respected. Non-message actions (DB updates) don't count.
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  getActiveTenants,
  isQuietHours,
  sendProactiveMessage,
} from "@/lib/cron/tenant-utils";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;
const MAX_ACTIONS_PER_TENANT = 3;

// ============================================================================
// ACTION HANDLERS
// ============================================================================

interface ActionResult {
  type: string;
  count: number;
  messagesSent: number;
}

/**
 * A. Overdue Tasks — remind user about tasks past due date.
 */
async function checkOverdueTasks(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "overdue_reminder",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const { data: overdue, error } = await supabase
      .from("exo_tasks")
      .select("id, title, due_date, priority")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "in_progress"])
      .lt("due_date", new Date().toISOString())
      .order("priority", { ascending: true })
      .limit(5);

    if (error) {
      console.error("[Impulse] Overdue tasks query failed:", {
        tenantId,
        error: error.message,
      });
      return result;
    }

    if (!overdue || overdue.length === 0) return result;
    result.count = overdue.length;

    if (!canMessage) return result;

    const taskList = overdue
      .map(
        (t) =>
          `- ${t.title}${t.due_date ? ` (termin: ${new Date(t.due_date).toLocaleDateString("pl-PL")})` : ""}`,
      )
      .join("\n");

    const message =
      overdue.length === 1
        ? `Masz zalegly task: ${overdue[0].title}. Chcesz go omowic?`
        : `Masz ${overdue.length} zaleglych taskow:\n${taskList}\n\nChcesz ktores omowic lub przesunac termin?`;

    const sent = await sendProactiveMessage(
      tenantId,
      message,
      "overdue_reminder",
      "impulse",
    );
    if (sent.success) result.messagesSent = 1;
  } catch (error) {
    console.error("[Impulse] checkOverdueTasks error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * B. Undelivered Insights — find source insights not yet in exo_insight_deliveries.
 */
async function checkUndeliveredInsights(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "insight_delivery",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Get already-delivered source IDs for this tenant
    const { data: delivered } = await supabase
      .from("exo_insight_deliveries")
      .select("source_id, source_table")
      .eq("tenant_id", tenantId);

    const deliveredSet = new Set(
      (delivered || []).map(
        (d: { source_id: string; source_table: string }) =>
          `${d.source_table}:${d.source_id}`,
      ),
    );

    // Query recent pattern-type interventions that completed but weren't delivered
    const { data: insights } = await supabase
      .from("exo_interventions")
      .select("id, title, description, priority")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("intervention_type", [
        "pattern_notification",
        "gap_detection",
        "goal_nudge",
      ])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(3);

    const undelivered = (insights || []).filter(
      (i) => !deliveredSet.has(`exo_interventions:${i.id}`),
    );

    if (undelivered.length === 0) return result;
    result.count = undelivered.length;

    // Mark as delivered regardless of whether we send a message
    for (const insight of undelivered) {
      await supabase.from("exo_insight_deliveries").upsert(
        {
          tenant_id: tenantId,
          source_table: "exo_interventions",
          source_id: insight.id,
          delivered_at: new Date().toISOString(),
          channel: "impulse",
        },
        { onConflict: "tenant_id,source_table,source_id" },
      );
    }

    if (!canMessage || undelivered.length === 0) return result;

    const insightTexts = undelivered
      .map((i) => `- ${i.title}${i.description ? `: ${i.description}` : ""}`)
      .join("\n");

    const message =
      undelivered.length === 1
        ? `Mam dla Ciebie insight: ${undelivered[0].title}${undelivered[0].description ? ` — ${undelivered[0].description}` : ""}`
        : `Mam ${undelivered.length} nowych insightow:\n${insightTexts}`;

    const sent = await sendProactiveMessage(
      tenantId,
      message,
      "insight_delivery",
      "impulse",
    );
    if (sent.success) result.messagesSent = 1;
  } catch (error) {
    console.error("[Impulse] checkUndeliveredInsights error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * C. Goal Deadlines Approaching — warn about goals due within 3 days with low progress.
 */
async function checkGoalDeadlines(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "goal_warning",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const threeDaysFromNow = new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: goals, error } = await supabase
      .from("exo_user_goals")
      .select("id, name, target_date, current_value, target_value, category")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .not("target_date", "is", null)
      .lte("target_date", threeDaysFromNow.split("T")[0])
      .gte("target_date", new Date().toISOString().split("T")[0]);

    if (error) {
      console.error("[Impulse] Goal deadlines query failed:", {
        tenantId,
        error: error.message,
      });
      return result;
    }

    // Filter to goals with progress < 80%
    const atRisk = (goals || []).filter((g) => {
      if (!g.target_value || g.target_value === 0) return false;
      const progress = ((g.current_value || 0) / g.target_value) * 100;
      return progress < 80;
    });

    if (atRisk.length === 0) return result;
    result.count = atRisk.length;

    if (!canMessage) return result;

    const goalList = atRisk
      .map((g) => {
        const progress = g.target_value
          ? Math.round(((g.current_value || 0) / g.target_value) * 100)
          : 0;
        const daysLeft = Math.ceil(
          (new Date(g.target_date).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        );
        return `- ${g.name}: ${progress}% (${daysLeft} dni do terminu)`;
      })
      .join("\n");

    const message =
      atRisk.length === 1
        ? `Uwaga — cel "${atRisk[0].name}" ma termin za chwile, a postep jest ponizej 80%. Chcesz omowic plan?`
        : `${atRisk.length} cele maja zbliajacy sie termin:\n${goalList}\n\nChcesz omowic strategie?`;

    const sent = await sendProactiveMessage(
      tenantId,
      message,
      "goal_warning",
      "impulse",
    );
    if (sent.success) result.messagesSent = 1;
  } catch (error) {
    console.error("[Impulse] checkGoalDeadlines error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * D. Pending Approved Interventions — execute approved interventions waiting for dispatch.
 */
async function checkPendingInterventions(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "intervention_execution",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const { data: pending, error } = await supabase
      .from("exo_interventions")
      .select("id, title, description, action_payload, intervention_type")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .is("executed_at", null)
      .order("created_at", { ascending: true })
      .limit(3);

    if (error) {
      console.error("[Impulse] Pending interventions query failed:", {
        tenantId,
        error: error.message,
      });
      return result;
    }

    if (!pending || pending.length === 0) return result;
    result.count = pending.length;

    for (const intervention of pending) {
      try {
        // Build message from intervention content
        const message = intervention.description || intervention.title;

        if (canMessage && result.messagesSent === 0) {
          const sent = await sendProactiveMessage(
            tenantId,
            message,
            "intervention_execution",
            "impulse",
          );
          if (sent.success) result.messagesSent = 1;
        }

        // Mark as executed regardless (non-message action)
        await supabase
          .from("exo_interventions")
          .update({
            status: "completed",
            executed_at: new Date().toISOString(),
            execution_result: {
              dispatched_by: "impulse",
              dispatched_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", intervention.id);
      } catch (err) {
        console.error("[Impulse] Failed to execute intervention:", {
          interventionId: intervention.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  } catch (error) {
    console.error("[Impulse] checkPendingInterventions error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * E. Stale Email Sync — log warning for accounts not synced in 2+ hours.
 */
async function checkStaleEmailSync(tenantId: string): Promise<ActionResult> {
  const result: ActionResult = {
    type: "email_stale_warning",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: stale, error } = await supabase
      .from("exo_email_accounts")
      .select("id, email_address, last_sync_at, sync_error")
      .eq("tenant_id", tenantId)
      .eq("sync_enabled", true)
      .lt("last_sync_at", twoHoursAgo);

    if (error) {
      console.error("[Impulse] Stale email sync query failed:", {
        tenantId,
        error: error.message,
      });
      return result;
    }

    if (!stale || stale.length === 0) return result;
    result.count = stale.length;

    // Log only — email-sync CRON handles actual sync
    for (const account of stale) {
      logger.warn("[Impulse] Stale email sync detected:", {
        tenantId,
        email: account.email_address,
        lastSync: account.last_sync_at,
        syncError: account.sync_error,
      });
    }
  } catch (error) {
    console.error("[Impulse] checkStaleEmailSync error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const totals = {
    tenantsProcessed: 0,
    tenantsSkippedQuiet: 0,
    actions: {
      overdue_reminder: 0,
      insight_delivery: 0,
      goal_warning: 0,
      intervention_execution: 0,
      email_stale_warning: 0,
    } as Record<string, number>,
    totalMessagesSent: 0,
    errors: [] as string[],
  };

  try {
    const tenants = await getActiveTenants();

    if (tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No active tenants",
        durationMs: Date.now() - startTime,
      });
    }

    for (const tenant of tenants) {
      // Safety: bail before Vercel timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        logger.warn("[Impulse] Approaching timeout, stopping early", {
          processed: totals.tenantsProcessed,
          remaining: tenants.length - totals.tenantsProcessed,
        });
        break;
      }

      // Skip quiet hours
      if (isQuietHours(tenant.timezone, tenant.iors_personality)) {
        totals.tenantsSkippedQuiet++;
        continue;
      }

      totals.tenantsProcessed++;

      try {
        let messagesThisCycle = 0;
        const canMessage = await canSendProactive(tenant.id);

        // A. Overdue Tasks
        const overdueResult = await checkOverdueTasks(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.overdue_reminder += overdueResult.count;
        messagesThisCycle += overdueResult.messagesSent;
        totals.totalMessagesSent += overdueResult.messagesSent;

        // B. Undelivered Insights
        const insightResult = await checkUndeliveredInsights(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.insight_delivery += insightResult.count;
        messagesThisCycle += insightResult.messagesSent;
        totals.totalMessagesSent += insightResult.messagesSent;

        // C. Goal Deadlines
        const goalResult = await checkGoalDeadlines(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.goal_warning += goalResult.count;
        messagesThisCycle += goalResult.messagesSent;
        totals.totalMessagesSent += goalResult.messagesSent;

        // D. Pending Approved Interventions
        const interventionResult = await checkPendingInterventions(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.intervention_execution += interventionResult.count;
        messagesThisCycle += interventionResult.messagesSent;
        totals.totalMessagesSent += interventionResult.messagesSent;

        // E. Stale Email Sync (no messages — log only)
        const emailResult = await checkStaleEmailSync(tenant.id);
        totals.actions.email_stale_warning += emailResult.count;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Impulse] Error processing tenant ${tenant.id}:`, {
          error: msg,
        });
        totals.errors.push(`${tenant.id}: ${msg}`);
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info("[Impulse] Cycle complete:", {
      ...totals,
      error_count: totals.errors.length,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs,
      ...totals,
      error_count: totals.errors.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Impulse] CRON fatal error:", { error: msg });
    return NextResponse.json(
      {
        error: "Impulse CRON failed",
        details: msg,
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "impulse" }, handler);
