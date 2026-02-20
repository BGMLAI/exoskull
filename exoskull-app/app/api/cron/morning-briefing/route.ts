/**
 * Morning Briefing CRON
 *
 * Runs at 05:00 UTC to send personalized morning briefings:
 * - Today's tasks and priorities
 * - Pending items from yesterday
 * - Goals progress snapshot
 * - Any overnight autonomous actions
 *
 * Schedule: 0 5 * * * (05:00 UTC = 06:00/07:00 CET/CEST)
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getTasks } from "@/lib/tasks/task-service";
import { getGoals } from "@/lib/goals/goal-service";
import { ModelRouter } from "@/lib/ai/model-router";
import { logger } from "@/lib/logger";
import {
  getActiveTenants,
  isWithinHours,
  isQuietHours,
  sendProactiveMessage,
} from "@/lib/cron/tenant-utils";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";
import { planDailyActions } from "@/lib/goals/daily-action-planner";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { createGoogleClient } from "@/lib/rigs/google/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 50_000;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const router = new ModelRouter();

  const results = {
    processed: 0,
    briefings_sent: 0,
    skipped_wrong_time: 0,
    skipped_quiet_hours: 0,
    skipped_rate_limit: 0,
    errors: [] as string[],
  };

  try {
    const tenants = await getActiveTenants();
    logger.info(`[MorningBriefing] Found ${tenants.length} tenants`);

    for (const tenant of tenants) {
      if (Date.now() - startTime > TIMEOUT_MS) break;
      results.processed++;

      try {
        // Check if 6:00-9:00 in their timezone
        if (!isWithinHours(tenant.timezone, 6, 9)) {
          results.skipped_wrong_time++;
          continue;
        }

        // Check quiet hours
        if (isQuietHours(tenant.timezone, tenant.iors_personality)) {
          results.skipped_quiet_hours++;
          continue;
        }

        // Check rate limit
        if (!(await canSendProactive(tenant.id))) {
          results.skipped_rate_limit++;
          continue;
        }

        // Gather morning data
        const supabase = getServiceSupabase();

        const [
          tasksRes,
          goalsRes,
          insightsRes,
          overnightRes,
          googleRes,
          healthRes,
        ] = await Promise.all([
          // Active tasks
          getTasks(tenant.id, { status: "pending", limit: 10 })
            .then((tasks) => ({ data: tasks, error: null }))
            .catch((e) => ({ data: null, error: e })),

          // Active goals (via dual-read service)
          getGoals(tenant.id, { is_active: true, limit: 5 })
            .then((goals) => ({ data: goals, error: null }))
            .catch((e) => ({ data: null, error: e })),

          // Undelivered insights
          supabase
            .from("exo_insight_deliveries")
            .select("id")
            .eq("tenant_id", tenant.id)
            .is("delivered_at", null),

          // Overnight autonomous actions
          supabase
            .from("exo_proactive_log")
            .select("trigger_type, channel, created_at")
            .eq("tenant_id", tenant.id)
            .gte(
              "created_at",
              new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            )
            .order("created_at", { ascending: false })
            .limit(5),

          // Google Calendar + Gmail (graceful — returns null if no connection)
          (async () => {
            try {
              const { data: conn } = await supabase
                .from("exo_rig_connections")
                .select("*")
                .eq("tenant_id", tenant.id)
                .eq("rig_slug", "google")
                .not("refresh_token", "is", null)
                .maybeSingle();
              if (!conn) return null;
              const freshToken = await ensureFreshToken(conn);
              if (freshToken !== conn.access_token)
                conn.access_token = freshToken;
              const client = createGoogleClient(conn);
              if (!client) return null;
              const [events, gmail] = await Promise.all([
                client.calendar.getTodaysEvents().catch(() => []),
                client.gmail.getUnreadCount().catch(() => 0),
              ]);
              return { events, unreadEmails: gmail };
            } catch {
              return null;
            }
          })(),

          // Yesterday's health metrics from DB (already synced by rig-sync CRON)
          supabase
            .from("exo_health_metrics")
            .select("metric_type, value, unit")
            .eq("tenant_id", tenant.id)
            .eq("source", "google")
            .gte(
              "recorded_at",
              new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            )
            .order("recorded_at", { ascending: false })
            .limit(20),
        ]);

        const tasks = tasksRes.data || [];
        const goals = goalsRes.data || [];
        const pendingInsights = insightsRes.data?.length || 0;
        const overnightActions = overnightRes.data || [];
        const googleData = googleRes;
        const healthMetrics = healthRes.data || [];

        // Generate daily goal actions (creates tasks + returns briefing section)
        let dailyActionsBriefing = "";
        try {
          if (Date.now() - startTime < TIMEOUT_MS - 20_000) {
            const dailyPlan = await planDailyActions(tenant.id);
            dailyActionsBriefing = dailyPlan.briefingSection;
          }
        } catch (err) {
          logger.warn("[MorningBriefing] Daily action planning failed:", {
            tenantId: tenant.id,
            error: err instanceof Error ? err.message : err,
          });
        }

        // Build health summary from metrics
        const healthSummary: Record<string, { value: number; unit: string }> =
          {};
        for (const m of healthMetrics) {
          if (!healthSummary[m.metric_type]) {
            healthSummary[m.metric_type] = { value: m.value, unit: m.unit };
          }
        }

        // Format briefing with AI (Tier 1 — Gemini Flash)
        const contextData = JSON.stringify({
          name: tenant.name || "User",
          tasks: tasks.map((t: any) => ({
            title: t.title,
            priority: t.priority,
            due: t.due_date,
          })),
          goals: goals.map((g: any) => ({
            title: g.name || g.title,
            deadline: g.target_date,
          })),
          pending_insights: pendingInsights,
          overnight_actions: overnightActions.length,
          calendar:
            googleData?.events?.map((e: any) => ({
              time: e.start?.dateTime || e.start?.date,
              title: e.summary,
            })) || [],
          unread_emails: googleData?.unreadEmails || 0,
          health: {
            steps: healthSummary.steps?.value || null,
            heart_rate: healthSummary.heart_rate?.value || null,
            sleep_min: healthSummary.sleep?.value || null,
            calories: healthSummary.calories?.value || null,
          },
          goal_actions: dailyActionsBriefing || null,
          language: tenant.language || "pl",
        });

        const response = await router.route({
          messages: [
            {
              role: "system",
              content: `You are IORS — the user's intelligent life assistant. Generate a concise morning briefing in ${tenant.language || "pl"} language. Be warm but direct. Use short sentences. Include: today's calendar, health summary (steps/sleep/HR if available), top priorities, unread emails count. If goal_actions are provided, include them as "Dziś dla celów:" section. Max 600 chars (SMS-friendly).`,
            },
            {
              role: "user",
              content: `Generate morning briefing based on:\n${contextData}`,
            },
          ],
          taskCategory: "simple_response",
          tenantId: tenant.id,
          maxTokens: 300,
          temperature: 0.5,
        });

        const briefingMessage = response.content.trim();

        // Send via preferred channel
        const sendResult = await sendProactiveMessage(
          tenant.id,
          briefingMessage,
          "morning_briefing",
          "MorningBriefing",
        );

        if (sendResult.success) {
          results.briefings_sent++;
        } else {
          results.errors.push(`${tenant.id}: dispatch failed`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown";
        results.errors.push(`${tenant.id}: ${msg}`);
        logger.error(`[MorningBriefing] Error for ${tenant.id}:`, error);
      }
    }

    logger.info("[MorningBriefing] Complete:", {
      ...results,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      ok: true,
      ...results,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error("[MorningBriefing] Fatal:", error);
    return NextResponse.json(
      {
        error: "Morning briefing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "morning-briefing" }, handler);
