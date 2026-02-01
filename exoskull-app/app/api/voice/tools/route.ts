import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Use service role for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// VAPI Tool Handlers
async function getTasks(tenantId: string) {
  const { data, error } = await supabase
    .from('exo_tasks')
    .select('id, title, status, priority, due_date, description, energy_required')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .order('priority', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(20)

  if (error) {
    console.error('Error fetching tasks:', error)
    return { tasks: [], error: error.message }
  }

  return {
    tasks: data || [],
    count: data?.length || 0
  }
}

async function createTask(tenantId: string, params: {
  title: string
  priority?: number
  due_date?: string
  description?: string
  energy_required?: number
}) {
  const { data, error } = await supabase
    .from('exo_tasks')
    .insert({
      tenant_id: tenantId,
      title: params.title,
      priority: params.priority || 3, // default medium
      due_date: params.due_date || null,
      description: params.description || null,
      energy_required: params.energy_required || null,
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating task:', error)
    return { success: false, error: error.message }
  }

  return {
    success: true,
    task: data,
    message: `Zadanie "${params.title}" zostało dodane`
  }
}

async function completeTask(tenantId: string, taskId: string) {
  const { data, error } = await supabase
    .from('exo_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) {
    console.error('Error completing task:', error)
    return { success: false, error: error.message }
  }

  return {
    success: true,
    task: data,
    message: `Zadanie oznaczone jako wykonane`
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    console.log('🔧 VAPI Tool Call received:', JSON.stringify(body, null, 2))

    // VAPI sends function calls in message.functionCall
    const { message, call } = body

    // PRIMARY: Get tenant_id from URL query params (most reliable)
    const url = new URL(request.url)
    const urlTenantId = url.searchParams.get('tenant_id')
    const conversationId = url.searchParams.get('conversation_id')

    console.log('🔗 URL params:', { tenant_id: urlTenantId, conversation_id: conversationId })

    // FALLBACK: Get from VAPI payload (backup)
    const payloadTenantId = call?.metadata?.tenant_id
      || call?.assistantOverrides?.variableValues?.tenant_id
      || call?.assistant?.metadata?.tenant_id
      || message?.call?.metadata?.tenant_id

    // Use URL param first, fallback to payload
    const tenantId = urlTenantId || payloadTenantId

    if (!tenantId) {
      console.error('❌ No tenant_id found in URL or payload')
      console.error('URL:', request.url)
      console.error('Call:', JSON.stringify(call, null, 2))
      return NextResponse.json({
        result: {
          error: 'Nie można zidentyfikować użytkownika. Spróbuj zalogować się ponownie.',
          tasks: []
        }
      })
    }

    console.log('👤 Found tenant_id:', tenantId, urlTenantId ? '(from URL)' : '(from payload)')

    // Handle function call - check for tool-calls (new format) or function-call (old format)
    if (message?.type === 'tool-calls' || message?.type === 'function-call' || message?.functionCall) {
      // VAPI new format: toolCallList array
      const toolCalls = message?.toolCallList || message?.toolWithToolCallList ||
        (message?.functionCall ? [{ id: message.functionCall.id || 'unknown', name: message.functionCall.name, parameters: message.functionCall.parameters }] : [])

      // If using old format
      if (toolCalls.length === 0 && message?.functionCall) {
        const functionCall = message.functionCall
        const functionName = functionCall.name
        const parameters = functionCall.parameters || {}
        const toolCallId = functionCall.id || body?.toolCallId || 'unknown'

        console.log(`📞 Function: ${functionName}, Params:`, parameters, `ToolCallId:`, toolCallId)

        let resultData: any

        switch (functionName) {
          case 'get_tasks':
            resultData = await getTasks(tenantId)
            break
          case 'create_task':
            resultData = await createTask(tenantId, parameters)
            break
          case 'complete_task':
            resultData = await completeTask(tenantId, parameters.task_id)
            break
          default:
            resultData = { error: `Unknown function: ${functionName}` }
        }

        console.log(`✅ Result:`, resultData)

        // VAPI expects results array with toolCallId and result as STRING
        const resultString = typeof resultData === 'string' ? resultData : JSON.stringify(resultData)
        return NextResponse.json({
          results: [{
            toolCallId: toolCallId,
            result: resultString
          }]
        })
      }

      // Handle new tool-calls format with toolCallList
      const results = []
      for (const toolCall of toolCalls) {
        const functionName = toolCall.name || toolCall.function?.name
        const parameters = toolCall.parameters || toolCall.function?.arguments || {}
        const toolCallId = toolCall.id || toolCall.toolCall?.id || 'unknown'

        console.log(`📞 Function: ${functionName}, Params:`, parameters, `ToolCallId:`, toolCallId)

        let resultData: any

        switch (functionName) {
          case 'get_tasks':
            resultData = await getTasks(tenantId)
            break
          case 'create_task':
            resultData = await createTask(tenantId, parameters)
            break
          case 'complete_task':
            resultData = await completeTask(tenantId, parameters.task_id)
            break
          default:
            resultData = { error: `Unknown function: ${functionName}` }
        }

        console.log(`✅ Result for ${functionName}:`, resultData)

        // Convert result to string (VAPI requirement)
        const resultString = typeof resultData === 'string' ? resultData : JSON.stringify(resultData)
        results.push({
          toolCallId: toolCallId,
          result: resultString
        })
      }

      return NextResponse.json({ results })
    }

    // Handle other message types (transcript, end-of-call, etc.)
    if (message?.type === 'end-of-call-report') {
      console.log('📊 Call ended:', message)
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true })

  } catch (error: any) {
    console.error('❌ Tool handler error:', error)
    return NextResponse.json(
      { result: { error: error.message || 'Internal error' } },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
