// =====================================================
// TASK TOOL - Wrapper around TaskManagerExecutor
// =====================================================

import {
  ExoTool,
  ToolHandler,
  ToolResult,
  stringParam,
  numberParam,
} from "./types";
import { TaskManagerExecutor } from "../mods/executors/task-manager";

// =====================================================
// TOOL DEFINITION
// =====================================================

export const taskTool: ExoTool = {
  name: "task",
  description:
    "Manage tasks across all connected sources (Google Tasks, Todoist, Notion, ExoSkull). Get tasks, create new ones, complete or update existing tasks.",
  parameters: {
    type: "object",
    properties: {
      action: stringParam("Action to perform", {
        enum: [
          "get_tasks",
          "create_task",
          "complete_task",
          "update_priority",
          "get_overdue",
        ],
      }),
      title: stringParam("Task title (for create_task)"),
      description: stringParam("Task description (for create_task)"),
      due_date: stringParam("Due date in YYYY-MM-DD format (for create_task)"),
      priority: stringParam("Task priority", {
        enum: ["low", "medium", "high", "urgent"],
        default: "medium",
      }),
      source: stringParam("Task source", {
        enum: ["exoskull", "google", "todoist", "notion"],
        default: "exoskull",
      }),
      task_id: stringParam("Task ID (for complete_task, update_priority)"),
      limit: numberParam("Maximum number of tasks to return", { default: 20 }),
    },
    required: ["action"],
  },
};

// =====================================================
// HANDLER
// =====================================================

let _executor: TaskManagerExecutor | null = null;
function getExecutor() {
  if (!_executor) _executor = new TaskManagerExecutor();
  return _executor;
}

export const taskHandler: ToolHandler = async (
  context,
  params,
): Promise<ToolResult> => {
  const {
    action,
    title,
    description,
    due_date,
    priority,
    source,
    task_id,
    limit,
  } = params as {
    action: string;
    title?: string;
    description?: string;
    due_date?: string;
    priority?: string;
    source?: string;
    task_id?: string;
    limit?: number;
  };

  try {
    switch (action) {
      case "get_tasks": {
        const data = await getExecutor().getData(context.tenant_id);
        const tasks = (data.tasks as unknown[]) || [];
        const limitedTasks = tasks.slice(0, limit || 20);
        return {
          success: true,
          result: {
            tasks: limitedTasks,
            total: tasks.length,
            sources: data.sources || [],
          },
        };
      }

      case "get_overdue": {
        const data = await getExecutor().getData(context.tenant_id);
        const tasks = (data.tasks as { due?: string; status?: string }[]) || [];
        const today = new Date().toISOString().split("T")[0];
        const overdue = tasks.filter(
          (t) => t.due && t.due < today && t.status !== "completed",
        );
        return {
          success: true,
          result: {
            overdue_tasks: overdue.slice(0, limit || 20),
            total: overdue.length,
          },
        };
      }

      case "create_task": {
        if (!title) {
          return { success: false, error: "Task title is required" };
        }

        const result = await getExecutor().executeAction(
          context.tenant_id,
          "create_task",
          {
            title,
            description,
            due_date,
            priority: priority || "medium",
            source: source || "exoskull",
          },
        );

        return result;
      }

      case "complete_task": {
        if (!task_id) {
          return { success: false, error: "Task ID is required" };
        }

        const result = await getExecutor().executeAction(
          context.tenant_id,
          "complete_task",
          {
            task_id,
            source: source || "exoskull",
          },
        );

        return result;
      }

      case "update_priority": {
        if (!task_id || !priority) {
          return { success: false, error: "Task ID and priority are required" };
        }

        const result = await getExecutor().executeAction(
          context.tenant_id,
          "update_priority",
          {
            task_id,
            priority,
            source: source || "exoskull",
          },
        );

        return result;
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    console.error("[TaskTool] Error:", {
      action,
      tenant_id: context.tenant_id,
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};
