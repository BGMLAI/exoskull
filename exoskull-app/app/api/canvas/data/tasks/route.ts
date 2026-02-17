/**
 * Canvas Tasks Data API
 *
 * GET  /api/canvas/data/tasks — Returns task objects for the floating Tasks panel.
 * POST /api/canvas/data/tasks — Creates a new task.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getTasks, createTask } from "@/lib/tasks/task-service";

import { withApiLog } from "@/lib/api/request-logger";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export const GET = withApiLog(async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    // Return actual task objects via dual-read service (handles both exo_tasks and user_ops)
    const tasks = await getTasks(tenantId, { limit: 50 });

    return NextResponse.json({
      data: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        completed_at: t.completed_at,
        created_at: t.created_at,
        done: t.status === "done",
      })),
    });
  } catch (error) {
    logger.error("[Canvas] Tasks data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const body = await req.json();

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Use the task-service createTask which handles dual-write (exo_tasks + user_ops)
    const result = await createTask(tenantId, {
      title: body.title.trim(),
      status: "pending",
      priority: body.priority ?? 3,
      due_date: body.due_date ?? null,
      description: body.description ?? null,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(
      { id: result.id, dual_write_success: result.dual_write_success },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[Canvas] Tasks POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
