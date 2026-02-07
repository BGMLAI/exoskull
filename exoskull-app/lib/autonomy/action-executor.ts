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
  ActionDefinition,
  PermissionCategory,
} from "./types";
import { getPermissionModel, isActionPermitted } from "./permission-model";
import { makeOutboundCall } from "../voice/twilio-client";

import { logger } from "@/lib/logger";
// ============================================================================
// ACTION DEFINITIONS
// ============================================================================

const ACTION_DEFINITIONS: Record<ActionType, ActionDefinition> = {
  send_sms: {
    type: "send_sms",
    name: "Send SMS",
    description: "Send an SMS message",
    requiredParams: ["to", "message"],
    optionalParams: ["scheduledFor"],
    category: "communication",
    riskLevel: "medium",
  },
  send_email: {
    type: "send_email",
    name: "Send Email",
    description: "Send an email",
    requiredParams: ["to", "subject", "body"],
    optionalParams: ["cc", "bcc", "replyTo"],
    category: "communication",
    riskLevel: "medium",
  },
  create_task: {
    type: "create_task",
    name: "Create Task",
    description: "Create a new task",
    requiredParams: ["title"],
    optionalParams: ["description", "dueDate", "priority", "labels"],
    category: "tasks",
    riskLevel: "low",
  },
  complete_task: {
    type: "complete_task",
    name: "Complete Task",
    description: "Mark a task as complete",
    requiredParams: ["taskId"],
    optionalParams: ["notes"],
    category: "tasks",
    riskLevel: "low",
  },
  create_event: {
    type: "create_event",
    name: "Create Calendar Event",
    description: "Create a new calendar event",
    requiredParams: ["title", "startTime"],
    optionalParams: ["endTime", "description", "location", "attendees"],
    category: "calendar",
    riskLevel: "medium",
  },
  send_notification: {
    type: "send_notification",
    name: "Send Notification",
    description: "Send a push notification",
    requiredParams: ["title", "body"],
    optionalParams: ["data", "imageUrl", "actionUrl"],
    category: "communication",
    riskLevel: "low",
  },
  log_health: {
    type: "log_health",
    name: "Log Health Data",
    description: "Log health metrics",
    requiredParams: ["metricType", "value"],
    optionalParams: ["unit", "notes", "timestamp"],
    category: "health",
    riskLevel: "low",
  },
  trigger_checkin: {
    type: "trigger_checkin",
    name: "Trigger Check-in",
    description: "Trigger a user check-in",
    requiredParams: ["checkinType"],
    optionalParams: ["message", "questions"],
    category: "communication",
    riskLevel: "low",
  },
  run_automation: {
    type: "run_automation",
    name: "Run Automation",
    description: "Run a custom automation",
    requiredParams: ["automationId"],
    optionalParams: ["params"],
    category: "other",
    riskLevel: "high",
  },
  custom: {
    type: "custom",
    name: "Custom Action",
    description: "Execute a custom action",
    requiredParams: ["actionName"],
    optionalParams: ["params"],
    category: "other",
    riskLevel: "high",
  },
};

// ============================================================================
// ACTION EXECUTOR CLASS
// ============================================================================

export class ActionExecutor {
  private supabase: SupabaseClient;
  private customActionRegistry: Record<
    string,
    {
      description: string;
      handler: (
        tenantId: string,
        params: Record<string, unknown>,
      ) => Promise<{
        success: boolean;
        data?: unknown;
        error?: string;
      }>;
    }
  > = {};

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.initCustomActionRegistry();
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
      console.error(`[ActionExecutor] Error executing ${request.type}:`, error);

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

    // Use Twilio via API route
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

    // Use Google Workspace rig if connected
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

    const { data, error } = await this.supabase
      .from("exo_tasks")
      .insert({
        tenant_id: request.tenantId,
        title,
        description: description || null,
        due_date: dueDate || null,
        priority: priority || "medium",
        labels: labels || [],
        status: "pending",
        source: "autonomy",
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        actionType: "create_task",
        error: error.message,
        durationMs: 0,
      };
    }

