/**
 * Autonomy Executor
 *
 * Executes approved interventions from the queue.
 * Dispatches action_type to appropriate handler (GHL messaging, calls, tasks).
 *
 * Called by:
 * 1. Cron job (/api/cron/intervention-executor) for auto-execution after timeout
 * 2. Direct approval flow when user says "działaj" / "ok"
 */

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { makeOutboundCall } from '../voice/twilio-client'
import { appendMessage } from '../unified-thread'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+48732144112'
const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://exoskull.xyz'

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ============================================================================
// TYPES
// ============================================================================

interface Intervention {
  id: string
  tenant_id: string
  intervention_type: string
  title: string
  description: string | null
  action_payload: Record<string, unknown>
  priority: string
  status: string
  scheduled_for: string | null
  retry_count: number
  max_retries: number
}

interface QueueItem {
  id: string
  intervention_id: string
  tenant_id: string
  priority: number
  scheduled_at: string
  attempts: number
}

export interface ExecutionResult {
  success: boolean
  message: string
  error?: string
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a single intervention by ID.
 */
export async function executeIntervention(interventionId: string): Promise<ExecutionResult> {
  const supabase = getSupabase()

  // Load intervention
  const { data: intervention, error: loadError } = await supabase
    .from('exo_interventions')
    .select('*')
    .eq('id', interventionId)
    .single()

  if (loadError || !intervention) {
    console.error('[Executor] Intervention not found:', interventionId)
    return { success: false, message: 'Intervention not found', error: loadError?.message }
  }

  // Mark as executing
  await supabase
    .from('exo_interventions')
    .update({ status: 'executing', updated_at: new Date().toISOString() })
    .eq('id', interventionId)

  try {
    const result = await dispatchAction(intervention as Intervention)

    // Mark as completed
    await supabase
      .from('exo_interventions')
      .update({
        status: 'completed',
        executed_at: new Date().toISOString(),
        execution_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', interventionId)

    // Remove from queue
    await supabase
      .from('exo_intervention_queue')
      .delete()
      .eq('intervention_id', interventionId)

    // Notify user about completed action
    await notifyUser(intervention as Intervention, result)

    console.log('[Executor] Completed:', { interventionId, result: result.message })
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Update retry count
    const retryCount = (intervention.retry_count || 0) + 1
    const maxRetries = intervention.max_retries || 3

    if (retryCount >= maxRetries) {
      // Mark as failed
      await supabase
        .from('exo_interventions')
        .update({
          status: 'failed',
          retry_count: retryCount,
          execution_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', interventionId)

      // Remove from queue
      await supabase
        .from('exo_intervention_queue')
        .delete()
        .eq('intervention_id', interventionId)
    } else {
      // Back to approved for retry
      await supabase
        .from('exo_interventions')
        .update({
          status: 'approved',
          retry_count: retryCount,
          execution_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', interventionId)

      // Update queue for retry (delay 5 minutes per retry)
      await supabase
        .from('exo_intervention_queue')
        .update({
          scheduled_at: new Date(Date.now() + retryCount * 5 * 60 * 1000).toISOString(),
          locked_until: null,
          last_error: errorMessage,
          attempts: retryCount,
        })
        .eq('intervention_id', interventionId)
    }

    console.error('[Executor] Failed:', { interventionId, error: errorMessage, retryCount })
    return { success: false, message: 'Execution failed', error: errorMessage }
  }
}

/**
 * Process all due items in the intervention queue.
 * Called by the cron job.
 */
export async function processQueue(limit: number = 10): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabase = getSupabase()
  const now = new Date().toISOString()

  // Fetch due queue items (not locked)
  const { data: items, error } = await supabase
    .from('exo_intervention_queue')
    .select('*, exo_interventions(status)')
    .lte('scheduled_at', now)
    .or('locked_until.is.null,locked_until.lte.' + now)
    .order('priority', { ascending: false })
    .limit(limit)

  if (error || !items?.length) {
    return { processed: 0, succeeded: 0, failed: 0 }
  }

  // Filter only approved interventions
  const dueItems = items.filter(
    (item: QueueItem & { exo_interventions: { status: string } }) =>
      item.exo_interventions?.status === 'approved'
  )

  let succeeded = 0
  let failed = 0

  for (const item of dueItems) {
    // Lock the item (5 minute lock)
    await supabase
      .from('exo_intervention_queue')
      .update({
        locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        locked_by: 'cron-executor',
      })
      .eq('id', item.id)

    const result = await executeIntervention(item.intervention_id)
    if (result.success) {
      succeeded++
    } else {
      failed++
    }
  }

  console.log('[Executor] Queue processed:', { total: dueItems.length, succeeded, failed })
  return { processed: dueItems.length, succeeded, failed }
}

/**
 * Process interventions that have passed their approval timeout.
 * Auto-approves and queues them for execution.
 */
export async function processTimeouts(): Promise<number> {
  const supabase = getSupabase()
  const now = new Date().toISOString()

  // Find proposed interventions with expired scheduled_for (timeout passed)
  const { data: timedOut } = await supabase
    .from('exo_interventions')
    .select('id, tenant_id, priority')
    .eq('status', 'proposed')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)
    .is('expires_at', null)
    .limit(20)

  if (!timedOut?.length) return 0

  let autoApproved = 0

  for (const intervention of timedOut) {
    // Auto-approve (timeout = implicit consent)
    const { error } = await supabase.rpc('approve_intervention', {
      p_intervention_id: intervention.id,
      p_approved_by: 'auto_timeout',
    })

    if (!error) {
      autoApproved++
      console.log('[Executor] Auto-approved after timeout:', intervention.id)
    }
  }

  return autoApproved
}

// ============================================================================
// ACTION DISPATCH
// ============================================================================

async function dispatchAction(intervention: Intervention): Promise<ExecutionResult> {
  const payload = intervention.action_payload
  const actionType = (payload.action as string) || intervention.intervention_type

  switch (actionType) {
    case 'send_sms':
      return await handleSendSms(intervention)
    case 'send_email':
      return await handleSendEmail(intervention)
    case 'send_whatsapp':
      return await handleSendWhatsApp(intervention)
    case 'make_call':
      return await handleMakeCall(intervention)
    case 'create_task':
    case 'task_creation':
      return await handleCreateTask(intervention)
    case 'proactive_message':
      return await handleProactiveMessage(intervention)
    default:
      return { success: false, message: `Unknown action type: ${actionType}` }
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleSendSms(intervention: Intervention): Promise<ExecutionResult> {
  const { phone, message, to } = intervention.action_payload as { phone?: string; message?: string; to?: string }
  const targetPhone = phone || to

  if (!targetPhone || !message) {
    return { success: false, message: 'Missing phone or message in payload' }
  }

  const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  await twilioClient.messages.create({
    to: targetPhone,
    from: TWILIO_PHONE_NUMBER,
    body: message as string,
  })

  await appendMessage(intervention.tenant_id, {
    role: 'assistant',
    content: `[Autonomiczna akcja] SMS do ${targetPhone}: ${message}`,
    channel: 'sms',
    direction: 'outbound',
    source_type: 'intervention',
    source_id: intervention.id,
  }).catch(() => {})

  return { success: true, message: `SMS wysłany do ${targetPhone}` }
}

async function handleSendEmail(intervention: Intervention): Promise<ExecutionResult> {
  const { email, to, subject, body, message } = intervention.action_payload as {
    email?: string; to?: string; subject?: string; body?: string; message?: string
  }
  const targetEmail = email || to
  const emailBody = body || message

  if (!targetEmail || !emailBody) {
    return { success: false, message: 'Missing email or body in payload' }
  }

  if (!RESEND_API_KEY) {
    return { success: false, message: 'Email not configured (missing RESEND_API_KEY)' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'IORS <iors@exoskull.xyz>',
      to: [targetEmail],
      subject: subject || 'Wiadomość od IORS',
      text: emailBody,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Executor] Resend email error:', errorText)
    return { success: false, message: `Email failed: ${response.status}` }
  }

  await appendMessage(intervention.tenant_id, {
    role: 'assistant',
    content: `[Autonomiczna akcja] Email do ${targetEmail}: ${subject || '(bez tematu)'}`,
    channel: 'email',
    direction: 'outbound',
    source_type: 'intervention',
    source_id: intervention.id,
  }).catch(() => {})

  return { success: true, message: `Email wysłany do ${targetEmail}` }
}

async function handleSendWhatsApp(intervention: Intervention): Promise<ExecutionResult> {
  return { success: false, message: 'WhatsApp not configured' }
}

async function handleMakeCall(intervention: Intervention): Promise<ExecutionResult> {
  const { phone, purpose, instructions } = intervention.action_payload as {
    phone?: string; purpose?: string; instructions?: string
  }

  if (!phone) {
    return { success: false, message: 'Missing phone number' }
  }

  const result = await makeOutboundCall({
    to: phone,
    webhookUrl: `${APP_URL}/api/twilio/voice?action=start`,
    statusCallbackUrl: `${APP_URL}/api/twilio/status`,
    timeout: 30,
  })

  await appendMessage(intervention.tenant_id, {
    role: 'assistant',
    content: `[Autonomiczna akcja] Dzwonię pod ${phone}: ${purpose || ''}`,
    channel: 'voice',
    direction: 'outbound',
    source_type: 'intervention',
    source_id: intervention.id,
  }).catch(() => {})

  return { success: true, message: `Zadzwoniono pod ${phone} (SID: ${result.callSid})` }
}

async function handleCreateTask(intervention: Intervention): Promise<ExecutionResult> {
  const supabase = getSupabase()
  const { title, priority } = intervention.action_payload as { title?: string; priority?: number }

  if (!title) {
    return { success: false, message: 'Missing task title' }
  }

  const { error } = await supabase
    .from('exo_tasks')
    .insert({
      tenant_id: intervention.tenant_id,
      title,
      priority: priority || 2,
      status: 'pending',
    })

  if (error) {
    return { success: false, message: `Failed to create task: ${error.message}` }
  }

  return { success: true, message: `Zadanie utworzone: "${title}"` }
}

async function handleProactiveMessage(intervention: Intervention): Promise<ExecutionResult> {
  const { message, channel } = intervention.action_payload as { message?: string; channel?: string }

  if (!message) {
    return { success: false, message: 'Missing message' }
  }

  // Determine preferred channel for this tenant
  const supabase = getSupabase()
  const { data: tenant } = await supabase
    .from('exo_tenants')
    .select('phone, email')
    .eq('id', intervention.tenant_id)
    .single()

  const preferredChannel = channel || (tenant?.phone ? 'sms' : 'email')

  // Route through the appropriate channel
  const fakeIntervention = {
    ...intervention,
    action_payload: {
      phone: tenant?.phone,
      email: tenant?.email,
      message,
    },
  }

  if (preferredChannel === 'sms' && tenant?.phone) {
    return handleSendSms(fakeIntervention)
  } else if (preferredChannel === 'email' && tenant?.email) {
    return handleSendEmail({
      ...fakeIntervention,
      action_payload: { ...fakeIntervention.action_payload, subject: intervention.title },
    })
  }

  return { success: false, message: 'No contact method available for tenant' }
}

// ============================================================================
// USER NOTIFICATION
// ============================================================================

async function notifyUser(intervention: Intervention, result: ExecutionResult): Promise<void> {
  // Log to unified thread that action was completed
  await appendMessage(intervention.tenant_id, {
    role: 'system',
    content: `Wykonano zaplanowaną akcję: ${intervention.title}. Wynik: ${result.message}`,
    channel: 'web_chat',
    source_type: 'intervention',
    source_id: intervention.id,
    metadata: { executionResult: result },
  }).catch(() => {})
}
