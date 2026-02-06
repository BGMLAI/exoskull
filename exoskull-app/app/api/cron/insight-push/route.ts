/**
 * Daily Insight Push CRON
 *
 * Schedule: Every day at 10:00 UTC
 * Pushes top 1-3 cross-domain insights to each active tenant
 * via their preferred channel (telegram/whatsapp/slack/discord/sms/email).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron/auth";
import { pushInsightsForTenant } from "@/lib/insights/insight-pusher";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

  // Fetch all active tenants
  const { data: tenants, error: tenantsErr } = await supabase
    .from("exo_tenants")
    .select("id")
    .eq("subscription_status", "active");

  if (tenantsErr) {
    console.error("[InsightPush] Failed to fetch tenants:", {
      error: tenantsErr.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch tenants", details: tenantsErr.message },
      { status: 500 },
    );
  }

  const activeTenants = tenants || [];
  const results = {
    processed: 0,
    insights_pushed: 0,
    skipped_no_insights: 0,
    errors: [] as string[],
  };

  for (const tenant of activeTenants) {
    // Safety: bail before Vercel timeout
    if (Date.now() - startTime > 100_000) {
      console.warn("[InsightPush] Approaching timeout, stopping early", {
        processed: results.processed,
        remaining: activeTenants.length - results.processed,
      });
      break;
    }

    results.processed++;

    try {
      const pushResult = await pushInsightsForTenant(tenant.id);

      if (pushResult.insightsPushed > 0) {
        results.insights_pushed += pushResult.insightsPushed;
      } else if (pushResult.insightsFound === 0) {
        results.skipped_no_insights++;
      } else if (pushResult.error) {
        results.errors.push(`${tenant.id}: ${pushResult.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[InsightPush] Error for tenant ${tenant.id}:`, {
        error: msg,
      });
      results.errors.push(`${tenant.id}: ${msg}`);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log("[InsightPush] Completed:", {
    ...results,
    durationMs,
    error_count: results.errors.length,
  });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    results: {
      ...results,
      error_count: results.errors.length,
    },
  });
}
