/**
 * Canvas Conversations Data API
 *
 * GET /api/canvas/data/conversations — Returns conversation stats for ConversationsWidget.
 * Queries exo_unified_messages + exo_voice_sessions for real counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import type { DataPoint } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayMsgs, weekMsgs, voiceSessions, dailySeries] = await Promise.all(
      [
        // Count user messages today (each user message = 1 conversation turn)
        supabase
          .from("exo_unified_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("role", "user")
          .gte("created_at", todayStart.toISOString()),

        // Count user messages this week
        supabase
          .from("exo_unified_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("role", "user")
          .gte("created_at", weekAgo.toISOString()),

        // Voice sessions for avg duration
        supabase
          .from("exo_voice_sessions")
          .select("started_at, ended_at")
          .eq("tenant_id", tenantId)
          .eq("status", "ended")
          .gte("started_at", weekAgo.toISOString())
          .not("ended_at", "is", null),

        // Daily message counts for 7-day series
        supabase
          .from("exo_unified_messages")
          .select("created_at")
          .eq("tenant_id", tenantId)
          .eq("role", "user")
          .gte("created_at", weekAgo.toISOString())
          .order("created_at", { ascending: true }),
      ],
    );

    // Calculate avg duration from voice sessions
    const sessions = voiceSessions.data || [];
    let avgDuration = 0;
    if (sessions.length > 0) {
      const totalSeconds = sessions.reduce((sum, s) => {
        const start = new Date(s.started_at).getTime();
        const end = new Date(s.ended_at).getTime();
        return sum + (end - start) / 1000;
      }, 0);
      avgDuration = Math.round(totalSeconds / sessions.length);
    }

    // Build 7-day series (messages per day)
    const dailyCounts = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyCounts.set(d.toISOString().split("T")[0], 0);
    }
    for (const msg of dailySeries.data || []) {
      const day = new Date(msg.created_at).toISOString().split("T")[0];
      dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
    }
    const series: DataPoint[] = Array.from(dailyCounts.entries()).map(
      ([date, value]) => ({ date, value }),
    );

    return NextResponse.json({
      totalToday: todayMsgs.count || 0,
      totalWeek: weekMsgs.count || 0,
      avgDuration,
      series,
      lastUpdated: now.toISOString(),
    });
  } catch (error) {
    console.error("[Canvas] Conversations data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
