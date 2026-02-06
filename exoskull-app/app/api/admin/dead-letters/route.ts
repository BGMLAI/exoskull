/**
 * Dead Letter Queue Admin API
 *
 * GET: List unreviewed dead letters
 * POST: Retry or discard a dead letter
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getUnreviewedDeadLetters,
  retryDeadLetter,
  discardDeadLetter,
} from "@/lib/async-tasks/dead-letter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const deadLetters = await getUnreviewedDeadLetters(50);
    return NextResponse.json({ dead_letters: deadLetters });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminDeadLetters] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { id, action } = body as { id: string; action: "retry" | "discard" };

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing id or action" },
        { status: 400 },
      );
    }

    if (action === "retry") {
      const newTaskId = await retryDeadLetter(id);
      return NextResponse.json({ status: "retried", new_task_id: newTaskId });
    } else if (action === "discard") {
      await discardDeadLetter(id);
      return NextResponse.json({ status: "discarded" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[AdminDeadLetters] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
