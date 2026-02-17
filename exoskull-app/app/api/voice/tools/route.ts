import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  getTasks as getTasksService,
  createTask as createTaskService,
  completeTask as completeTaskService,
} from "@/lib/tasks/task-service";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

// Tool Handlers (legacy VAPI format - using dual-write task service)
async function getTasks(tenantId: string) {
  try {
    const tasks = await getTasksService(tenantId, { limit: 20 });
    // Filter out cancelled
    const filtered = tasks.filter((t) => t.status !== "cancelled");
    return {
      tasks: filtered,
      count: filtered.length,
    };
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    return {
      tasks: [],
      error: error instanceof Error ? error.message : "Unknown",
    };
  }
}

async function createTask(
  tenantId: string,
  params: {
    title: string;
    priority?: number;
    due_date?: string;
    description?: string;
    energy_required?: number;
  },
) {
  try {
    const result = await createTaskService(tenantId, {
      title: params.title,
      priority: (params.priority || 3) as 1 | 2 | 3 | 4,
      due_date: params.due_date || null,
      description: params.description || null,
      energy_required: params.energy_required || null,
      status: "pending",
    });

    if (!result.id) {
      return { success: false, error: result.error || "Failed to create task" };
    }

    return {
      success: true,
      task: { id: result.id, title: params.title },
      message: `Zadanie "${params.title}" zostało dodane`,
    };
  } catch (error) {
    logger.error("Error creating task:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown",
    };
  }
}

async function completeTask(tenantId: string, taskId: string) {
  try {
    const result = await completeTaskService(taskId, tenantId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to complete task",
      };
    }

    return {
      success: true,
      message: `Zadanie oznaczone jako wykonane`,
    };
  } catch (error) {
    logger.error("Error completing task:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown",
    };
  }
}

// Schedule/Check-in handlers
async function getSchedule(tenantId: string) {
  const supabase = getServiceSupabase();
  // Get user's custom check-ins
  const { data: customCheckins } = await supabase
    .from("exo_user_checkins")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("time");

  // Get system jobs with user preferences
  const { data: systemJobs } = await supabase
    .from("exo_scheduled_jobs")
    .select(
      "id, job_name, display_name, description, time_window_start, default_channel, is_system",
    )
    .eq("is_active", true);

  const { data: preferences } = await supabase
    .from("exo_user_job_preferences")
    .select("job_id, is_enabled, custom_time, preferred_channel")
    .eq("tenant_id", tenantId);

  const prefsMap = new Map(preferences?.map((p) => [p.job_id, p]) || []);

  const systemWithPrefs =
    systemJobs?.map((job) => ({
      name: job.display_name || job.job_name,
      time: prefsMap.get(job.id)?.custom_time || job.time_window_start,
      channel: prefsMap.get(job.id)?.preferred_channel || job.default_channel,
      enabled: prefsMap.get(job.id)?.is_enabled ?? true,
      is_system: true,
    })) || [];

  const custom =
    customCheckins?.map((c) => ({
      name: c.name,
      time: c.time,
      frequency: c.frequency,
      channel: c.channel,
      message: c.message,
      enabled: c.is_active,
      is_system: false,
    })) || [];

  const allCheckins = [...systemWithPrefs.filter((j) => j.enabled), ...custom];

  if (allCheckins.length === 0) {
    return { checkins: [], message: "Nie masz zadnych aktywnych check-inow." };
  }

  return {
    checkins: allCheckins,
    count: allCheckins.length,
    message: `Masz ${allCheckins.length} aktywnych check-inow.`,
  };
}

