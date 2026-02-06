/**
 * PULSE (Impulse) API
 *
 * Batched periodic checks across all connected Rigs.
 * Called by CRON every 30 minutes OR manually triggered.
 *
 * Checks: health, tasks, calendar, social
 * Returns insights or PULSE_OK if nothing needs attention.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRigDefinition } from "@/lib/rigs";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Check types
type CheckType = "health" | "tasks" | "calendar" | "social" | "finance";

interface PulseAlert {
  type: string;
  message: string;
  priority: "low" | "medium" | "high" | "critical";
  source: CheckType;
  data?: Record<string, unknown>;
}

interface PulseResult {
  status: "PULSE_OK" | "PULSE_ALERT";
  alerts: PulseAlert[];
  checksPerformed: CheckType[];
  duration_ms: number;
}

// ============================================================================
// CRON HANDLER (GET)
// ============================================================================

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // Verify CRON secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[PULSE] CRON triggered - running batch check for all users");

  try {
    // Get all users with impulse enabled
    const { data: users, error } = await supabase
      .from("user_impulse_state")
      .select(
        "user_id, enabled_checks, impulse_interval_minutes, last_impulse_at",
      )
      .or(
        `last_impulse_at.is.null,last_impulse_at.lt.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`,
      );

    if (error) {
      console.error("[PULSE] Error fetching users:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const results: { userId: string; result: PulseResult }[] = [];

    for (const user of users || []) {
      try {
        const result = await runPulseForUser(
          user.user_id,
          user.enabled_checks || ["health", "tasks", "calendar"],
        );
        results.push({ userId: user.user_id, result });

        // Store pending alerts
        if (result.alerts.length > 0) {
          await supabase
            .from("user_impulse_state")
            .update({
              pending_alerts: result.alerts,
              last_impulse_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.user_id);
        } else {
          await supabase
            .from("user_impulse_state")
            .update({
              last_impulse_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.user_id);
        }
      } catch (err) {
        console.error(`[PULSE] Error for user ${user.user_id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      usersChecked: results.length,
      totalAlerts: results.reduce((sum, r) => sum + r.result.alerts.length, 0),
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[PULSE] CRON error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// MANUAL TRIGGER (POST)
// ============================================================================

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      checks?: CheckType[];
    };

    // Verify auth: service role (internal) or user JWT
    const authHeader = request.headers.get("authorization");
    const isServiceRole =
      authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

    let userId: string;

    if (isServiceRole) {
      // Internal call — trust userId from body
      if (!body.userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      userId = body.userId;
    } else {
      // User call — verify JWT and use authenticated user ID
      const auth = await verifyTenantAuth(request);
      if (!auth.ok) return auth.response;
      userId = auth.tenantId;
    }

    const enabledChecks = body.checks || ["health", "tasks", "calendar"];
    const result = await runPulseForUser(userId, enabledChecks);

    // Update state
    await supabase.from("user_impulse_state").upsert({
      user_id: userId,
      last_impulse_at: new Date().toISOString(),
      pending_alerts: result.alerts,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ...result,
      duration_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[PULSE] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// PULSE LOGIC
// ============================================================================

async function runPulseForUser(
  userId: string,
  enabledChecks: CheckType[],
): Promise<PulseResult> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];
  const checksPerformed: CheckType[] = [];
  const startTime = Date.now();

  // Get user's connected rigs
  const { data: connections } = await supabase
    .from("exo_rig_connections")
    .select("rig_slug, status, last_sync_at")
    .eq("tenant_id", userId)
    .eq("status", "active");

  const connectedRigs = connections?.map((c) => c.rig_slug) || [];

  // Run each enabled check
  for (const check of enabledChecks) {
    try {
      const checkAlerts = await runCheck(userId, check, connectedRigs);
      alerts.push(...checkAlerts);
      checksPerformed.push(check);
    } catch (err) {
      console.error(`[PULSE] Check ${check} failed for ${userId}:`, err);
    }
  }

  return {
    status: alerts.length > 0 ? "PULSE_ALERT" : "PULSE_OK",
    alerts,
    checksPerformed,
    duration_ms: Date.now() - startTime,
  };
}

async function runCheck(
  userId: string,
  check: CheckType,
  connectedRigs: string[],
): Promise<PulseAlert[]> {
  switch (check) {
    case "health":
      return runHealthCheck(userId, connectedRigs);
    case "tasks":
      return runTasksCheck(userId);
    case "calendar":
      return runCalendarCheck(userId, connectedRigs);
    case "social":
      return runSocialCheck(userId);
    case "finance":
      return runFinanceCheck(userId, connectedRigs);
    default:
      return [];
  }
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

async function runHealthCheck(
  userId: string,
  connectedRigs: string[],
): Promise<PulseAlert[]> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];

  // Check sleep data from health rigs
  const healthRigs = connectedRigs.filter((r) =>
    ["oura", "fitbit", "google-fit", "apple-health"].includes(r),
  );

  if (healthRigs.length === 0) {
    return alerts; // No health rigs connected
  }

  // Query recent sleep data
  const { data: sleepData } = await supabase
    .from("exo_health_metrics")
    .select("metric_type, value, recorded_at")
    .eq("tenant_id", userId)
    .eq("metric_type", "sleep_duration")
    .gte(
      "recorded_at",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .order("recorded_at", { ascending: false })
    .limit(7);

  if (sleepData && sleepData.length >= 3) {
    const avgSleep =
      sleepData.reduce((sum, d) => sum + (d.value as number), 0) /
      sleepData.length;

    // Sleep debt alert (< 6 hours average)
    if (avgSleep < 6) {
      alerts.push({
        type: "sleep_debt",
        message: `Średni sen w ostatnich dniach: ${avgSleep.toFixed(1)}h. Potrzebujesz odpoczynku.`,
        priority: avgSleep < 5 ? "high" : "medium",
        source: "health",
        data: { avgSleep, days: sleepData.length },
      });
    }
  }

  // Check HRV if available
  const { data: hrvData } = await supabase
    .from("exo_health_metrics")
    .select("value")
    .eq("tenant_id", userId)
    .eq("metric_type", "hrv")
    .gte(
      "recorded_at",
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    )
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (hrvData && (hrvData.value as number) < 30) {
    alerts.push({
      type: "low_hrv",
      message: `HRV poniżej normy (${hrvData.value}ms). Rozważ lżejszy dzień.`,
      priority: "medium",
      source: "health",
      data: { hrv: hrvData.value },
    });
  }

  return alerts;
}

async function runTasksCheck(userId: string): Promise<PulseAlert[]> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];
  const now = new Date();

  // Check overdue tasks
  const { data: overdueTasks, count: overdueCount } = await supabase
    .from("exo_tasks")
    .select("id, title, due_date, priority", { count: "exact" })
    .eq("tenant_id", userId)
    .eq("status", "pending")
    .lt("due_date", now.toISOString())
    .limit(5);

  if (overdueCount && overdueCount > 0) {
    const highPriority =
      overdueTasks?.filter((t) => t.priority === "high").length || 0;

    alerts.push({
      type: "overdue_tasks",
      message: `Masz ${overdueCount} zaległych zadań${highPriority > 0 ? ` (${highPriority} pilnych)` : ""}.`,
      priority: highPriority > 0 ? "high" : "medium",
      source: "tasks",
      data: {
        count: overdueCount,
        highPriority,
        tasks: overdueTasks?.slice(0, 3).map((t) => t.title),
      },
    });
  }

  // Check tasks due today
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const { count: dueTodayCount } = await supabase
    .from("exo_tasks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", userId)
    .eq("status", "pending")
    .gte("due_date", now.toISOString())
    .lte("due_date", todayEnd.toISOString());

  if (dueTodayCount && dueTodayCount > 3) {
    alerts.push({
      type: "busy_day",
      message: `${dueTodayCount} zadań do wykonania dziś. Zaplanuj priorytetowo.`,
      priority: "low",
      source: "tasks",
      data: { count: dueTodayCount },
    });
  }

  return alerts;
}

async function runCalendarCheck(
  userId: string,
  connectedRigs: string[],
): Promise<PulseAlert[]> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];

  const calendarRigs = connectedRigs.filter((r) =>
    ["google-calendar", "google-workspace", "microsoft-365"].includes(r),
  );

  if (calendarRigs.length === 0) {
    return alerts;
  }

  // Check upcoming events in next 2 hours
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data: upcomingEvents, count } = await supabase
    .from("user_calendar_events")
    .select("title, start_time, end_time", { count: "exact" })
    .eq("user_id", userId)
    .gte("start_time", now.toISOString())
    .lte("start_time", twoHoursLater.toISOString())
    .order("start_time", { ascending: true })
    .limit(5);

  if (count && count > 0) {
    const nextEvent = upcomingEvents?.[0];
    const minutesUntil = Math.round(
      (new Date(nextEvent?.start_time || "").getTime() - now.getTime()) / 60000,
    );

    if (minutesUntil <= 15) {
      alerts.push({
        type: "event_soon",
        message: `"${nextEvent?.title}" za ${minutesUntil} minut.`,
        priority: "high",
        source: "calendar",
        data: { event: nextEvent, minutesUntil },
      });
    } else if (count > 3) {
      alerts.push({
        type: "busy_calendar",
        message: `${count} wydarzeń w najbliższych 2 godzinach.`,
        priority: "low",
        source: "calendar",
        data: { count },
      });
    }
  }

  return alerts;
}

async function runSocialCheck(userId: string): Promise<PulseAlert[]> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];

  // Check for contacts not reached out to in 30+ days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data: neglectedContacts, count } = await supabase
    .from("user_contacts")
    .select("name, last_contact_at", { count: "exact" })
    .eq("user_id", userId)
    .eq("is_important", true)
    .lt("last_contact_at", thirtyDaysAgo.toISOString())
    .limit(3);

  if (count && count > 0) {
    alerts.push({
      type: "neglected_contacts",
      message: `${count} ważnych osób bez kontaktu od 30+ dni.`,
      priority: "low",
      source: "social",
      data: {
        count,
        contacts: neglectedContacts?.map((c) => c.name),
      },
    });
  }

  return alerts;
}

async function runFinanceCheck(
  userId: string,
  connectedRigs: string[],
): Promise<PulseAlert[]> {
  const supabase = getServiceSupabase();
  const alerts: PulseAlert[] = [];

  const financeRigs = connectedRigs.filter((r) => ["plaid"].includes(r));

  if (financeRigs.length === 0) {
    return alerts;
  }

  // Check spending vs average
  const { data: recentSpending } = await supabase
    .from("user_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { data: avgSpending } = await supabase
    .from("user_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (recentSpending && avgSpending && avgSpending.length > 0) {
    const weekTotal = recentSpending.reduce(
      (sum, t) => sum + Math.abs(t.amount as number),
      0,
    );
    const monthTotal = avgSpending.reduce(
      (sum, t) => sum + Math.abs(t.amount as number),
      0,
    );
    const weeklyAvg = monthTotal / 4;

    if (weekTotal > weeklyAvg * 1.2) {
      const overspendPercent = Math.round(
        ((weekTotal - weeklyAvg) / weeklyAvg) * 100,
      );
      alerts.push({
        type: "overspending",
        message: `Wydatki ${overspendPercent}% powyżej średniej tygodniowej.`,
        priority: overspendPercent > 50 ? "high" : "medium",
        source: "finance",
        data: { weekTotal, weeklyAvg, overspendPercent },
      });
    }
  }

  return alerts;
}
