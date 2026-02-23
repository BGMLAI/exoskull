/**
 * Daily Summary CRON Handler
 *
 * Runs at 21:00 to:
 * - Generate daily summaries for all tenants (data lake — always created)
 * - NO fixed SMS send — communication is event-driven via goal-events
 *
 * Schedule: daily at 21:00 UTC (22:00/23:00 in Poland depending on DST)
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { verifyCronAuth } from "@/lib/cron/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  createDailySummary,
  getSummaryForDisplay,
  DailySummary,
} from "@/lib/memory/daily-summary";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Twilio config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

/**
 * Send SMS with daily summary
 */
async function sendSummarySmS(
  tenantId: string,
  phone: string,
  summaryText: string,
): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: "Twilio not configured" };
  }

  try {
    // Truncate if too long for SMS (160 chars per segment)
    const maxLength = 1500; // ~10 SMS segments
    let message = summaryText;
    if (message.length > maxLength) {
      message =
        message.slice(0, maxLength - 50) +
        "...\n\nOdpowiedz 'więcej' po resztę.";
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
              "base64",
            ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          From: TWILIO_PHONE_NUMBER,
          Body: message,
        }),
      },
    );

    const data = await response.json();

    if (response.ok && data.sid) {
      logger.info(`[DailySummaryCron] SMS sent to ${tenantId}: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      logger.error(`[DailySummaryCron] SMS failed for ${tenantId}:`, data);
      return { success: false, error: data.message || JSON.stringify(data) };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`[DailySummaryCron] SMS error for ${tenantId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get all active tenants with phone numbers
 */
async function getActiveTenants(): Promise<
  Array<{
    id: string;
    phone: string;
    name: string;
    timezone: string;
    schedule_settings: any;
  }>
> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_tenants")
    .select("id, phone, name, timezone, schedule_settings")
    .in("subscription_status", ["active", "trial"])
    .not("phone", "is", null);

  if (error) {
    logger.error("[DailySummaryCron] Failed to fetch tenants:", error);
    return [];
  }

  return data || [];
}

/**
 * Check if it's the right time for daily summary (around 21:00 in user's timezone)
 */
function isRightTimeForSummary(
  timezone: string,
  scheduleSettings: {
    quiet_hours?: { start?: string; end?: string };
    preferred_summary_time?: string;
  } | null,
): boolean {
  try {
    // Get current time in user's timezone
    const now = new Date();
    const userTime = new Date(
      now.toLocaleString("en-US", { timeZone: timezone || "Europe/Warsaw" }),
    );
    const hour = userTime.getHours();

    // Check quiet hours
    if (scheduleSettings?.quiet_hours) {
      const quietStart = parseInt(scheduleSettings.quiet_hours.start || "22");
      const quietEnd = parseInt(scheduleSettings.quiet_hours.end || "7");

      if (hour >= quietStart || hour < quietEnd) {
        return false; // In quiet hours
      }
    }

    // Check if near 21:00 (allow 20:00-22:00 window)
    return hour >= 20 && hour <= 22;
  } catch {
    // Default to yes if timezone parsing fails
    return true;
  }
}

/**
 * Check if user has had conversations today
 */
async function hasTodayConversations(tenantId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { count, error } = await supabase
    .from("exo_unified_messages")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", `${today}T00:00:00`);

  if (error) {
    logger.error("[DailySummaryCron] Failed to check conversations:", error);
    return false;
  }

  return (count || 0) > 0;
}

// ============================================================================
// GET HANDLER (for Vercel CRON)
// ============================================================================

async function getHandler(request: NextRequest) {
  const startTime = Date.now();

  logger.info("[DailySummaryCron] Starting daily summary generation...");

  const results = {
    processed: 0,
    summaries_created: 0,
    skipped_wrong_time: 0,
    errors: [] as string[],
  };

  try {
    const tenants = await getActiveTenants();
    logger.info(`[DailySummaryCron] Found ${tenants.length} active tenants`);

    for (const tenant of tenants) {
      results.processed++;

      try {
        // Check if right time in user's timezone
        if (!isRightTimeForSummary(tenant.timezone, tenant.schedule_settings)) {
          results.skipped_wrong_time++;
          continue;
        }

        // Generate summary for data lake (always — no SMS send)
        const summary = await createDailySummary(tenant.id);
        if (!summary) {
          results.errors.push(`${tenant.id}: Failed to create summary`);
          continue;
        }
        results.summaries_created++;

        // NO fixed SMS send — communication is event-driven via goal-events.
        // Daily summaries are stored in the data lake for analysis and
        // on-demand retrieval (user can ask "how was my day?").
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`${tenant.id}: ${errorMessage}`);
        logger.error(
          `[DailySummaryCron] Error processing tenant ${tenant.id}:`,
          error,
        );
      }
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      results,
    };

    logger.info("[DailySummaryCron] Completed:", response);
    return NextResponse.json(response);
  } catch (error) {
    logger.error("[DailySummaryCron] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        results,
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "daily-summary" }, getHandler);

// ============================================================================
// POST HANDLER (for manual triggers / specific tenant)
// ============================================================================

export const POST = withApiLog(async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Auth check
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { tenant_id, skip_sms } = body;

    if (!tenant_id) {
      return NextResponse.json(
        { error: "tenant_id is required" },
        { status: 400 },
      );
    }

    // Generate summary for specific tenant
    logger.info(`[DailySummaryCron] Manual trigger for tenant ${tenant_id}`);

    const summary = await createDailySummary(tenant_id);
    if (!summary) {
      return NextResponse.json(
        { error: "Failed to create summary" },
        { status: 500 },
      );
    }

    let smsResult = null;
    if (!skip_sms) {
      // Get tenant phone
      const supabase = getServiceSupabase();
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("phone")
        .eq("id", tenant_id)
        .single();

      if (tenant?.phone) {
        const displayText = await getSummaryForDisplay(tenant_id);
        if (displayText) {
          smsResult = await sendSummarySmS(
            tenant_id,
            tenant.phone,
            `📋 Podsumowanie dnia:\n\n${displayText}`,
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      summary: {
        id: summary.id,
        date: summary.summary_date,
        mood_score: summary.mood_score,
        energy_score: summary.energy_score,
        message_count: summary.message_count,
        key_topics: summary.key_topics,
      },
      sms: smsResult,
    });
  } catch (error) {
    logger.error("[DailySummaryCron] Manual trigger failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
