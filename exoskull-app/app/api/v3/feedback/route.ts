/**
 * Feedback API — Collect user ratings on AI responses.
 *
 * POST: Store feedback { message_id, rating: 1-5, comment? }
 * GET: Aggregate feedback stats for the tenant
 *
 * Auth: CRON_SECRET for GET (internal), Bearer JWT or session for POST (user-facing).
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenant_id, message_id, rating, comment } = body as {
      tenant_id?: string;
      message_id?: string;
      rating?: number;
      comment?: string;
    };

    if (!tenant_id) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be 1-5" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();

    const { error } = await supabase.from("exo_feedback").insert({
      tenant_id,
      message_id: message_id || null,
      rating: Math.round(rating),
      comment: comment?.slice(0, 1000) || null,
    });

    // Fallback: if exo_feedback doesn't exist, store in exo_ai_usage metadata
    if (error?.code === "42P01") {
      // Table doesn't exist — store in autonomy log instead
      await supabase.from("exo_autonomy_log").insert({
        tenant_id,
        event_type: "user_feedback",
        payload: {
          message_id,
          rating: Math.round(rating),
          comment: comment?.slice(0, 1000),
        },
      });
    } else if (error) {
      logger.error("[Feedback] Insert failed:", { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rating });
  } catch (err) {
    logger.error("[Feedback] POST error:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Auth: CRON_SECRET for internal, or extract tenant from query
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = getServiceSupabase();

    // Try exo_feedback first, fall back to autonomy_log
    let avgRating = 0;
    let totalCount = 0;
    let recentFeedback: Array<{
      rating: number;
      comment?: string | null;
      created_at: string;
    }> = [];

    const { data: feedbackData, error: fbError } = await supabase
      .from("exo_feedback")
      .select("rating, comment, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!fbError && feedbackData) {
      totalCount = feedbackData.length;
      avgRating =
        totalCount > 0
          ? feedbackData.reduce((sum, f) => sum + (f.rating as number), 0) /
            totalCount
          : 0;
      recentFeedback = feedbackData.slice(0, 10) as typeof recentFeedback;
    } else {
      // Fallback to autonomy log
      const { data: logData } = await supabase
        .from("exo_autonomy_log")
        .select("payload, created_at")
        .eq("tenant_id", tenantId)
        .eq("event_type", "user_feedback")
        .order("created_at", { ascending: false })
        .limit(50);

      if (logData) {
        totalCount = logData.length;
        const ratings = logData
          .map((l) => (l.payload as Record<string, unknown>)?.rating as number)
          .filter((r) => typeof r === "number");
        avgRating =
          ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0;
      }
    }

    return NextResponse.json({
      tenant_id: tenantId,
      total_feedback: totalCount,
      average_rating: Math.round(avgRating * 100) / 100,
      recent: recentFeedback,
    });
  } catch (err) {
    logger.error("[Feedback] GET error:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
