/**
 * Context-Aware Intervention Timing
 *
 * Determines the optimal delivery time for interventions based on:
 * 1. Calendar (is user in a meeting/focus time?)
 * 2. Learned best contact hour
 * 3. Recent activity (if active now → good moment)
 * 4. Priority (critical = immediate)
 * 5. Quiet hours (23:00 - 07:00)
 */

import { createClient } from "@supabase/supabase-js";
import { getPreference } from "./learning-engine";
import { logger } from "@/lib/logger";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// TYPES
// ============================================================================

interface TimingContext {
  isInMeeting: boolean;
  meetingEndTime: Date | null;
  isActiveNow: boolean; // Had interaction in last 5 minutes
  bestContactHour: number | null;
  isQuietHours: boolean;
  userTimezone: string;
}

interface TimingDecision {
  deliverAt: Date;
  reason: string;
  delayed: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Find the optimal delivery time for an intervention.
 */
export async function findOptimalDeliveryTime(
  tenantId: string,
  priority: "low" | "medium" | "high" | "critical",
): Promise<TimingDecision> {
  // Critical priority = immediate, always
  if (priority === "critical") {
    return {
      deliverAt: new Date(),
      reason: "Critical priority — immediate delivery",
      delayed: false,
    };
  }

  try {
    const context = await collectTimingContext(tenantId);

    // 1. Active and not in meeting → deliver now
    if (context.isActiveNow && !context.isInMeeting) {
      return {
        deliverAt: new Date(),
        reason: "User is active and not in a meeting",
        delayed: false,
      };
    }

    // 2. In meeting → deliver after meeting + 5 min buffer
    if (context.isInMeeting && context.meetingEndTime) {
      const deliverAt = new Date(context.meetingEndTime.getTime() + 5 * 60 * 1000);
      return {
        deliverAt,
        reason: `User in meeting — delivering after ${context.meetingEndTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`,
        delayed: true,
      };
    }

    // 3. Quiet hours → deliver at 07:00 next day (or today if before 07:00)
    if (context.isQuietHours) {
      const tomorrow7am = getNext7AM(context.userTimezone);
      // For high priority, deliver at quiet hours end
      if (priority === "high") {
        return {
          deliverAt: tomorrow7am,
          reason: "Quiet hours — delivering at 07:00",
          delayed: true,
        };
      }
      // For medium/low, deliver at best contact hour
      const bestHour = context.bestContactHour || 9;
      const deliverAt = getNextOccurrence(bestHour, context.userTimezone);
      return {
        deliverAt,
        reason: `Quiet hours — delivering at ${bestHour}:00 (learned preference)`,
        delayed: true,
      };
    }

    // 4. High priority + not quiet hours → deliver now
    if (priority === "high") {
      return {
        deliverAt: new Date(),
        reason: "High priority — delivering now",
        delayed: false,
      };
    }

    // 5. Medium/low priority → deliver at best contact hour if within 2h, otherwise now
    if (context.bestContactHour !== null) {
      const nextBestTime = getNextOccurrence(context.bestContactHour, context.userTimezone);
      const hoursUntilBest = (nextBestTime.getTime() - Date.now()) / (60 * 60 * 1000);

      if (hoursUntilBest > 0 && hoursUntilBest <= 2) {
        return {
          deliverAt: nextBestTime,
          reason: `Delivering at learned best hour: ${context.bestContactHour}:00 (in ${Math.round(hoursUntilBest * 60)} min)`,
          delayed: true,
        };
      }
    }

    // 6. Default — deliver now
    return {
      deliverAt: new Date(),
      reason: "No timing constraints — delivering now",
      delayed: false,
    };
  } catch (error) {
    logger.warn("[TimingOptimizer] Failed, delivering now:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return {
      deliverAt: new Date(),
      reason: "Timing optimizer failed — fallback to immediate",
      delayed: false,
    };
  }
}

// ============================================================================
// CONTEXT COLLECTION
// ============================================================================

async function collectTimingContext(tenantId: string): Promise<TimingContext> {
  const supabase = getServiceSupabase();

  const [lastInteraction, bestHourPref, tenantInfo, calendarEvents] =
    await Promise.all([
      // Last interaction time
      supabase
        .from("exo_unified_thread")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
        .then((r) => r.data?.created_at || null),

      // Learned best contact hour
      getPreference(tenantId, "best_contact_hour"),

      // Timezone
      supabase
        .from("exo_tenants")
        .select("timezone")
        .eq("id", tenantId)
        .single()
        .then((r) => r.data),

      // Calendar events (next 2h)
      getUpcomingCalendarEvents(supabase, tenantId),
    ]);

  const timezone = tenantInfo?.timezone || "Europe/Warsaw";
  const now = new Date();
  const localHour = getLocalHour(now, timezone);

  // Check if user is currently in a meeting
  let isInMeeting = false;
  let meetingEndTime: Date | null = null;

  if (calendarEvents) {
    for (const evt of calendarEvents) {
      const start = new Date(evt.start);
      const end = new Date(evt.end);
      if (start <= now && end > now) {
        isInMeeting = true;
        meetingEndTime = end;
        break;
      }
    }
  }

  // Check if user was active in last 5 minutes
  const isActiveNow = lastInteraction
    ? Date.now() - new Date(lastInteraction).getTime() < 5 * 60 * 1000
    : false;

  // Quiet hours: 23:00 - 07:00
  const isQuietHours = localHour >= 23 || localHour < 7;

  return {
    isInMeeting,
    meetingEndTime,
    isActiveNow,
    bestContactHour: bestHourPref ? (bestHourPref.value as number) : null,
    isQuietHours,
    userTimezone: timezone,
  };
}

async function getUpcomingCalendarEvents(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
): Promise<Array<{ start: string; end: string; title: string }> | null> {
  try {
    // Try Google Calendar via rig connection
    const { data: conn } = await supabase
      .from("exo_rig_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", "google")
      .not("refresh_token", "is", null)
      .maybeSingle();

    if (!conn) return null;

    const { ensureFreshToken } = await import("@/lib/rigs/oauth");
    const { createGoogleClient } = await import("@/lib/rigs/google/client");

    const freshToken = await ensureFreshToken(conn);
    if (freshToken !== conn.access_token) conn.access_token = freshToken;

    const client = createGoogleClient(conn);
    if (!client) return null;

    const events = await client.calendar.getTodaysEvents().catch(() => null);
    if (!events) return null;

    return events.map((evt: any) => ({
      start: evt.start?.dateTime || evt.start?.date || "",
      end: evt.end?.dateTime || evt.end?.date || "",
      title: evt.summary || "Untitled",
    }));
  } catch {
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getLocalHour(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    return date.getHours(); // Fallback to server time
  }
}

function getNext7AM(timezone: string): Date {
  const now = new Date();
  const localHour = getLocalHour(now, timezone);

  const target = new Date(now);
  if (localHour >= 7) {
    // Next day at 07:00
    target.setDate(target.getDate() + 1);
  }
  target.setHours(7, 0, 0, 0);
  return target;
}

function getNextOccurrence(hour: number, timezone: string): Date {
  const now = new Date();
  const localHour = getLocalHour(now, timezone);

  const target = new Date(now);
  if (localHour >= hour) {
    // Next day
    target.setDate(target.getDate() + 1);
  }
  target.setHours(hour, 0, 0, 0);
  return target;
}
