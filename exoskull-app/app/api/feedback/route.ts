/**
 * Feedback API — submit and read user feedback.
 *
 * POST /api/feedback — submit feedback
 * GET  /api/feedback — get feedback summary + recent items
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import {
  submitFeedback,
  getFeedbackSummary,
  getRecentFeedback,
  type FeedbackType,
} from "@/lib/iors/feedback";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

const VALID_TYPES: FeedbackType[] = [
  "response_quality",
  "personality",
  "action",
  "feature_request",
  "bug_report",
  "general",
];

export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

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

    const result = await submitFeedback(tenantId, {
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
});

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const [summary, recent] = await Promise.all([
      getFeedbackSummary(tenantId, 30),
      getRecentFeedback(tenantId, 20),
    ]);

    return NextResponse.json({ summary, recent });
  } catch (error) {
    console.error("[FeedbackAPI] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
