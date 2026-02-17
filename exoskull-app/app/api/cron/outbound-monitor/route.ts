/**
 * Outbound Monitor CRON
 *
 * Runs every 2 hours to:
 * 1. Process escalation chains (SMS → Call → Emergency upgrades)
 * 2. Detect negative emotion trends → wellness check-in
 * 3. Detect inactivity → "are you ok?" message
 *
 * Rate limited: max 2 proactive per day per tenant (crisis exempt).
 * Schedule: every 2 hours (Vercel cron)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service-client";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { processEscalations } from "@/lib/autonomy/escalation-manager";
import { logger } from "@/lib/logger";
import {
  detectInactivity,
  handleInactivityTrigger,
  detectEmotionTrend,
  handleEmotionTrendTrigger,
} from "@/lib/autonomy/outbound-triggers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  const results = {
    escalations: { checked: 0, escalated: 0, cancelled: 0 },
    emotionTriggers: 0,
    inactivityTriggers: 0,
    tenantsChecked: 0,
    errors: 0,
  };

  try {
    // Step 1: Process escalation chains
    results.escalations = await processEscalations();

    // Step 2: Get all active tenants
    const supabase = createServiceClient();
    const { data: tenants } = await supabase
      .from("exo_tenants")
      .select("id, phone")
      .not("phone", "is", null);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        ok: true,
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    // Step 3: Check each tenant for triggers
    for (const tenant of tenants) {
      results.tenantsChecked++;

      try {
        // A. Negative emotion trend (3+ negative in 24h)
        const trend = await detectEmotionTrend(tenant.id, 24);
        if (trend.concerning && trend.negativeCount >= 3) {
          const triggered = await handleEmotionTrendTrigger(tenant.id);
          if (triggered) {
            results.emotionTriggers++;
            continue; // One trigger per tenant per cycle
          }
        }

        // B. Inactivity (48h+ no messages)
        const inactivity = await detectInactivity(tenant.id, 48);
        if (inactivity.inactive) {
          const triggered = await handleInactivityTrigger(tenant.id);
          if (triggered) {
            results.inactivityTriggers++;
          }
        }
      } catch (error) {
        results.errors++;
        logger.error(
          `[OutboundMonitor] Error checking tenant ${tenant.id}:`,
          error,
        );
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[OutboundMonitor] CRON complete:", {
      ...results,
      durationMs: duration,
    });

    return NextResponse.json({
      ok: true,
      ...results,
      durationMs: duration,
    });
  } catch (error) {
    logger.error("[OutboundMonitor] CRON error:", error);
    return NextResponse.json(
      {
        error: "Outbound monitor failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "outbound-monitor" }, handler);
