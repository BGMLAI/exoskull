/**
 * Emotion Trends API
 *
 * GET /api/emotion/trends?days=7|14|30
 * Returns daily emotion aggregates for the authenticated user.
 * Uses the get_emotion_trends() SQL function from the emotion migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_DAYS = [7, 14, 30] as const;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 7;

    if (!VALID_DAYS.includes(days as (typeof VALID_DAYS)[number])) {
      return NextResponse.json(
        { error: "Invalid days parameter", valid: VALID_DAYS },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("get_emotion_trends", {
      p_tenant_id: user.id,
      p_days: days,
    });

    if (error) {
      console.error("[EmotionTrends] RPC error:", {
        error: error.message,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Failed to fetch emotion trends" },
        { status: 500 },
      );
    }

    // Sort ascending for chart display (SQL returns DESC)
    const sorted = ((data as Record<string, unknown>[]) || []).sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")),
    );

    return NextResponse.json({ days, data: sorted, count: sorted.length });
  } catch (error) {
    console.error("[EmotionTrends] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
