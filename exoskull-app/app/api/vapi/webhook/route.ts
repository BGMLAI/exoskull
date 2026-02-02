import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID // Created in VAPI dashboard

/**
 * VAPI Webhook Handler
 *
 * Handles:
 * - assistant-request: Returns assistant config with injected variables
 * - end-of-call-report: Saves conversation to database
 * - function-call: Handles tool calls (get_tasks, create_task, etc.)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messageType = body.message?.type

    console.log('📞 VAPI Webhook:', messageType, JSON.stringify(body, null, 2).substring(0, 500))

    switch (messageType) {
      case 'assistant-request':
        return handleAssistantRequest(body)

      case 'end-of-call-report':
        return handleEndOfCall(body)

      case 'function-call':
        return handleFunctionCall(body)

      case 'status-update':
      case 'speech-update':
      case 'transcript':
        // Log but don't process
        return NextResponse.json({ received: true })

      default:
        console.log('Unhandled message type:', messageType)
        return NextResponse.json({ received: true })
    }
  } catch (error: any) {
    console.error('❌ VAPI Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Handle assistant-request
 * Returns assistant config with user-specific variables injected
 */
async function handleAssistantRequest(body: any) {
  const call = body.message?.call || body.call || {}
  const phoneNumber = call.customer?.number || null

  console.log('🔄 Assistant request for:', phoneNumber || 'web user')

  // Try to identify user by phone or metadata
  let userId: string | null = null
  let userData: any = null

  if (phoneNumber) {
    // Phone call - lookup by phone
    const { data } = await supabase
      .from('exo_tenants')
      .select('*')
      .eq('phone', phoneNumber)
      .single()

    if (data) {
      userId = data.id
      userData = data
    }
  }

  // If no phone match, check metadata (web calls pass tenant_id)
  if (!userId && call.metadata?.tenant_id) {
    userId = call.metadata.tenant_id
    const { data } = await supabase
      .from('exo_tenants')
      .select('*')
      .eq('id', userId)
      .single()
    userData = data
  }

  // Build variable values for prompt injection
  const variableValues = await buildVariableValues(userId, userData)

  // Build first message based on context
  const hour = new Date().getHours()
  const greeting = buildGreeting(hour, userData?.name)

  // Return assistant overrides
  return NextResponse.json({
    assistantId: VAPI_ASSISTANT_ID,
    assistantOverrides: {
      variableValues,
      firstMessage: greeting,
      metadata: {
        tenant_id: userId,
        identified: !!userId
      }
    }
  })
}

/**
 * Build variable values for prompt injection
 */
async function buildVariableValues(userId: string | null, userData: any) {
  const variables: Record<string, string> = {
    user_name: userData?.name || 'Użytkownik',
    user_identified: userId ? 'true' : 'false',
    current_hour: new Date().getHours().toString(),
    current_day: getDayName(new Date().getDay()),
  }

  if (!userId) {
    variables.tasks_summary = 'Nie mogę sprawdzić zadań - użytkownik niezidentyfikowany.'
    variables.tasks_count = '0'
    return variables
  }

  // Fetch tasks
  const { data: tasks } = await supabase
    .from('exo_tasks')
    .select('id, title, status, priority, due_date')
    .eq('tenant_id', userId)
    .in('status', ['pending', 'in_progress'])
    .order('priority', { ascending: true })
    .limit(10)

  if (tasks && tasks.length > 0) {
    variables.tasks_count = tasks.length.toString()
    variables.tasks_summary = tasks
      .map((t, i) => `${i + 1}. ${t.title}${t.due_date ? ` (termin: ${formatDate(t.due_date)})` : ''}`)
      .join('; ')
  } else {
    variables.tasks_count = '0'
    variables.tasks_summary = 'Brak aktywnych zadań.'
  }

  // Fetch conversation count
  const { count } = await supabase
    .from('exo_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', userId)

  variables.conversation_count = (count || 0).toString()

  // Fetch last conversation summary
  const { data: lastConv } = await supabase
    .from('exo_conversations')
    .select('summary, context')
    .eq('tenant_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (lastConv?.summary) {
    variables.last_conversation = lastConv.summary.substring(0, 200)
  } else {
    variables.last_conversation = 'Brak poprzednich rozmów.'
  }

  return variables
}

/**
 * Handle end-of-call-report
 * Save conversation to database
 */
