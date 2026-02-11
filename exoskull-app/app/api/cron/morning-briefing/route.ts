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
import { ModelRouter } from "@/lib/ai/model-router";
import { logger } from "@/lib/logger";
import {
  getActiveTenants,
  isWithinHours,
  isQuietHours,
  sendProactiveMessage,
} from "@/lib/cron/tenant-utils";
import { canSendProactive } from "@/lib/autonomy/outbound-triggers";

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

        const [tasksRes, goalsRes, insightsRes, overnightRes] =
          await Promise.all([
            // Active tasks
            supabase
              .from("exo_tasks")
              .select("title, priority, due_date, status")
              .eq("tenant_id", tenant.id)
              .eq("status", "active")
              .order("priority", { ascending: false })
              .limit(10),

            // Active goals
            supabase
              .from("exo_goals")
              .select("title, progress, target_date")
              .eq("tenant_id", tenant.id)
              .eq("status", "active")
              .limit(5),

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
          ]);

        const tasks = tasksRes.data || [];
        const goals = goalsRes.data || [];
        const pendingInsights = insightsRes.data?.length || 0;
        const overnightActions = overnightRes.data || [];

        // Format briefing with AI (Tier 1 — Gemini Flash)
        const contextData = JSON.stringify({
          name: tenant.name || "User",
          tasks: tasks.map((t: any) => ({
            title: t.title,
            priority: t.priority,
            due: t.due_date,
          })),
          goals: goals.map((g: any) => ({
            title: g.title,
            progress: g.progress,
            deadline: g.target_date,
          })),
          pending_insights: pendingInsights,
          overnight_actions: overnightActions.length,
          language: tenant.language || "pl",
        });

        const response = await router.route({
          messages: [
            {
              role: "system",
              content: `You are IORS — the user's intelligent life assistant. Generate a concise morning briefing in ${tenant.language || "pl"} language. Be warm but direct. Use short sentences. Include priorities. Max 500 chars (SMS-friendly).`,
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
        console.error(`[MorningBriefing] Error for ${tenant.id}:`, error);
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
    console.error("[MorningBriefing] Fatal:", error);
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