    return {
      success: true,
      actionType: "create_task",
      data: { taskId: data.id, title: data.title },
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

    const { error } = await this.supabase
      .from("exo_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("tenant_id", request.tenantId);

    if (error) {
      return {
        success: false,
        actionType: "complete_task",
        error: error.message,
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

    // Use Google Calendar via tools API
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

    // Store notification in database for delivery
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

    // Create a check-in record
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
        console.error("[ActionExecutor] Automation not found:", {
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
        console.error("[ActionExecutor] Tenant mismatch for automation:", {
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
            console.error(
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
      console.error("[ActionExecutor] handleRunAutomation failed:", {
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
        console.error("[ActionExecutor] Unknown custom action:", {
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
      console.error("[ActionExecutor] handleCustomAction failed:", {
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
  // CUSTOM ACTION REGISTRY
  // ============================================================================

  private initCustomActionRegistry(): void {
    this.customActionRegistry = {
      toggle_automation: {
        description: "Enable or disable a custom scheduled job",
        handler: async (tenantId, params) => {
          const { automationId, enabled } = params as {
            automationId: string;
            enabled: boolean;
          };
          if (!automationId || enabled === undefined) {
            return {
              success: false,
              error: "Missing automationId or enabled parameter",
            };
          }
          const { data, error } = await this.supabase
            .from("exo_custom_scheduled_jobs")
            .update({ is_enabled: enabled })
            .eq("id", automationId)
            .eq("tenant_id", tenantId)
            .select("id, display_name, is_enabled")
            .single();
          if (error) return { success: false, error: error.message };
          if (!data)
            return {
              success: false,
              error: "Automation not found or not owned by tenant",
            };
          return {
            success: true,
            data: {
              automationId: data.id,
              displayName: data.display_name,
              enabled: data.is_enabled,
            },
          };
        },
      },

      adjust_schedule: {
        description: "Update schedule of a custom job (time, frequency, days)",
        handler: async (tenantId, params) => {
          const {
            automationId,
            time_of_day,
            schedule_type,
            days_of_week,
            day_of_month,
          } = params as {
            automationId: string;
            time_of_day?: string;
            schedule_type?: string;
            days_of_week?: number[];
            day_of_month?: number;
          };
          if (!automationId)
            return { success: false, error: "Missing automationId" };

          const updateData: Record<string, unknown> = {};
          if (time_of_day !== undefined) updateData.time_of_day = time_of_day;
          if (schedule_type !== undefined)
            updateData.schedule_type = schedule_type;
          if (days_of_week !== undefined)
            updateData.days_of_week = days_of_week;
          if (day_of_month !== undefined)
            updateData.day_of_month = day_of_month;

          if (Object.keys(updateData).length === 0) {
            return { success: false, error: "No schedule changes provided" };
          }

          const { data, error } = await this.supabase
            .from("exo_custom_scheduled_jobs")
            .update(updateData)
            .eq("id", automationId)
            .eq("tenant_id", tenantId)
            .select(
              "id, display_name, schedule_type, time_of_day, days_of_week",
            )
            .single();
          if (error) return { success: false, error: error.message };
          if (!data)
            return {
              success: false,
              error: "Automation not found or not owned by tenant",
            };
          return { success: true, data };
        },
      },

      set_quiet_hours: {
        description: "Update quiet hours in tenant schedule_settings",
        handler: async (tenantId, params) => {
          const { start, end } = params as { start?: string; end?: string };
          if (!start && !end) {
            return {
              success: false,
              error: "Provide start and/or end time (HH:MM format)",
            };
          }

          const { data: tenant, error: readError } = await this.supabase
            .from("exo_tenants")
            .select("schedule_settings")
            .eq("id", tenantId)
            .single();
          if (readError) return { success: false, error: readError.message };

          const settings =
            (tenant?.schedule_settings as Record<string, unknown>) || {};
          const quietHours = (settings.quiet_hours as Record<
            string,
            string
          >) || { start: "22:00", end: "07:00" };
          if (start) quietHours.start = start;
          if (end) quietHours.end = end;
          settings.quiet_hours = quietHours;

          const { error: updateError } = await this.supabase
            .from("exo_tenants")
            .update({ schedule_settings: settings })
            .eq("id", tenantId);
          if (updateError)
            return { success: false, error: updateError.message };
          return { success: true, data: { quiet_hours: quietHours } };
        },
      },

      update_preference: {
        description:
          "Update a user preference (language, timezone, or schedule setting)",
        handler: async (tenantId, params) => {
          const { key, value } = params as { key: string; value: unknown };
          if (!key) return { success: false, error: "Missing key parameter" };

          const scheduleKeys = [
            "skip_weekends",
            "notification_channels",
            "rate_limits",
          ];
          if (scheduleKeys.includes(key)) {
            const { data: tenant } = await this.supabase
              .from("exo_tenants")
              .select("schedule_settings")
              .eq("id", tenantId)
              .single();
            const settings =
              (tenant?.schedule_settings as Record<string, unknown>) || {};
            settings[key] = value;
            const { error } = await this.supabase
              .from("exo_tenants")
              .update({ schedule_settings: settings })
              .eq("id", tenantId);
            if (error) return { success: false, error: error.message };
            return { success: true, data: { key, value } };
          }

          const directKeys = ["language", "timezone", "name"];
          if (directKeys.includes(key)) {
            const { error } = await this.supabase
              .from("exo_tenants")
              .update({ [key]: value })
              .eq("id", tenantId);
            if (error) return { success: false, error: error.message };
            return { success: true, data: { key, value } };
          }

          return { success: false, error: `Unknown preference key: ${key}` };
        },
      },

      archive_completed_tasks: {
        description: "Archive completed tasks older than N days",
        handler: async (tenantId, params) => {
          const { olderThanDays } = params as { olderThanDays?: number };
          const cutoffDays = olderThanDays || 7;
          const cutoffDate = new Date(
            Date.now() - cutoffDays * 24 * 60 * 60 * 1000,
          ).toISOString();

          const { data, error } = await this.supabase
            .from("exo_tasks")
            .update({
              status: "archived",
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantId)
            .eq("status", "completed")
            .lt("completed_at", cutoffDate)
            .select("id");
          if (error) return { success: false, error: error.message };
          return {
            success: true,
            data: { archivedCount: data?.length || 0, cutoffDays },
          };
        },
      },
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getActionPattern(request: ActionRequest): string {
    // Build action pattern for permission check
    // e.g., "send_sms:family" or just "create_task"
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
      console.error("[ActionExecutor] Failed to log execution:", error);
    }
  }

  /**
   * Get action definition
   */
  getActionDefinition(type: ActionType): ActionDefinition | undefined {
    return ACTION_DEFINITIONS[type];
  }

  /**
   * Get all action definitions
   */
  getAllActionDefinitions(): ActionDefinition[] {
    return Object.values(ACTION_DEFINITIONS);
  }

  /**
   * Get actions by category
   */
  getActionsByCategory(category: PermissionCategory): ActionDefinition[] {
    return Object.values(ACTION_DEFINITIONS).filter(
      (a) => a.category === category,
    );
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let actionExecutorInstance: ActionExecutor | null = null;

export function getActionExecutor(): ActionExecutor {
  if (!actionExecutorInstance) {
    actionExecutorInstance = new ActionExecutor();
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
