/**
 * Canvas Data API — Email Analytics Widget
 *
 * GET /api/canvas/data/emails
 * Returns email summary, urgent emails, overdue follow-ups, and account status.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET() {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;
    const supabase = getServiceSupabase();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Run all queries in parallel
    const [
      unreadRes,
      urgentRes,
      overdueRes,
      todayRes,
      urgentEmailsRes,
      overdueEmailsRes,
      accountsRes,
    ] = await Promise.allSettled([
      supabase
        .from("exo_analyzed_emails")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_read", false),
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
        .lte("follow_up_by", now.toISOString()),
      supabase
        .from("exo_analyzed_emails")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("date_received", todayStart.toISOString()),
      supabase
        .from("exo_analyzed_emails")
        .select("id, subject, from_name, from_email, date_received, priority")
        .eq("tenant_id", tenantId)
        .in("priority", ["urgent", "high"])
        .eq("is_read", false)
        .order("date_received", { ascending: false })
        .limit(5),
      supabase
        .from("exo_analyzed_emails")
        .select("id, subject, from_name, from_email, follow_up_by")
        .eq("tenant_id", tenantId)
        .eq("follow_up_needed", true)
        .lte("follow_up_by", now.toISOString())
        .order("follow_up_by", { ascending: true })
        .limit(5),
      supabase
        .from("exo_email_accounts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("sync_enabled", true),
    ]);

    const extractCount = (
      res: PromiseSettledResult<{ count: number | null }>,
    ): number =>
      res.status === "fulfilled"
        ? (res.value as { count: number | null }).count || 0
        : 0;

    const extractData = <T>(
      res: PromiseSettledResult<{ data: T[] | null }>,
    ): T[] =>
      res.status === "fulfilled"
        ? (res.value as { data: T[] | null }).data || []
        : [];

    return NextResponse.json({
      summary: {
        unread: extractCount(unreadRes),
        urgent: extractCount(urgentRes),
        needsReply: extractCount(overdueRes),
        overdueFollowUps: extractCount(overdueRes),
        todayReceived: extractCount(todayRes),
      },
      urgentEmails: extractData(urgentEmailsRes),
      overdueEmails: extractData(overdueEmailsRes),
      connectedAccounts: extractCount(accountsRes),
    });
  } catch (error) {
    console.error("[EmailCanvasAPI] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email data" },
      { status: 500 },
    );
  }
}
