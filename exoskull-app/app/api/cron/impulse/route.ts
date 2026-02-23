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
 * F. System development suggestions → gap detection + proactive coaching
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
import { generateApp } from "@/lib/apps/generator/app-generator";
import {
  getOverdueTasks,
  getTasks,
  createTask,
} from "@/lib/tasks/task-service";
import { getActiveGoalCount, createGoal } from "@/lib/goals/goal-service";

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
 * 0. Goals Off-Track — highest priority. Alert user about goals that are off-track.
 */
async function checkGoalsOffTrack(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "goal_off_track",
    count: 0,
    messagesSent: 0,
  };

  try {
    const supabase = getServiceSupabase();
    const { data: offTrack } = await supabase
      .from("exo_user_goals")
      .select("id, name, trajectory, current_value, target_value, target_date")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("trajectory", "off_track")
      .limit(5);

    if (!offTrack || offTrack.length === 0) return result;
    result.count = offTrack.length;

    if (!canMessage) return result;

    const goalList = offTrack
      .map((g) => {
        const progress = g.target_value
          ? Math.round(((g.current_value || 0) / g.target_value) * 100)
          : 0;
        return `- ${g.name} (${progress}%)`;
      })
      .join("\n");

    const message =
      offTrack.length === 1
        ? `Cel "${offTrack[0].name}" wypadl z toru. Chcesz omowic nowa strategie?`
        : `${offTrack.length} celow wymaga uwagi:\n${goalList}\n\nChcesz omowic plan naprawczy?`;

    const sent = await sendProactiveMessage(
      tenantId,
      message,
      "goal_off_track",
      "impulse",
    );
    if (sent.success) result.messagesSent = 1;
  } catch (error) {
    logger.error("[Impulse] checkGoalsOffTrack error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * A. Overdue Tasks — remind user about tasks past due date (prioritize goal-related tasks).
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
    const overdue = await getOverdueTasks(tenantId, 5);

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
    logger.error("[Impulse] checkOverdueTasks error:", {
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
    logger.error("[Impulse] checkUndeliveredInsights error:", {
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
      logger.error("[Impulse] Goal deadlines query failed:", {
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
    logger.error("[Impulse] checkGoalDeadlines error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

// Step D (checkPendingInterventions) REMOVED — intervention-executor CRON
// already handles approved interventions every 15 min. Having both caused
// double-execution and duplicate proactive messages.

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
      logger.error("[Impulse] Stale email sync query failed:", {
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
    logger.error("[Impulse] checkStaleEmailSync error:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
  }

  return result;
}

/**
 * F. System Auto-Builder — detects gaps in user's setup, BUILDS solutions, and deploys them.
 *    Instead of suggesting "would you like X?" — actually CREATES apps, goals, tasks.
 *    Dedup: max 1 build action per gap type per 14 days (via exo_proactive_log).
 */

type GapAction =
  | { mode: "build_app"; description: string; doneMessage: string }
  | { mode: "create_goals"; doneMessage: string }
  | {
      mode: "create_task";
      title: string;
      description: string;
      doneMessage: string;
    }
  | { mode: "suggest"; message: string };

interface GapCheck {
  id: string;
  query: () => Promise<boolean>;
  action: GapAction;
}

async function checkSystemDevelopment(
  tenantId: string,
  canMessage: boolean,
): Promise<ActionResult> {
  const result: ActionResult = {
    type: "system_suggestion",
    count: 0,
    messagesSent: 0,
  };

  if (!canMessage) return result;

  try {
    const supabase = getServiceSupabase();

    // Check which auto-builds were already done in the last 14 days
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentActions } = await supabase
      .from("exo_proactive_log")
      .select("trigger_type")
      .eq("tenant_id", tenantId)
      .like("trigger_type", "auto_build:%")
      .gte("created_at", fourteenDaysAgo);

    const alreadyBuilt = new Set(
      (recentActions || []).map((s: { trigger_type: string }) =>
        s.trigger_type.replace("auto_build:", ""),
      ),
    );

    // Also check 7-day dedup for suggestions (things we can't auto-build)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentSuggestions } = await supabase
      .from("exo_proactive_log")
      .select("trigger_type")
      .eq("tenant_id", tenantId)
      .like("trigger_type", "system_suggestion:%")
      .gte("created_at", sevenDaysAgo);

    const alreadySuggested = new Set(
      (recentSuggestions || []).map((s: { trigger_type: string }) =>
        s.trigger_type.replace("system_suggestion:", ""),
      ),
    );

    // Gap definitions — ordered by impact. auto-build where possible, suggest where not.
    const gaps: GapCheck[] = [
      {
        id: "mood_tracker_app",
        query: async () => {
          // No mood tracker app AND no mood data
          const [{ count: appCount }, { count: moodCount }] = await Promise.all(
            [
              supabase
                .from("exo_generated_apps")
                .select("*", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .ilike("slug", "%mood%"),
              supabase
                .from("exo_daily_summaries")
                .select("*", { count: "exact", head: true })
                .eq("tenant_id", tenantId)
                .not("mood_score", "is", null)
                .gte(
                  "created_at",
                  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                ),
            ],
          );
          return (appCount || 0) === 0 && (moodCount || 0) < 3;
        },
        action: {
          mode: "build_app",
          description:
            "Tracker Nastroju i Energii. Pola: nastroj (rating 1-10), energia (rating 1-10), sen_godziny (number), notatka (text), data (date). Chart: line chart nastrojow w czasie.",
          doneMessage:
            "Zbudowalem dla Ciebie Tracker Nastroju i Energii! Jest juz na Twoim dashboardzie. Mozesz logowac swoj nastroj, energie i sen — a ja bede wylapywal wzorce.",
        },
      },
      {
        id: "habit_tracker_app",
        query: async () => {
          const { count } = await supabase
            .from("exo_generated_apps")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .ilike("slug", "%habit%");
          return (count || 0) === 0;
        },
        action: {
          mode: "build_app",
          description:
            "Tracker Nawykow. Pola: nazwa_nawyku (text), wykonano (boolean), data (date), notatka (text). Ikona: check-circle. Summary: count wykonanych dzis.",
          doneMessage:
            "Zbudowalem Tracker Nawykow — jest na dashboardzie! Dodaj nawyki ktore chcesz sledzic. Bede Ci przypominac codziennie.",
        },
      },
      {
        id: "starter_goals",
        query: async () => {
          const count = await getActiveGoalCount(tenantId);
          return count === 0;
        },
        action: {
          mode: "create_goals",
          doneMessage:
            "Stworzylem 3 startowe cele dla Ciebie — zdrowie, produktywnosc i rozwoj. Mozesz je zobaczyc na dashboardzie w sekcji Cele i dostosowac do swoich potrzeb.",
        },
      },
      {
        id: "expense_tracker_app",
        query: async () => {
          const { count } = await supabase
            .from("exo_generated_apps")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .or(
              "slug.ilike.%expense%,slug.ilike.%budget%,slug.ilike.%finance%",
            );
          return (count || 0) === 0;
        },
        action: {
          mode: "build_app",
          description:
            "Tracker Wydatkow. Pola: kwota (numeric), kategoria (select: jedzenie, transport, rozrywka, rachunki, zakupy, zdrowie, inne), opis (text), data (date). Chart: bar chart wydatkow po kategoriach. Summary: sum kwot z tego miesiaca.",
          doneMessage:
            "Zbudowalem Tracker Wydatkow — jest na dashboardzie! Loguj wydatki a ja bede analizowal wzorce i ostrzegal gdy przekroczysz budzet.",
        },
      },
      {
        id: "onboard_task",
        query: async () => {
          const existingTasks = await getTasks(tenantId, { limit: 1 });
          return existingTasks.length === 0;
        },
        action: {
          mode: "create_task",
          title: "Poznaj swoj ExoSkull dashboard",
          description:
            "Wejdz na dashboard i sprawdz dostepne widgety: nastroj, nawyki, cele, wydatki. Wszystko mozesz dostosowac.",
          doneMessage:
            "Stworzylem Twoj pierwszy task: 'Poznaj swoj ExoSkull dashboard'. Sprawdz go w zakladce Taski!",
        },
      },
      // Things that need user input — suggest only
      {
        id: "no_email",
        query: async () => {
          const { count } = await supabase
            .from("exo_email_accounts")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("sync_enabled", true);
          return (count || 0) === 0;
        },
        action: {
          mode: "suggest",
          message:
            "Nie masz podlaczonego maila. Moge analizowac Twoje maile, wyciagac taski i follow-upy. Wejdz w Ustawienia > Integracje zeby podlaczyc Gmail.",
        },
      },
      {
        id: "no_knowledge",
        query: async () => {
          const { count } = await supabase
            .from("exo_document_chunks")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId);
          return (count || 0) === 0;
        },
        action: {
          mode: "suggest",
          message:
            "Twoja baza wiedzy jest pusta. Wgraj dokumenty przez dashboard (Wiedza > Upload) albo po prostu przeslij mi tekst — zapamietam wszystko.",
        },
      },
    ];

    // Process gaps — stop at first hit that wasn't recently handled
    for (const gap of gaps) {
      const dedupKey = gap.action.mode === "suggest" ? gap.id : gap.id;
      const dedupSet =
        gap.action.mode === "suggest" ? alreadySuggested : alreadyBuilt;

      if (dedupSet.has(dedupKey)) continue;

      try {
        const hasGap = await gap.query();
        if (!hasGap) continue;

        result.count = 1;
        const action = gap.action;
        let message: string;
        let triggerType: string;

        if (action.mode === "build_app") {
          // ACTUALLY BUILD THE APP
          logger.info("[Impulse] Auto-building app:", {
            tenantId,
            gapId: gap.id,
          });

          const appResult = await generateApp({
            tenant_id: tenantId,
            description: action.description,
            source: "iors_suggestion",
          });

          if (!appResult.success) {
            logger.error("[Impulse] App build failed:", {
              tenantId,
              gapId: gap.id,
              error: appResult.error,
            });
            continue; // Try next gap
          }

          message = action.doneMessage;
          triggerType = `auto_build:${gap.id}`;

          logger.info("[Impulse] App auto-built successfully:", {
            tenantId,
            gapId: gap.id,
            appSlug: appResult.app?.slug,
          });
        } else if (action.mode === "create_goals") {
          // CREATE STARTER GOALS (via dual-write service)
          const thirtyDaysFromNow = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split("T")[0];
          const today = new Date().toISOString().split("T")[0];

          const starterGoals = [
            {
              name: "Regularny sen 7-8h",
              category: "health" as const,
              description: "Cel startowy — zadbaj o regeneracje",
              target_type: "numeric" as const,
              target_value: 7.5,
              target_unit: "godzin",
              frequency: "daily" as const,
              direction: "increase" as const,
              start_date: today,
              target_date: thirtyDaysFromNow,
              is_active: true,
              wellbeing_weight: 2.0,
            },
            {
              name: "30 minut ruchu dziennie",
              category: "health" as const,
              description: "Cel startowy — aktywnosc fizyczna",
              target_type: "numeric" as const,
              target_value: 30,
              target_unit: "minut",
              frequency: "daily" as const,
              direction: "increase" as const,
              start_date: today,
              target_date: thirtyDaysFromNow,
              is_active: true,
              wellbeing_weight: 1.5,
            },
            {
              name: "Nauka nowej umiejetnosci",
              category: "learning" as const,
              description: "Cel startowy — rozwoj osobisty",
              target_type: "frequency" as const,
              target_value: 3,
              target_unit: "sesji/tydzien",
              frequency: "weekly" as const,
              direction: "increase" as const,
              start_date: today,
              target_date: thirtyDaysFromNow,
              is_active: true,
              wellbeing_weight: 1.0,
            },
          ];

          let goalsCreated = 0;
          for (const goalInput of starterGoals) {
            const goalResult = await createGoal(tenantId, goalInput);
            if (goalResult.id) goalsCreated++;
          }

          if (goalsCreated === 0) {
            logger.error("[Impulse] Goals creation failed:", { tenantId });
            continue;
          }

          message = action.doneMessage;
          triggerType = `auto_build:${gap.id}`;
        } else if (action.mode === "create_task") {
          // CREATE A TASK (via dual-write service)
          const taskResult = await createTask(tenantId, {
            title: action.title,
            description: action.description,
            status: "pending",
            priority: 3,
            due_date: new Date(
              Date.now() + 3 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            context: { source: "impulse_auto_build" },
          });

          if (!taskResult.id) {
            logger.error("[Impulse] Task creation failed:", {
              tenantId,
              error: taskResult.error,
            });
            continue;
          }

          message = action.doneMessage;
          triggerType = `auto_build:${gap.id}`;
        } else {
          // SUGGEST (things needing user input)
          message = action.message;
          triggerType = `system_suggestion:${gap.id}`;
        }

        // Send notification about what was built/suggested
        const sent = await sendProactiveMessage(
          tenantId,
          message,
          triggerType,
          "impulse",
        );

        if (sent.success) {
          result.messagesSent = 1;
          logger.info("[Impulse] Auto-build action completed:", {
            tenantId,
            gapId: gap.id,
            mode: action.mode,
          });
        }

        // One action per cycle per tenant
        break;
      } catch (err) {
        logger.error("[Impulse] Gap action failed:", {
          tenantId,
          gapId: gap.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  } catch (error) {
    logger.error("[Impulse] checkSystemDevelopment error:", {
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
      goal_off_track: 0,
      overdue_reminder: 0,
      insight_delivery: 0,
      goal_warning: 0,
      intervention_execution: 0,
      email_stale_warning: 0,
      system_suggestion: 0,
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

        // 0. Goals Off-Track (HIGHEST PRIORITY)
        const offTrackResult = await checkGoalsOffTrack(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.goal_off_track += offTrackResult.count;
        messagesThisCycle += offTrackResult.messagesSent;
        totals.totalMessagesSent += offTrackResult.messagesSent;

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

        // D. (removed — intervention-executor CRON handles this)

        // E. Stale Email Sync (no messages — log only)
        const emailResult = await checkStaleEmailSync(tenant.id);
        totals.actions.email_stale_warning += emailResult.count;

        // F. System Development Suggestions (1 suggestion per cycle)
        const suggestResult = await checkSystemDevelopment(
          tenant.id,
          canMessage && messagesThisCycle < MAX_ACTIONS_PER_TENANT,
        );
        totals.actions.system_suggestion += suggestResult.count;
        messagesThisCycle += suggestResult.messagesSent;
        totals.totalMessagesSent += suggestResult.messagesSent;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[Impulse] Error processing tenant ${tenant.id}:`, {
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
    logger.error("[Impulse] CRON fatal error:", { error: msg });
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
