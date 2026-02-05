/**
 * Daily Summary CRON Handler
 *
 * Runs at 21:00 to:
 * - Generate daily summaries for all tenants
 * - Send summary via SMS with option to discuss/correct
 * - User can respond with corrections
 *
 * Schedule: daily at 21:00 UTC (22:00/23:00 in Poland depending on DST)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron/auth";
import {
  createDailySummary,
  getSummaryForDisplay,
  DailySummary,
} from "@/lib/memory/daily-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow 60 seconds for processing all tenants

// Admin client
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// Twilio config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+48732143210";

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
      console.log(`[DailySummaryCron] SMS sent to ${tenantId}: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      console.error(`[DailySummaryCron] SMS failed for ${tenantId}:`, data);
      return { success: false, error: data.message || JSON.stringify(data) };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[DailySummaryCron] SMS error for ${tenantId}:`,
      errorMessage,
    );
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
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("exo_tenants")
    .select("id, phone, name, timezone, schedule_settings")
    .eq("status", "active")
    .not("phone", "is", null);

  if (error) {
    console.error("[DailySummaryCron] Failed to fetch tenants:", error);
    return [];
  }

  return data || [];
}

/**
 * Check if it's the right time for daily summary (around 21:00 in user's timezone)
 */
function isRightTimeForSummary(
  timezone: string,
  scheduleSettings: any,
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
  const supabase = getAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { count, error } = await supabase
    .from("exo_unified_messages")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", `${today}T00:00:00`);

  if (error) {
    console.error("[DailySummaryCron] Failed to check conversations:", error);
    return false;
  }

  return (count || 0) > 0;
}

// ============================================================================
// GET HANDLER (for Vercel CRON)
// ============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Auth check
  if (!verifyCronAuth(request)) {
    console.warn("[DailySummaryCron] Unauthorized attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[DailySummaryCron] Starting daily summary generation...");

  const results = {
    processed: 0,
    summaries_created: 0,
    sms_sent: 0,
    skipped_no_conversations: 0,
    skipped_wrong_time: 0,
    errors: [] as string[],
  };

  try {
    const tenants = await getActiveTenants();
    console.log(`[DailySummaryCron] Found ${tenants.length} active tenants`);

    for (const tenant of tenants) {
      results.processed++;

      try {
        // Check if right time in user's timezone
        if (!isRightTimeForSummary(tenant.timezone, tenant.schedule_settings)) {
          results.skipped_wrong_time++;
          continue;
        }

        // Check if user had conversations today
        const hasConversations = await hasTodayConversations(tenant.id);
        if (!hasConversations) {
          results.skipped_no_conversations++;
          continue;
        }

        // Generate summary
        const summary = await createDailySummary(tenant.id);
        if (!summary) {
          results.errors.push(`${tenant.id}: Failed to create summary`);
          continue;
        }
        results.summaries_created++;

        // Get formatted text for SMS
        const displayText = await getSummaryForDisplay(tenant.id);
        if (!displayText) {
          results.errors.push(`${tenant.id}: Failed to format summary`);
          continue;
        }

        // Prepare SMS message
        const smsMessage = `📋 Podsumowanie dnia:\n\n${displayText}\n\n💬 Odpowiedz żeby dodać korekty lub napisz "zadzwoń" żeby porozmawiać.`;

        // Send SMS
        const smsResult = await sendSummarySmS(
          tenant.id,
          tenant.phone,
          smsMessage,
        );

        if (smsResult.success) {
          results.sms_sent++;
        } else {
          results.errors.push(`${tenant.id}: SMS failed - ${smsResult.error}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`${tenant.id}: ${errorMessage}`);
        console.error(
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

    console.log("[DailySummaryCron] Completed:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[DailySummaryCron] Fatal error:", error);
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

// ============================================================================
// POST HANDLER (for manual triggers / specific tenant)
// ============================================================================

export async function POST(request: NextRequest) {
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
    console.log(`[DailySummaryCron] Manual trigger for tenant ${tenant_id}`);

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
      const supabase = getAdminClient();
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
    console.error("[DailySummaryCron] Manual trigger failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
