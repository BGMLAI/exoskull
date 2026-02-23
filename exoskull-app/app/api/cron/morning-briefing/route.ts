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

        // Generate daily goal actions SILENTLY (creates tasks, no SMS)
        try {
          if (Date.now() - startTime < TIMEOUT_MS - 20_000) {
            const dailyPlan = await planDailyActions(tenant.id);
            logger.info("[MorningBriefing] Daily actions planned silently:", {
              tenantId: tenant.id,
              tasksCreated: dailyPlan.tasksCreated,
              goalsProcessed: dailyPlan.goalsProcessed,
            });
          }
        } catch (err) {
          logger.warn("[MorningBriefing] Daily action planning failed:", {
            tenantId: tenant.id,
            error: err instanceof Error ? err.message : err,
          });
        }

        // Check if any goal is at-risk/off-track or has deadline today → only then notify
        const { data: urgentGoals } = await supabase
          .from("exo_user_goals")
          .select("name, trajectory, target_date")
          .eq("tenant_id", tenant.id)
          .eq("is_active", true)
          .or(
            `trajectory.in.(off_track,at_risk),target_date.eq.${new Date().toISOString().split("T")[0]}`,
          );

        if (urgentGoals && urgentGoals.length > 0) {
          // Send goal-relevant alert only
          const alertLines = urgentGoals.map((g: any) => {
            if (g.target_date === new Date().toISOString().split("T")[0]) {
              return `Dziś termin: "${g.name}"`;
            }
            return `"${g.name}" wymaga uwagi (${g.trajectory === "off_track" ? "wypadł z toru" : "zagrożony"})`;
          });

          await sendProactiveMessage(
            tenant.id,
            alertLines.join("\n"),
            "goal_morning_alert",
            "MorningBriefing",
          );
          results.briefings_sent++;
        }
        // No fixed morning SMS — daily actions created silently
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
      { error: "Morning briefing failed" },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "morning-briefing" }, handler);
