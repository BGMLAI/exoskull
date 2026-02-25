/**
 * Action Executor
 *
 * Executes autonomous actions after permission check.
 * Handles routing to appropriate services (SMS, email, tasks, etc.)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  ActionType,
  ActionRequest,
  ActionResult,
  PermissionCategory,
} from "./types";
import { getPermissionModel, isActionPermitted } from "./permission-model";
import { makeOutboundCall } from "../voice/twilio-client";
import {
  ACTION_DEFINITIONS,
  getActionDefinition,
  getAllActionDefinitions,
  getActionsByCategory,
} from "./action-definitions";
import {
  buildCustomActionRegistry,
  CustomActionEntry,
} from "./custom-action-registry";

import { logger } from "@/lib/logger";

// ============================================================================
// ACTION EXECUTOR CLASS
// ============================================================================

export class ActionExecutor {
  private supabase: SupabaseClient;
  private customActionRegistry: Record<string, CustomActionEntry>;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase =
      supabaseClient ||
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
    this.customActionRegistry = buildCustomActionRegistry(this.supabase);
  }

  // ============================================================================
  // MAIN EXECUTION
  // ============================================================================

  /**
   * Execute an action with permission check
   */
  async execute(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      // Validate action type
      const definition = ACTION_DEFINITIONS[request.type];
      if (!definition) {
        return {
          success: false,
          actionType: request.type,
          error: `Unknown action type: ${request.type}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Validate required params
      const missingParams = definition.requiredParams.filter(
        (p) => request.params[p] === undefined,
      );
      if (missingParams.length > 0) {
        return {
          success: false,
          actionType: request.type,
          error: `Missing required params: ${missingParams.join(", ")}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Check permission (unless explicitly skipped for internal actions)
      if (!request.skipPermissionCheck) {
        const actionPattern = this.getActionPattern(request);
        const permitted = await isActionPermitted(
          request.tenantId,
          actionPattern,
        );

        if (!permitted) {
          logger.info(
            `[ActionExecutor] Action denied: ${actionPattern} for tenant ${request.tenantId}`,
          );
          return {
            success: false,
            actionType: request.type,
            error: `Action not permitted: ${actionPattern}`,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // Execute the action
      const result = await this.executeAction(request);

      // Log execution
      await this.logExecution(request, result);

      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`[ActionExecutor] Error executing ${request.type}:`, error);

      // Record error for circuit breaker
      if (!request.skipPermissionCheck) {
        const permissionModel = getPermissionModel();
        await permissionModel.recordError(
          request.tenantId,
          this.getActionPattern(request),
          errorMessage,
        );
      }

      return {
        success: false,
        actionType: request.type,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple actions
   */
  async executeBatch(requests: ActionRequest[]): Promise<ActionResult[]> {
    return Promise.all(requests.map((r) => this.execute(r)));
  }

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  private async executeAction(request: ActionRequest): Promise<ActionResult> {
    switch (request.type) {
      case "send_sms":
        return this.handleSendSms(request);
      case "send_email":
        return this.handleSendEmail(request);
      case "create_task":
        return this.handleCreateTask(request);
      case "complete_task":
        return this.handleCompleteTask(request);
      case "create_event":
        return this.handleCreateEvent(request);
      case "send_notification":
        return this.handleSendNotification(request);
      case "log_health":
        return this.handleLogHealth(request);
      case "trigger_checkin":
        return this.handleTriggerCheckin(request);
      case "run_automation":
        return this.handleRunAutomation(request);
      case "build_app":
        return this.handleBuildApp(request);
      case "custom":
        return this.handleCustomAction(request);
      default:
        return {
          success: false,
          actionType: request.type,
          error: `Unhandled action type: ${request.type}`,
          durationMs: 0,
        };
    }
  }

  // ============================================================================
  // INDIVIDUAL HANDLERS
  // ============================================================================

  private async handleSendSms(request: ActionRequest): Promise<ActionResult> {
    const { to, message } = request.params as { to: string; message: string };

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/send-sms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, message, tenantId: request.tenantId }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          actionType: "send_sms",
          error: error.message || "SMS send failed",
          durationMs: 0,
        };
      }

      const data = await response.json();
      return {
        success: true,
        actionType: "send_sms",
        data: { messageSid: data.sid },
        durationMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        actionType: "send_sms",
        error: error instanceof Error ? error.message : "SMS send failed",
        durationMs: 0,
      };
    }
  }

  private async handleSendEmail(request: ActionRequest): Promise<ActionResult> {
    const { to, subject, body } = request.params as {
      to: string;
      subject: string;
      body: string;
    };

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/tools`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: "email",
            tenant_id: request.tenantId,
            params: { action: "send", to, subject, body },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Email send failed");
      }

      const data = await response.json();
      return {
        success: data.success,
        actionType: "send_email",
        data: data.result,
        error: data.error,
        durationMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        actionType: "send_email",
        error: error instanceof Error ? error.message : "Email send failed",
        durationMs: 0,
      };
    }
  }

  private async handleCreateTask(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const { title, description, dueDate, priority, labels } =
      request.params as {
        title: string;
        description?: string;
        dueDate?: string;
        priority?: string;
        labels?: string[];
      };

    // Use dual-write task service (dynamic import to avoid circular dep)
    const { createTask } = await import("@/lib/tasks/task-service");
    const priorityMap: Record<string, 1 | 2 | 3 | 4> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };
    const taskResult = await createTask(request.tenantId, {
      title,
      description: description || null,
      due_date: dueDate || null,
      priority: priorityMap[priority || "medium"] || 3,
      status: "pending",
      context: { source: "autonomy", labels: labels || [] },
    });

    if (!taskResult.id) {
      return {
        success: false,
        actionType: "create_task",
        error: taskResult.error || "Failed to create task",
        durationMs: 0,
      };
    }

    if (!taskResult.dual_write_success) {
      logger.warn("[ActionExecutor] Task created but dual-write failed:", {
        taskId: taskResult.id,
        error: taskResult.error,
        tenantId: request.tenantId,
      });
    }

    return {
      success: true,
      actionType: "create_task",
      data: { taskId: taskResult.id, title },
      durationMs: 0,
    };
  }

  private async handleCompleteTask(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const { taskId, notes } = request.params as {
      taskId: string;
      notes?: string;
    };

    // Use dual-write task service (dynamic import to avoid circular dep)
    const { completeTask } = await import("@/lib/tasks/task-service");
    const { success, error } = await completeTask(taskId, request.tenantId);

    if (!success) {
      return {
        success: false,
        actionType: "complete_task",
        error: error || "Failed to complete task",
        durationMs: 0,
      };
    }

    return {
      success: true,
      actionType: "complete_task",
      data: { taskId },
      durationMs: 0,
    };
  }

  private async handleCreateEvent(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const { title, startTime, endTime, description, location } =
      request.params as {
        title: string;
        startTime: string;
        endTime?: string;
        description?: string;
        location?: string;
      };

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/tools`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: "calendar",
            tenant_id: request.tenantId,
            params: {
              action: "create_event",
              title,
              startTime,
              endTime:
                endTime ||
                new Date(
                  new Date(startTime).getTime() + 60 * 60 * 1000,
                ).toISOString(),
              description,
              location,
            },
          }),
        },
      );

      const data = await response.json();
      return {
        success: data.success,
        actionType: "create_event",
        data: data.result,
        error: data.error,
        durationMs: 0,
      };
    } catch (error) {
      return {
        success: false,
        actionType: "create_event",
        error: error instanceof Error ? error.message : "Event creation failed",
        durationMs: 0,
      };
    }
  }

  private async handleSendNotification(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const {
      title,
      body,
      data: notificationData,
    } = request.params as {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    };

    const { data, error } = await this.supabase
      .from("user_impulse_state")
      .update({
        pending_alerts: this.supabase.rpc("append_json_array", {
          arr: [
            {
              type: "notification",
              title,
              body,
              data: notificationData || {},
              created_at: new Date().toISOString(),
            },
          ],
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", request.tenantId);

    // If no impulse state, create one
    if (error?.code === "PGRST116") {
      await this.supabase.from("user_impulse_state").insert({
        user_id: request.tenantId,
        pending_alerts: [
          {
            type: "notification",
            title,
            body,
            data: notificationData || {},
            created_at: new Date().toISOString(),
          },
        ],
      });
    }

    return {
      success: true,
      actionType: "send_notification",
      data: { queued: true },
      durationMs: 0,
    };
  }

  private async handleLogHealth(request: ActionRequest): Promise<ActionResult> {
    const { metricType, value, unit, notes, timestamp } = request.params as {
      metricType: string;
      value: number;
      unit?: string;
      notes?: string;
      timestamp?: string;
    };

    const { data, error } = await this.supabase
      .from("exo_health_metrics")
      .insert({
        tenant_id: request.tenantId,
        metric_type: metricType,
        value,
        unit: unit || null,
        notes: notes || null,
        recorded_at: timestamp || new Date().toISOString(),
        source: "autonomy",
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        actionType: "log_health",
        error: error.message,
        durationMs: 0,
      };
    }

    return {
      success: true,
      actionType: "log_health",
      data: { metricId: data.id },
      durationMs: 0,
    };
  }

  private async handleTriggerCheckin(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const { checkinType, message, questions } = request.params as {
      checkinType: string;
      message?: string;
      questions?: string[];
    };

    const { data, error } = await this.supabase
      .from("exo_user_checkins")
      .insert({
        tenant_id: request.tenantId,
        checkin_type: checkinType,
        prompt_message: message || null,
        questions: questions || [],
        status: "pending",
        triggered_by: "autonomy",
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        actionType: "trigger_checkin",
        error: error.message,
        durationMs: 0,
      };
    }

    return {
      success: true,
      actionType: "trigger_checkin",
      data: { checkinId: data.id },
      durationMs: 0,
    };
  }

  private async handleRunAutomation(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const { automationId, params } = request.params as {
      automationId: string;
      params?: Record<string, unknown>;
    };

    try {
      // 1. Load automation
      const { data: automation, error: loadError } = await this.supabase
        .from("exo_custom_scheduled_jobs")
        .select("*")
        .eq("id", automationId)
        .single();

      if (loadError || !automation) {
        logger.error("[ActionExecutor] Automation not found:", {
          automationId,
          error: loadError?.message,
        });
        return {
          success: false,
          actionType: "run_automation",
          error: `Automation not found: ${automationId}`,
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Verify tenant ownership
      if (automation.tenant_id !== request.tenantId) {
        logger.error("[ActionExecutor] Tenant mismatch for automation:", {
          automationId,
          automationTenant: automation.tenant_id,
          requestTenant: request.tenantId,
        });
        return {
          success: false,
          actionType: "run_automation",
          error: "Automation does not belong to this tenant",
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Check if enabled
      if (!automation.is_enabled) {
        return {
          success: false,
          actionType: "run_automation",
          error: `Automation "${automation.display_name}" is disabled`,
          durationMs: Date.now() - startTime,
        };
      }

      // 4. Fetch tenant contact info
      const { data: tenant } = await this.supabase
        .from("exo_tenants")
        .select("phone, email, name")
        .eq("id", request.tenantId)
        .single();

      if (!tenant?.phone && !tenant?.email) {
        return {
          success: false,
          actionType: "run_automation",
          error: "No contact method available for tenant",
          durationMs: Date.now() - startTime,
        };
      }

      // 5. Resolve message and channel
      const messageContent =
        (params?.message as string) ||
        automation.message_template ||
        `Przypomnienie: ${automation.display_name}`;
      const channel =
        (params?.channel as string) || automation.channel || "sms";

      // 6. Dispatch
      let channelResult: {
        success: boolean;
        data?: Record<string, unknown>;
        error?: string;
      };

      if (channel === "voice" && tenant?.phone) {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";
        try {
          const callResult = await makeOutboundCall({
            to: tenant.phone,
            webhookUrl: `${baseUrl}/api/twilio/voice?action=start&tenant_id=${request.tenantId}&job_type=${automation.job_type || "custom"}`,
            statusCallbackUrl: `${baseUrl}/api/twilio/status`,
            timeout: 30,
          });
          channelResult = {
            success: true,
            data: { callSid: callResult.callSid, channel: "voice" },
          };
        } catch (callError) {
          channelResult = {
            success: false,
            error:
              callError instanceof Error
                ? callError.message
                : "Voice call failed",
          };
        }
      } else if (tenant?.phone) {
        // Default to SMS
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/send-sms`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: tenant.phone,
                message: messageContent,
                tenantId: request.tenantId,
              }),
            },
          );
          const responseData = await response.json();
          channelResult = response.ok
            ? {
                success: true,
                data: { messageSid: responseData.sid, channel: "sms" },
              }
            : {
                success: false,
                error:
                  responseData.message ||
                  responseData.error ||
                  "SMS send failed",
              };
        } catch (smsError) {
          channelResult = {
            success: false,
            error:
              smsError instanceof Error ? smsError.message : "SMS send failed",
          };
        }
      } else {
        channelResult = {
          success: false,
          error: `Channel "${channel}" not available — no phone number on file`,
        };
      }

      // 7. Log execution
      await this.supabase
        .from("exo_custom_job_logs")
        .insert({
          job_id: automationId,
          tenant_id: request.tenantId,
          status: channelResult.success ? "completed" : "failed",
          channel_used: channel,
          result: channelResult.data || null,
          error_message: channelResult.error || null,
        })
        .then(({ error: logError }) => {
          if (logError) {
            logger.error(
              "[ActionExecutor] Failed to log automation execution:",
              {
                automationId,
                error: logError.message,
              },
            );
          }
        });

      // 8. Update last_executed_at on success
      if (channelResult.success) {
        await this.supabase
          .from("exo_custom_scheduled_jobs")
          .update({ last_executed_at: new Date().toISOString() })
          .eq("id", automationId);
      }

      // 9. Return result
      if (!channelResult.success) {
        return {
          success: false,
          actionType: "run_automation",
          error: channelResult.error,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        actionType: "run_automation",
        data: {
          automationId,
          automationName: automation.display_name,
          channel,
          ...channelResult.data,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[ActionExecutor] handleRunAutomation failed:", {
        automationId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        success: false,
        actionType: "run_automation",
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async handleBuildApp(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now();
    const { appType, reason, description, suggestedFeatures } =
      request.params as {
        appType?: string;
        reason?: string;
        description?: string;
        suggestedFeatures?: string[];
      };

    const appDescription =
      description || reason || appType || "Custom app requested by autonomy";

    try {
      const { generateApp } =
        await import("@/lib/apps/generator/app-generator");
      const result = await generateApp({
        tenant_id: request.tenantId,
        description: appDescription,
        source: "auto_detection",
      });

      if (!result.success) {
        return {
          success: false,
          actionType: "build_app" as ActionType,
          error: result.error || "App generation failed",
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        actionType: "build_app" as ActionType,
        data: {
          appId: result.app?.id,
          slug: result.app?.slug,
          name: result.app?.name,
          status: result.app?.status,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        actionType: "build_app" as ActionType,
        error: error instanceof Error ? error.message : "Build app failed",
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async handleCustomAction(
    request: ActionRequest,
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const { actionName, params } = request.params as {
      actionName: string;
      params?: Record<string, unknown>;
    };

    try {
      const registeredAction = this.customActionRegistry[actionName];

      if (!registeredAction) {
        const availableActions = Object.keys(this.customActionRegistry).join(
          ", ",
        );
        logger.error("[ActionExecutor] Unknown custom action:", {
          actionName,
          availableActions,
        });
        return {
          success: false,
          actionType: "custom",
          error: `Unknown custom action: "${actionName}". Available: ${availableActions}`,
          durationMs: Date.now() - startTime,
        };
      }

      const result = await registeredAction.handler(
        request.tenantId,
        params || {},
      );

      if (!result.success) {
        return {
          success: false,
          actionType: "custom",
          error: result.error,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        actionType: "custom",
        data: {
          actionName,
          ...(result.data && typeof result.data === "object"
            ? (result.data as Record<string, unknown>)
            : { result: result.data }),
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("[ActionExecutor] handleCustomAction failed:", {
        actionName,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        success: false,
        actionType: "custom",
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getActionPattern(request: ActionRequest): string {
    const scope = request.params.scope as string | undefined;
    if (scope) {
      return `${request.type}:${scope}`;
    }
    return request.type;
  }

  private async logExecution(
    request: ActionRequest,
    result: ActionResult,
  ): Promise<void> {
    try {
      await this.supabase.from("learning_events").insert({
        tenant_id: request.tenantId,
        event_type: "agent_completed",
        data: {
          actionType: request.type,
          success: result.success,
          error: result.error,
          interventionId: request.interventionId,
        },
        agent_id: "action-executor",
      });
    } catch (error) {
      logger.error("[ActionExecutor] Failed to log execution:", error);
    }
  }

  /**
   * Get action definition
   */
  getActionDefinition(type: ActionType) {
    return getActionDefinition(type);
  }

  /**
   * Get all action definitions
   */
  getAllActionDefinitions() {
    return getAllActionDefinitions();
  }

  /**
   * Get actions by category
   */
  getActionsByCategory(category: PermissionCategory) {
    return getActionsByCategory(category);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let actionExecutorInstance: ActionExecutor | null = null;

export function getActionExecutor(
  supabaseClient?: SupabaseClient,
): ActionExecutor {
  if (!actionExecutorInstance) {
    actionExecutorInstance = new ActionExecutor(supabaseClient);
  }
  return actionExecutorInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute an action
 */
export async function executeAction(
  request: ActionRequest,
): Promise<ActionResult> {
  const executor = getActionExecutor();
  return executor.execute(request);
}

/**
 * Execute multiple actions
 */
export async function executeActions(
  requests: ActionRequest[],
): Promise<ActionResult[]> {
  const executor = getActionExecutor();
  return executor.executeBatch(requests);
}
