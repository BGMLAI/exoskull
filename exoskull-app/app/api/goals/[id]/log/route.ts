/**
 * POST /api/goals/[id]/log — Log progress for a goal
 *
 * Uses the full logProgress() engine which calculates
 * progress_percent, momentum, and trajectory.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logProgress } from "@/lib/goals/engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: goalId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { value, notes } = body as { value: number; notes?: string };

    if (value == null || typeof value !== "number") {
      return NextResponse.json(
        { error: "value (number) is required" },
        { status: 400 },
      );
    }

    const checkpoint = await logProgress(
      user.id,
      goalId,
      value,
      "manual_dashboard",
      notes,
    );

    return NextResponse.json({ checkpoint });
  } catch (error) {
    const err = error as Error;
    console.error("[Goals/Log] Failed:", {
      error: err.message,
      stack: err.stack,
    });

    if (err.message.includes("Goal not found")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
