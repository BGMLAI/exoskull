/**
 * Message to Task Conversion API
 *
 * POST /api/messages/[id]/to-task
 * Converts a unified message into a task and links them
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createTask } from "@/lib/tasks/task-service";
import { withApiLog } from "@/lib/api/request-logger";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

interface CreateTaskRequest {
  title?: string;
  description?: string;
  project_id?: string;
  priority?: number;
  due_date?: string;
}

export const POST = withApiLog(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Get authenticated user
    const serverSupabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: messageId } = await params;
    const body: CreateTaskRequest = await request.json().catch(() => ({}));

    const supabase = getServiceSupabase();

    // Get the message
    const { data: message, error: msgError } = await supabase
      .from("exo_unified_messages")
      .select("*")
      .eq("id", messageId)
      .eq("tenant_id", user.id)
      .single();

    if (msgError || !message) {
      logger.error("[MessageToTask] Message not found:", {
        messageId,
        error: msgError?.message,
      });
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Check if message already has a linked task
    if (message.linked_task_id) {
      return NextResponse.json(
        {
          error: "Message already has a linked task",
          task_id: message.linked_task_id,
        },
        { status: 400 },
      );
    }

    // Generate task title from message if not provided
    const metadata = message.metadata || {};
    const defaultTitle =
      metadata.subject ||
      message.content.slice(0, 100) +
        (message.content.length > 100 ? "..." : "");

    // Generate task description from message
    const defaultDescription = `Źródło: ${message.channel}\n${
      metadata.from ? `Od: ${metadata.from}\n` : ""
    }${metadata.subject ? `Temat: ${metadata.subject}\n` : ""}---\n${message.content}`;

    // Create the task via dual-write service
    const taskResult = await createTask(user.id, {
      title: body.title || defaultTitle,
      description: body.description || defaultDescription,
      project_id: body.project_id || null,
      priority: (body.priority || 3) as 1 | 2 | 3 | 4,
      due_date: body.due_date || null,
      status: "pending",
      context: {
        source_message_id: messageId,
        source_channel: message.channel,
        created_from: "message_conversion",
      },
    });

    if (!taskResult.id) {
      logger.error("[MessageToTask] Failed to create task:", {
        error: taskResult.error,
        messageId,
      });
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 },
      );
    }

    const task = {
      id: taskResult.id,
      title: body.title || defaultTitle,
      status: "pending",
      priority: body.priority || 3,
      project_id: body.project_id || null,
      due_date: body.due_date || null,
      created_at: new Date().toISOString(),
    };

    // Link the task to the message
    const { error: linkError } = await supabase
      .from("exo_unified_messages")
      .update({ linked_task_id: task.id })
      .eq("id", messageId);

    if (linkError) {
      logger.error("[MessageToTask] Failed to link task to message:", {
        error: linkError.message,
        messageId,
        taskId: task.id,
      });
      // Task was created, so we don't fail completely
    }

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        project_id: task.project_id,
        due_date: task.due_date,
        created_at: task.created_at,
      },
      message_id: messageId,
    });
  } catch (error) {
    logger.error("[MessageToTask] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