async function handleEndOfCall(body: any) {
  const message = body.message || {}
  const call = message.call || {}
  const tenantId = call.metadata?.tenant_id

  if (!tenantId) {
    console.log('⚠️ No tenant_id in end-of-call, skipping save')
    return NextResponse.json({ saved: false })
  }

  // Save conversation
  const { data: conversation, error } = await supabase
    .from('exo_conversations')
    .insert({
      tenant_id: tenantId,
      channel: 'voice',
      started_at: call.startedAt || new Date().toISOString(),
      ended_at: call.endedAt || new Date().toISOString(),
      summary: message.summary || null,
      context: {
        vapi_call_id: call.id,
        duration_seconds: call.duration,
        cost: message.cost,
        analysis: message.analysis,
        transcript: message.transcript
      }
    })
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to save conversation:', error)
    return NextResponse.json({ saved: false, error: error.message })
  }

  console.log('✅ Saved conversation:', conversation.id)
  return NextResponse.json({ saved: true, conversationId: conversation.id })
}

/**
 * Handle function-call
 * Process tool calls from VAPI
 */
async function handleFunctionCall(body: any) {
  const message = body.message || {}
  const functionCall = message.functionCall || {}
  const call = message.call || {}
  const tenantId = call.metadata?.tenant_id

  const functionName = functionCall.name
  const parameters = functionCall.parameters || {}

  console.log(`🔧 Function call: ${functionName}`, parameters)

  if (!tenantId) {
    return NextResponse.json({
      result: 'Nie mogę wykonać tej operacji - użytkownik niezidentyfikowany.'
    })
  }

  let result: string

  switch (functionName) {
    case 'get_tasks':
      result = await handleGetTasks(tenantId)
      break

    case 'create_task':
      result = await handleCreateTask(tenantId, parameters)
      break

    case 'complete_task':
      result = await handleCompleteTask(tenantId, parameters)
      break

    default:
      result = `Nieznana funkcja: ${functionName}`
  }

  return NextResponse.json({ result })
}

// ============================================================================
// FUNCTION HANDLERS
// ============================================================================

async function handleGetTasks(tenantId: string): Promise<string> {
  const { data: tasks, error } = await supabase
    .from('exo_tasks')
    .select('title, status, priority, due_date')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'in_progress'])
    .order('priority', { ascending: true })
    .limit(10)

  if (error) return `Błąd: ${error.message}`
  if (!tasks || tasks.length === 0) return 'Nie masz żadnych aktywnych zadań.'

  return tasks.map((t, i) =>
    `${i + 1}. ${t.title}${t.due_date ? ` (termin: ${formatDate(t.due_date)})` : ''}`
  ).join('. ')
}

async function handleCreateTask(tenantId: string, params: any): Promise<string> {
  const { title, priority, due_date } = params

  if (!title) return 'Nie podano tytułu zadania.'

  const { error } = await supabase
    .from('exo_tasks')
    .insert({
      tenant_id: tenantId,
      title,
      priority: priority || 3,
      due_date: due_date || null,
      status: 'pending'
    })

  if (error) return `Nie udało się dodać: ${error.message}`
  return `Dodałem zadanie: ${title}`
}

async function handleCompleteTask(tenantId: string, params: any): Promise<string> {
  const { task_title } = params

  if (!task_title) return 'Nie podano nazwy zadania.'

  // Find task by title (fuzzy match)
  const { data: tasks } = await supabase
    .from('exo_tasks')
    .select('id, title')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .ilike('title', `%${task_title}%`)
    .limit(1)

  if (!tasks || tasks.length === 0) {
    return `Nie znalazłem zadania: ${task_title}`
  }

  const { error } = await supabase
    .from('exo_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', tasks[0].id)

  if (error) return `Nie udało się oznaczyć: ${error.message}`
  return `Oznaczono jako wykonane: ${tasks[0].title}`
}

// ============================================================================
// HELPERS
// ============================================================================

function buildGreeting(hour: number, userName?: string): string {
  const name = userName || ''

  if (hour >= 5 && hour < 12) {
    return `Dzień dobry${name ? `, ${name}` : ''}! Jak się dzisiaj czujesz?`
  } else if (hour >= 12 && hour < 18) {
    return `Cześć${name ? `, ${name}` : ''}! Co słychać?`
  } else if (hour >= 18 && hour < 22) {
    return `Dobry wieczór${name ? `, ${name}` : ''}! Jak minął dzień?`
  } else {
    return `Hej${name ? `, ${name}` : ''}. Późno już, wszystko w porządku?`
  }
}

function getDayName(day: number): string {
  const days = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
  return days[day]
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-vapi-secret',
    },
  })
}
