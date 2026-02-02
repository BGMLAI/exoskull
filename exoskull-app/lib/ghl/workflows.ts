/**
 * GHL Workflows Library
 *
 * Workflow automation via GHL API:
 * - Trigger workflows
 * - Get workflow status
 * - Workflow analytics
 */

import { GHLClient, ghlRateLimiter } from './client'

export interface Workflow {
  id: string
  locationId: string
  name: string
  status: 'draft' | 'published'
  version?: number
  createdAt?: string
  updatedAt?: string
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  contactId: string
  status: 'active' | 'completed' | 'failed' | 'stopped'
  startedAt: string
  completedAt?: string
  currentStep?: string
  error?: string
}

/**
 * Get all workflows
 */
export async function getWorkflows(
  client: GHLClient
): Promise<{ workflows: Workflow[] }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ workflows: Workflow[] }>('/workflows/', { locationId })
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(
  client: GHLClient,
  workflowId: string
): Promise<{ workflow: Workflow }> {
  await ghlRateLimiter.throttle()
  return client.get<{ workflow: Workflow }>(`/workflows/${workflowId}`)
}

/**
 * Add contact to workflow (trigger workflow for contact)
 */
export async function addContactToWorkflow(
  client: GHLClient,
  workflowId: string,
  contactId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()

  return client.post<{ success: boolean }>(`/contacts/${contactId}/workflow/${workflowId}`, {})
}

/**
 * Remove contact from workflow
 */
export async function removeContactFromWorkflow(
  client: GHLClient,
  workflowId: string,
  contactId: string
): Promise<{ success: boolean }> {
  await ghlRateLimiter.throttle()
  return client.delete<{ success: boolean }>(`/contacts/${contactId}/workflow/${workflowId}`)
}

/**
 * Get workflow by name
 */
export async function getWorkflowByName(
  client: GHLClient,
  name: string
): Promise<Workflow | null> {
  const { workflows } = await getWorkflows(client)
  return workflows.find(w => w.name.toLowerCase() === name.toLowerCase()) || null
}

/**
 * Trigger workflow by name for a contact
 */
export async function triggerWorkflowByName(
  client: GHLClient,
  workflowName: string,
  contactId: string
): Promise<{ success: boolean; workflowId?: string; error?: string }> {
  const workflow = await getWorkflowByName(client, workflowName)

  if (!workflow) {
    return { success: false, error: `Workflow "${workflowName}" not found` }
  }

  if (workflow.status !== 'published') {
    return { success: false, error: `Workflow "${workflowName}" is not published` }
  }

  const result = await addContactToWorkflow(client, workflow.id, contactId)
  return { success: result.success, workflowId: workflow.id }
}

// ============================================
// Predefined ExoSkull Workflows
// ============================================

/**
 * ExoSkull predefined workflow names
 */
export const EXOSKULL_WORKFLOWS = {
  // Onboarding
  WELCOME_SEQUENCE: 'ExoSkull - Welcome Sequence',
  DISCOVERY_CALL: 'ExoSkull - Schedule Discovery Call',

  // Engagement
  RE_ENGAGEMENT: 'ExoSkull - Re-Engagement',
  CHECK_IN: 'ExoSkull - Check-In Sequence',

  // Health & Wellness
  SLEEP_RECOVERY: 'ExoSkull - Sleep Recovery',
  STRESS_MANAGEMENT: 'ExoSkull - Stress Management',

  // Productivity
  TASK_REMINDER: 'ExoSkull - Task Reminder',
  GOAL_CHECK_IN: 'ExoSkull - Goal Check-In',

  // Social
  SOCIAL_RECONNECTION: 'ExoSkull - Social Reconnection',
  BIRTHDAY_REMINDER: 'ExoSkull - Birthday Reminder',

  // Alerts
  URGENT_ALERT: 'ExoSkull - Urgent Alert',
  GENTLE_NUDGE: 'ExoSkull - Gentle Nudge',
} as const

export type ExoSkullWorkflowKey = keyof typeof EXOSKULL_WORKFLOWS

/**
 * Trigger predefined ExoSkull workflow
 */
export async function triggerExoSkullWorkflow(
  client: GHLClient,
  workflowKey: ExoSkullWorkflowKey,
  contactId: string
): Promise<{ success: boolean; workflowId?: string; error?: string }> {
  const workflowName = EXOSKULL_WORKFLOWS[workflowKey]
  return triggerWorkflowByName(client, workflowName, contactId)
}

/**
 * Trigger workflow based on ExoSkull event
 */
export async function triggerWorkflowForEvent(
  client: GHLClient,
  event: string,
  contactId: string
): Promise<{ success: boolean; workflowId?: string; triggered?: string }> {
  // Map ExoSkull events to workflows
  const eventWorkflowMap: Record<string, ExoSkullWorkflowKey> = {
    // Sleep events
    'sleep_debt_high': 'SLEEP_RECOVERY',
    'sleep_quality_low': 'SLEEP_RECOVERY',

    // Stress events
    'stress_detected': 'STRESS_MANAGEMENT',
    'mood_declining': 'CHECK_IN',

    // Engagement events
    'inactive_7_days': 'RE_ENGAGEMENT',
    'inactive_30_days': 'RE_ENGAGEMENT',

    // Social events
    'no_social_30_days': 'SOCIAL_RECONNECTION',
    'isolation_detected': 'SOCIAL_RECONNECTION',

    // Task events
    'task_overdue_3_days': 'TASK_REMINDER',
    'goal_behind': 'GOAL_CHECK_IN',

    // Lifecycle events
    'new_user': 'WELCOME_SEQUENCE',
    'onboarding_incomplete': 'DISCOVERY_CALL',
  }

  const workflowKey = eventWorkflowMap[event]

  if (!workflowKey) {
    return { success: false, triggered: undefined }
  }

  const result = await triggerExoSkullWorkflow(client, workflowKey, contactId)
  return {
    ...result,
    triggered: EXOSKULL_WORKFLOWS[workflowKey],
  }
}

/**
 * Check if contact is in any active workflow
 */
export async function isContactInWorkflow(
  client: GHLClient,
  contactId: string,
  workflowId?: string
): Promise<boolean> {
  // GHL doesn't have a direct API for this, so we check contact's campaign/workflow status
  // This is a placeholder - actual implementation depends on GHL's API capabilities
  // For now, return false to allow workflow triggering
  return false
}

/**
 * Batch trigger workflow for multiple contacts
 */
export async function batchTriggerWorkflow(
  client: GHLClient,
  workflowId: string,
  contactIds: string[]
): Promise<{ success: number; failed: number; errors: Array<{ contactId: string; error: string }> }> {
  let success = 0
  let failed = 0
  const errors: Array<{ contactId: string; error: string }> = []

  for (const contactId of contactIds) {
    try {
      await addContactToWorkflow(client, workflowId, contactId)
      success++
    } catch (error) {
      failed++
      errors.push({
        contactId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { success, failed, errors }
}
