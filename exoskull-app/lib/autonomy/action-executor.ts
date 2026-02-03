/**
 * Action Executor
 *
 * Executes autonomous actions after permission check.
 * Handles routing to appropriate services (SMS, email, tasks, etc.)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  ActionType,
  ActionRequest,
  ActionResult,
  ActionDefinition,
  PermissionCategory,
} from './types'
import { getPermissionModel, isActionPermitted } from './permission-model'

// ============================================================================
// ACTION DEFINITIONS
// ============================================================================

const ACTION_DEFINITIONS: Record<ActionType, ActionDefinition> = {
  send_sms: {
    type: 'send_sms',
    name: 'Send SMS',
    description: 'Send an SMS message',
    requiredParams: ['to', 'message'],
    optionalParams: ['scheduledFor'],
    category: 'communication',
    riskLevel: 'medium',
  },
  send_email: {
    type: 'send_email',
    name: 'Send Email',
    description: 'Send an email',
    requiredParams: ['to', 'subject', 'body'],
    optionalParams: ['cc', 'bcc', 'replyTo'],
    category: 'communication',
    riskLevel: 'medium',
  },
  create_task: {
    type: 'create_task',
    name: 'Create Task',
    description: 'Create a new task',
    requiredParams: ['title'],
    optionalParams: ['description', 'dueDate', 'priority', 'labels'],
    category: 'tasks',
    riskLevel: 'low',
  },
  complete_task: {
    type: 'complete_task',
    name: 'Complete Task',
    description: 'Mark a task as complete',
    requiredParams: ['taskId'],
    optionalParams: ['notes'],
    category: 'tasks',
    riskLevel: 'low',
  },
  create_event: {
    type: 'create_event',
    name: 'Create Calendar Event',
    description: 'Create a new calendar event',
    requiredParams: ['title', 'startTime'],
    optionalParams: ['endTime', 'description', 'location', 'attendees'],
    category: 'calendar',
    riskLevel: 'medium',
  },
  send_notification: {
    type: 'send_notification',
    name: 'Send Notification',
    description: 'Send a push notification',
    requiredParams: ['title', 'body'],
    optionalParams: ['data', 'imageUrl', 'actionUrl'],
    category: 'communication',
    riskLevel: 'low',
  },
  log_health: {
    type: 'log_health',
    name: 'Log Health Data',
    description: 'Log health metrics',
    requiredParams: ['metricType', 'value'],
    optionalParams: ['unit', 'notes', 'timestamp'],
    category: 'health',
    riskLevel: 'low',
  },
  trigger_checkin: {
    type: 'trigger_checkin',
    name: 'Trigger Check-in',
    description: 'Trigger a user check-in',
    requiredParams: ['checkinType'],
    optionalParams: ['message', 'questions'],
    category: 'communication',
    riskLevel: 'low',
  },
  run_automation: {
    type: 'run_automation',
    name: 'Run Automation',
    description: 'Run a custom automation',
    requiredParams: ['automationId'],
    optionalParams: ['params'],
    category: 'other',
    riskLevel: 'high',
  },
  custom: {
    type: 'custom',
    name: 'Custom Action',
    description: 'Execute a custom action',
    requiredParams: ['actionName'],
    optionalParams: ['params'],
    category: 'other',
    riskLevel: 'high',
  },
}

// ============================================================================
// ACTION EXECUTOR CLASS
// ============================================================================

export class ActionExecutor {
  private supabase: SupabaseClient

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  // ============================================================================
  // MAIN EXECUTION
  // ============================================================================

  /**
   * Execute an action with permission check
   */
  async execute(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now()

    try {
      // Validate action type
      const definition = ACTION_DEFINITIONS[request.type]
      if (!definition) {
        return {
          success: false,
          actionType: request.type,
          error: `Unknown action type: ${request.type}`,
          durationMs: Date.now() - startTime,
        }
      }

      // Validate required params
      const missingParams = definition.requiredParams.filter(
        (p) => request.params[p] === undefined
      )
      if (missingParams.length > 0) {
        return {
          success: false,
          actionType: request.type,
          error: `Missing required params: ${missingParams.join(', ')}`,
          durationMs: Date.now() - startTime,
        }
      }

      // Check permission (unless explicitly skipped for internal actions)
      if (!request.skipPermissionCheck) {
        const actionPattern = this.getActionPattern(request)
        const permitted = await isActionPermitted(request.tenantId, actionPattern)

        if (!permitted) {
          console.log(`[ActionExecutor] Action denied: ${actionPattern} for tenant ${request.tenantId}`)
          return {
            success: false,
            actionType: request.type,
            error: `Action not permitted: ${actionPattern}`,
            durationMs: Date.now() - startTime,
          }
        }
      }

      // Execute the action
      const result = await this.executeAction(request)

      // Log execution
      await this.logExecution(request, result)

      return {
        ...result,
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[ActionExecutor] Error executing ${request.type}:`, error)

      // Record error for circuit breaker
      if (!request.skipPermissionCheck) {
        const permissionModel = getPermissionModel()
        await permissionModel.recordError(
          request.tenantId,
          this.getActionPattern(request),
          errorMessage
        )
      }

      return {
        success: false,
        actionType: request.type,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Execute multiple actions
   */
  async executeBatch(requests: ActionRequest[]): Promise<ActionResult[]> {
    return Promise.all(requests.map((r) => this.execute(r)))
  }

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  private async executeAction(request: ActionRequest): Promise<ActionResult> {
    switch (request.type) {
      case 'send_sms':
        return this.handleSendSms(request)
      case 'send_email':
        return this.handleSendEmail(request)
      case 'create_task':
        return this.handleCreateTask(request)
      case 'complete_task':
        return this.handleCompleteTask(request)
      case 'create_event':
        return this.handleCreateEvent(request)
      case 'send_notification':
        return this.handleSendNotification(request)
      case 'log_health':
        return this.handleLogHealth(request)
      case 'trigger_checkin':
        return this.handleTriggerCheckin(request)
      case 'run_automation':
        return this.handleRunAutomation(request)
      case 'custom':
        return this.handleCustomAction(request)
      default:
        return {
          success: false,
          actionType: request.type,
          error: `Unhandled action type: ${request.type}`,
          durationMs: 0,
        }
    }
  }

  // ============================================================================
  // INDIVIDUAL HANDLERS
  // ============================================================================

  private async handleSendSms(request: ActionRequest): Promise<ActionResult> {
    const { to, message } = request.params as { to: string; message: string }

    // Use Twilio via API route
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/send-sms`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, message, tenantId: request.tenantId }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          actionType: 'send_sms',
          error: error.message || 'SMS send failed',
          durationMs: 0,
        }
      }

      const data = await response.json()
      return {
        success: true,
        actionType: 'send_sms',
        data: { messageSid: data.sid },
        durationMs: 0,
      }
    } catch (error) {
      return {
        success: false,
        actionType: 'send_sms',
        error: error instanceof Error ? error.message : 'SMS send failed',
        durationMs: 0,
      }
    }
  }

  private async handleSendEmail(request: ActionRequest): Promise<ActionResult> {
    const { to, subject, body } = request.params as {
      to: string
      subject: string
      body: string
    }

    // Use Google Workspace rig if connected
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/tools`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'email',
            tenant_id: request.tenantId,
            params: { action: 'send', to, subject, body },
          }),
        }
      )

      if (!response.ok) {
        throw new Error('Email send failed')
      }

      const data = await response.json()
      return {
        success: data.success,
        actionType: 'send_email',
        data: data.result,
        error: data.error,
        durationMs: 0,
      }
    } catch (error) {
      return {
        success: false,
        actionType: 'send_email',
        error: error instanceof Error ? error.message : 'Email send failed',
        durationMs: 0,
      }
    }
  }

  private async handleCreateTask(request: ActionRequest): Promise<ActionResult> {
    const { title, description, dueDate, priority, labels } = request.params as {
      title: string
      description?: string
      dueDate?: string
      priority?: string
      labels?: string[]
    }

    const { data, error } = await this.supabase
      .from('exo_tasks')
      .insert({
        tenant_id: request.tenantId,
        title,
        description: description || null,
        due_date: dueDate || null,
        priority: priority || 'medium',
        labels: labels || [],
        status: 'pending',
        source: 'autonomy',
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        actionType: 'create_task',
        error: error.message,
        durationMs: 0,
      }
    }

    return {
      success: true,
      actionType: 'create_task',
      data: { taskId: data.id, title: data.title },
      durationMs: 0,
    }
  }

  private async handleCompleteTask(request: ActionRequest): Promise<ActionResult> {
    const { taskId, notes } = request.params as { taskId: string; notes?: string }

    const { error } = await this.supabase
      .from('exo_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .eq('tenant_id', request.tenantId)

    if (error) {
      return {
        success: false,
        actionType: 'complete_task',
        error: error.message,
        durationMs: 0,
      }
    }

    return {
      success: true,
      actionType: 'complete_task',
      data: { taskId },
      durationMs: 0,
    }
  }

  private async handleCreateEvent(request: ActionRequest): Promise<ActionResult> {
    const { title, startTime, endTime, description, location } = request.params as {
      title: string
      startTime: string
      endTime?: string
      description?: string
      location?: string
    }

    // Use Google Calendar via tools API
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/tools`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'calendar',
            tenant_id: request.tenantId,
            params: {
              action: 'create_event',
              title,
              startTime,
              endTime: endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
              description,
              location,
            },
          }),
        }
      )

      const data = await response.json()
      return {
        success: data.success,
        actionType: 'create_event',
        data: data.result,
        error: data.error,
        durationMs: 0,
      }
    } catch (error) {
      return {
        success: false,
        actionType: 'create_event',
        error: error instanceof Error ? error.message : 'Event creation failed',
        durationMs: 0,
      }
    }
  }

  private async handleSendNotification(request: ActionRequest): Promise<ActionResult> {
    const { title, body, data: notificationData } = request.params as {
      title: string
      body: string
      data?: Record<string, unknown>
    }

    // Store notification in database for delivery
    const { data, error } = await this.supabase
      .from('user_impulse_state')
      .update({
        pending_alerts: this.supabase.rpc('append_json_array', {
          arr: [
            {
              type: 'notification',
              title,
              body,
              data: notificationData || {},
              created_at: new Date().toISOString(),
            },
          ],
        }),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', request.tenantId)

    // If no impulse state, create one
    if (error?.code === 'PGRST116') {
      await this.supabase.from('user_impulse_state').insert({
        user_id: request.tenantId,
        pending_alerts: [
          {
            type: 'notification',
            title,
            body,
            data: notificationData || {},
            created_at: new Date().toISOString(),
          },
        ],
      })
    }

    return {
      success: true,
      actionType: 'send_notification',
      data: { queued: true },
      durationMs: 0,
    }
  }

  private async handleLogHealth(request: ActionRequest): Promise<ActionResult> {
    const { metricType, value, unit, notes, timestamp } = request.params as {
      metricType: string
      value: number
      unit?: string
      notes?: string
      timestamp?: string
    }

    const { data, error } = await this.supabase
      .from('exo_health_metrics')
      .insert({
        tenant_id: request.tenantId,
        metric_type: metricType,
        value,
        unit: unit || null,
        notes: notes || null,
        recorded_at: timestamp || new Date().toISOString(),
        source: 'autonomy',
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        actionType: 'log_health',
        error: error.message,
        durationMs: 0,
      }
    }

    return {
      success: true,
      actionType: 'log_health',
      data: { metricId: data.id },
      durationMs: 0,
    }
  }

  private async handleTriggerCheckin(request: ActionRequest): Promise<ActionResult> {
    const { checkinType, message, questions } = request.params as {
      checkinType: string
      message?: string
      questions?: string[]
    }

    // Create a check-in record
    const { data, error } = await this.supabase
      .from('exo_user_checkins')
      .insert({
        tenant_id: request.tenantId,
        checkin_type: checkinType,
        prompt_message: message || null,
        questions: questions || [],
        status: 'pending',
        triggered_by: 'autonomy',
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        actionType: 'trigger_checkin',
        error: error.message,
        durationMs: 0,
      }
    }

    return {
      success: true,
      actionType: 'trigger_checkin',
      data: { checkinId: data.id },
      durationMs: 0,
    }
  }

  private async handleRunAutomation(request: ActionRequest): Promise<ActionResult> {
    const { automationId, params } = request.params as {
      automationId: string
      params?: Record<string, unknown>
    }

    // TODO: Implement automation runner
    // For now, just log the attempt
    console.log(`[ActionExecutor] Automation ${automationId} triggered with params:`, params)

    return {
      success: true,
      actionType: 'run_automation',
      data: { automationId, status: 'triggered' },
      durationMs: 0,
    }
  }

  private async handleCustomAction(request: ActionRequest): Promise<ActionResult> {
    const { actionName, params } = request.params as {
      actionName: string
      params?: Record<string, unknown>
    }

    // Custom actions need specific handling
    console.log(`[ActionExecutor] Custom action ${actionName} with params:`, params)

    return {
      success: false,
      actionType: 'custom',
      error: `Custom action ${actionName} not implemented`,
      durationMs: 0,
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getActionPattern(request: ActionRequest): string {
    // Build action pattern for permission check
    // e.g., "send_sms:family" or just "create_task"
    const scope = request.params.scope as string | undefined
    if (scope) {
      return `${request.type}:${scope}`
    }
    return request.type
  }

  private async logExecution(request: ActionRequest, result: ActionResult): Promise<void> {
    try {
      await this.supabase.from('learning_events').insert({
        tenant_id: request.tenantId,
        event_type: 'agent_completed',
        data: {
          actionType: request.type,
          success: result.success,
          error: result.error,
          interventionId: request.interventionId,
        },
        agent_id: 'action-executor',
      })
    } catch (error) {
      console.error('[ActionExecutor] Failed to log execution:', error)
    }
  }

  /**
   * Get action definition
   */
  getActionDefinition(type: ActionType): ActionDefinition | undefined {
    return ACTION_DEFINITIONS[type]
  }

  /**
   * Get all action definitions
   */
  getAllActionDefinitions(): ActionDefinition[] {
    return Object.values(ACTION_DEFINITIONS)
  }

  /**
   * Get actions by category
   */
  getActionsByCategory(category: PermissionCategory): ActionDefinition[] {
    return Object.values(ACTION_DEFINITIONS).filter(
      (a) => a.category === category
    )
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let actionExecutorInstance: ActionExecutor | null = null

export function getActionExecutor(): ActionExecutor {
  if (!actionExecutorInstance) {
    actionExecutorInstance = new ActionExecutor()
  }
  return actionExecutorInstance
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute an action
 */
export async function executeAction(request: ActionRequest): Promise<ActionResult> {
  const executor = getActionExecutor()
  return executor.execute(request)
}

/**
 * Execute multiple actions
 */
export async function executeActions(requests: ActionRequest[]): Promise<ActionResult[]> {
  const executor = getActionExecutor()
  return executor.executeBatch(requests)
}
