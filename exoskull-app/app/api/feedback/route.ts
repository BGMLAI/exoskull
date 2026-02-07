/**
 * Feedback API — submit and read user feedback.
 *
 * POST /api/feedback — submit feedback
 * GET  /api/feedback — get feedback summary + recent items
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  submitFeedback,
  getFeedbackSummary,
  getRecentFeedback,
  type FeedbackType,
} from "@/lib/iors/feedback";

export const dynamic = "force-dynamic";

const VALID_TYPES: FeedbackType[] = [
  "response_quality",
  "personality",
  "action",
  "feature_request",
  "bug_report",
  "general",
];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { feedback_type, rating, message, context } = body;

    if (!feedback_type || !VALID_TYPES.includes(feedback_type)) {
      return NextResponse.json(
        { error: "Invalid feedback_type" },
        { status: 400 },
      );
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be 1-5" },
        { status: 400 },
      );
    }

    const result = await submitFeedback(user.id, {
      type: feedback_type,
      rating,
      message,
      context,
      channel: "web_chat",
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ id: result.id });
  } catch (error) {
    console.error("[FeedbackAPI] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

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

    const [summary, recent] = await Promise.all([
      getFeedbackSummary(user.id, 30),
      getRecentFeedback(user.id, 20),
    ]);

    return NextResponse.json({ summary, recent });
  } catch (error) {
    console.error("[FeedbackAPI] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
