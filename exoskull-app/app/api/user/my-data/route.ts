/**
 * My Data API
 *
 * GET: Returns user's personal data overview:
 * - MITs (Most Important Things)
 * - Behavioral patterns
 * - Learning events
 * - Engagement stats
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 4 parallel queries
    const [mitsResult, patternsResult, learningResult, engagementResult] =
      await Promise.allSettled([
        // 1. MITs from exo_highlights
        supabase
          .from("exo_highlights")
          .select("id, content, category, weight, updated_at")
          .eq("tenant_id", user.id)
          .order("weight", { ascending: false })
          .limit(20),

        // 2. Patterns from exo_behavioral_patterns
        supabase
          .from("exo_behavioral_patterns")
          .select(
            "id, pattern_type, description, confidence, occurrences, last_seen",
          )
          .eq("tenant_id", user.id)
          .order("confidence", { ascending: false })
          .limit(20),

        // 3. Learning events
        supabase
          .from("learning_events")
          .select("id, event_type, description, created_at, metadata")
          .eq("tenant_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30),

        // 4. Engagement: message count last 7d + session count
        supabase
          .from("exo_unified_messages")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", user.id)
          .gte(
            "created_at",
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          ),
      ]);

    const mits =
      mitsResult.status === "fulfilled" ? (mitsResult.value.data ?? []) : [];
    const patterns =
      patternsResult.status === "fulfilled"
        ? (patternsResult.value.data ?? [])
        : [];
    const learning =
      learningResult.status === "fulfilled"
        ? (learningResult.value.data ?? [])
        : [];
    const messagesLast7d =
      engagementResult.status === "fulfilled"
        ? (engagementResult.value.count ?? 0)
        : 0;

    return NextResponse.json({
      mits,
      patterns,
      learningEvents: learning,
      engagement: {
        messagesLast7d,
      },
    });
  } catch (error) {
    console.error("[MyDataAPI] GET Error:", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