async function createCheckin(
  tenantId: string,
  params: {
    name: string;
    time: string;
    frequency?: string;
    channel?: string;
    message?: string;
  },
) {
  const supabase = getServiceSupabase();
  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(params.time)) {
    return { success: false, error: "Nieprawidlowy format czasu. Uzyj HH:MM." };
  }

  const { data, error } = await supabase
    .from("exo_user_checkins")
    .insert({
      tenant_id: tenantId,
      name: params.name,
      time: params.time,
      frequency: params.frequency || "daily",
      channel: params.channel || "voice",
      message: params.message || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    logger.error("Error creating checkin:", error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    checkin: data,
    message: `Przypomnienie "${params.name}" o ${params.time} dodane.`,
  };
}

async function toggleCheckin(
  tenantId: string,
  checkinName: string,
  enabled: boolean,
) {
  const supabase = getServiceSupabase();
  // First try custom checkins
  const { data: customCheckin } = await supabase
    .from("exo_user_checkins")
    .update({ is_active: enabled, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .ilike("name", `%${checkinName}%`)
    .select()
    .single();

  if (customCheckin) {
    return {
      success: true,
      message: enabled
        ? `Check-in "${customCheckin.name}" wlaczony.`
        : `Check-in "${customCheckin.name}" wylaczony.`,
    };
  }

  // Try system jobs
  const { data: systemJob } = await supabase
    .from("exo_scheduled_jobs")
    .select("id, display_name, job_name")
    .or(`display_name.ilike.%${checkinName}%,job_name.ilike.%${checkinName}%`)
    .single();

  if (systemJob) {
    const { error } = await supabase.from("exo_user_job_preferences").upsert(
      {
        tenant_id: tenantId,
        job_id: systemJob.id,
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,job_id" },
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: enabled
        ? `Check-in "${systemJob.display_name || systemJob.job_name}" wlaczony.`
        : `Check-in "${systemJob.display_name || systemJob.job_name}" wylaczony.`,
    };
  }

  return {
    success: false,
    error: `Nie znaleziono check-inu o nazwie "${checkinName}"`,
  };
}

export const POST = withApiLog(async function POST(request: Request) {
  try {
    const body = await request.json();

    logger.info(
      "[VoiceTools] Tool call received:",
      JSON.stringify(body, null, 2),
    );

    // Parse function calls from payload
    const { message, call } = body;

    // PRIMARY: Get tenant_id from URL query params (most reliable)
    const url = new URL(request.url);
    const urlTenantId = url.searchParams.get("tenant_id");
    const conversationId = url.searchParams.get("conversation_id");

    logger.info("[VoiceTools] URL params:", {
      tenant_id: urlTenantId,
      conversation_id: conversationId,
    });

    // FALLBACK: Get from call payload metadata
    const payloadTenantId =
      call?.metadata?.tenant_id ||
      call?.assistantOverrides?.variableValues?.tenant_id ||
      call?.assistant?.metadata?.tenant_id ||
      message?.call?.metadata?.tenant_id;

    // Use URL param first, fallback to payload
    const tenantId = urlTenantId || payloadTenantId;

    if (!tenantId) {
      logger.error("[VoiceTools] No tenant_id found in URL or payload");
      logger.error("URL:", request.url);
      logger.error("Call:", JSON.stringify(call, null, 2));
      return NextResponse.json({
        result: {
          error:
            "Nie można zidentyfikować użytkownika. Spróbuj zalogować się ponownie.",
          tasks: [],
        },
      });
    }

    logger.info(
      "[VoiceTools] Found tenant_id:",
      tenantId,
      urlTenantId ? "(from URL)" : "(from payload)",
    );

    // Handle function call - check for tool-calls (new format) or function-call (old format)
    if (
      message?.type === "tool-calls" ||
      message?.type === "function-call" ||
      message?.functionCall
    ) {
      // New format: toolCallList array
      const toolCalls =
        message?.toolCallList ||
        message?.toolWithToolCallList ||
        (message?.functionCall
          ? [
              {
                id: message.functionCall.id || "unknown",
                name: message.functionCall.name,
                parameters: message.functionCall.parameters,
              },
            ]
          : []);

      // If using old format
      if (toolCalls.length === 0 && message?.functionCall) {
        const functionCall = message.functionCall;
        const functionName = functionCall.name;
        const parameters = functionCall.parameters || {};
        const toolCallId = functionCall.id || body?.toolCallId || "unknown";

        logger.info(
          `[VoiceTools] Function: ${functionName}, Params:`,
          parameters,
          `ToolCallId:`,
          toolCallId,
        );

        let resultData: any;

        switch (functionName) {
          case "get_tasks":
            resultData = await getTasks(tenantId);
            break;
          case "create_task":
            resultData = await createTask(tenantId, parameters);
            break;
          case "complete_task":
            resultData = await completeTask(tenantId, parameters.task_id);
            break;
          case "get_schedule":
            resultData = await getSchedule(tenantId);
            break;
          case "create_checkin":
            resultData = await createCheckin(tenantId, parameters);
            break;
          case "toggle_checkin":
            resultData = await toggleCheckin(
              tenantId,
              parameters.checkin_name,
              parameters.enabled,
            );
            break;
          default:
            resultData = { error: `Unknown function: ${functionName}` };
        }

        logger.info(`[VoiceTools] Result:`, resultData);

        // Return results array with toolCallId and result as STRING
        const resultString =
          typeof resultData === "string"
            ? resultData
            : JSON.stringify(resultData);
        return NextResponse.json({
          results: [
            {
              toolCallId: toolCallId,
              result: resultString,
            },
          ],
        });
      }

      // Handle new tool-calls format with toolCallList
      const results = [];
      for (const toolCall of toolCalls) {
        const functionName = toolCall.name || toolCall.function?.name;
        const parameters =
          toolCall.parameters || toolCall.function?.arguments || {};
        const toolCallId = toolCall.id || toolCall.toolCall?.id || "unknown";

        logger.info(
          `[VoiceTools] Function: ${functionName}, Params:`,
          parameters,
          `ToolCallId:`,
          toolCallId,
        );

        let resultData: any;

        switch (functionName) {
          case "get_tasks":
            resultData = await getTasks(tenantId);
            break;
          case "create_task":
            resultData = await createTask(tenantId, parameters);
            break;
          case "complete_task":
            resultData = await completeTask(tenantId, parameters.task_id);
            break;
          case "get_schedule":
            resultData = await getSchedule(tenantId);
            break;
          case "create_checkin":
            resultData = await createCheckin(tenantId, parameters);
            break;
          case "toggle_checkin":
            resultData = await toggleCheckin(
              tenantId,
              parameters.checkin_name,
              parameters.enabled,
            );
            break;
          default:
            resultData = { error: `Unknown function: ${functionName}` };
        }

        logger.info(`[VoiceTools] Result for ${functionName}:`, resultData);

        // Convert result to string
        const resultString =
          typeof resultData === "string"
            ? resultData
            : JSON.stringify(resultData);
        results.push({
          toolCallId: toolCallId,
          result: resultString,
        });
      }

      return NextResponse.json({ results });
    }

    // Handle other message types (transcript, end-of-call, etc.)
    if (message?.type === "end-of-call-report") {
      logger.info("[VoiceTools] Call ended:", message);
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("[VoiceTools] Handler error:", error);
    return NextResponse.json(
      { result: { error: "Tool execution failed" } },
      { status: 500 },
    );
  }
});

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin":
        process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
