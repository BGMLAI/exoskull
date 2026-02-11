/**
 * Email Nudge Generator
 *
 * Generates proactive nudges based on email state.
 * Called by loop-15 evaluation cycle.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

export interface EmailNudge {
  type:
    | "urgent_unanswered"
    | "follow_up_overdue"
    | "inbox_overload"
    | "important_sender_waiting";
  priority: "high" | "medium" | "low";
  message: string;
  emailCount: number;
}

/**
 * Check email state and generate nudges if needed.
 * Returns array of nudges (empty if everything is fine).
 */
export async function generateEmailNudges(
  tenantId: string,
): Promise<EmailNudge[]> {
  const supabase = getServiceSupabase();
  const nudges: EmailNudge[] = [];
  const now = new Date();

  // 1. Urgent emails unread for > 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const { count: urgentCount } = await supabase
    .from("exo_analyzed_emails")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("priority", ["urgent", "high"])
    .eq("is_read", false)
    .eq("direction", "inbound")
    .lte("date_received", twoHoursAgo);

  if (urgentCount && urgentCount >= 3) {
    nudges.push({
      type: "urgent_unanswered",
      priority: "high",
      message: `Masz ${urgentCount} pilnych emaili nieodczytanych od ponad 2 godzin. Sprawdz skrzynke!`,
      emailCount: urgentCount,
    });
  }

  // 2. Follow-up overdue
  const { count: overdueCount } = await supabase
    .from("exo_analyzed_emails")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("follow_up_needed", true)
    .eq("direction", "inbound")
    .lte("follow_up_by", now.toISOString());

  if (overdueCount && overdueCount > 0) {
    nudges.push({
      type: "follow_up_overdue",
      priority: overdueCount >= 3 ? "high" : "medium",
      message: `Masz ${overdueCount} emaili z przeterminowanym follow-upem. Ktos czeka na Twoja odpowiedz.`,
      emailCount: overdueCount,
    });
  }

  // 3. Inbox overload (50+ unread)
  const { count: unreadCount } = await supabase
    .from("exo_analyzed_emails")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_read", false);

  if (unreadCount && unreadCount >= 50) {
    nudges.push({
      type: "inbox_overload",
      priority: "medium",
      message: `Masz ${unreadCount} nieprzeczytanych emaili. Moze czas na sesje czyszczenia skrzynki?`,
      emailCount: unreadCount,
    });
  }

  // 4. Important sender waiting (importance_score >= 80, unread > 4h)
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600_000).toISOString();
  const { data: importantWaiting } = await supabase
    .from("exo_analyzed_emails")
    .select("from_email, from_name, subject")
    .eq("tenant_id", tenantId)
    .eq("is_read", false)
    .eq("direction", "inbound")
    .gte("priority_score", 80)
    .lte("date_received", fourHoursAgo)
    .limit(3);

  if (importantWaiting?.length) {
    const senders = importantWaiting
      .map((e) => e.from_name || e.from_email)
      .join(", ");
    nudges.push({
      type: "important_sender_waiting",
      priority: "high",
      message: `Wazni nadawcy czekaja na odpowiedz od ponad 4h: ${senders}`,
      emailCount: importantWaiting.length,
    });
  }

  return nudges;
}

/**
 * Get quick email state for loop-15 state check.
 * Lightweight — just counts.
 */
export async function getEmailState(tenantId: string): Promise<{
  urgentUnread: number;
  overdueFollowUps: number;
  totalUnread: number;
}> {
  const supabase = getServiceSupabase();

  const [urgentRes, overdueRes, unreadRes] = await Promise.allSettled([
    supabase
      .from("exo_analyzed_emails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("priority", ["urgent", "high"])
      .eq("is_read", false),
    supabase
      .from("exo_analyzed_emails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("follow_up_needed", true)
      .lte("follow_up_by", new Date().toISOString()),
    supabase
      .from("exo_analyzed_emails")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_read", false),
  ]);

  return {
    urgentUnread:
      urgentRes.status === "fulfilled"
        ? (urgentRes.value as { count: number | null }).count || 0
        : 0,
    overdueFollowUps:
      overdueRes.status === "fulfilled"
        ? (overdueRes.value as { count: number | null }).count || 0
        : 0,
    totalUnread:
      unreadRes.status === "fulfilled"
        ? (unreadRes.value as { count: number | null }).count || 0
        : 0,
  };
}
