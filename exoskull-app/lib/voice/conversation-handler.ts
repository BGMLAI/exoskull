/**
 * Voice Conversation Handler
 *
 * Orchestrates Claude conversations with tools for the voice pipeline.
 * Manages session state and integrates with Supabase for persistence.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { STATIC_SYSTEM_PROMPT } from './system-prompt'

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const CLAUDE_MODEL = 'claude-sonnet-4-20250514' // Fast + capable

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSession {
  id: string
  callSid: string
  tenantId: string
  status: 'active' | 'ended'
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  startedAt: string
  endedAt?: string
  metadata?: Record<string, any>
}

export interface ConversationResult {
  text: string
  toolsUsed: string[]
  shouldEndCall: boolean
}

// ============================================================================
// TOOL DEFINITIONS (Claude Format)
// ============================================================================

const VOICE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Dodaj nowe zadanie do listy użytkownika',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Tytuł zadania' },
        priority: {
          type: 'number',
          description: 'Priorytet 1-4 (1=krytyczny, 4=niski)',
          default: 2
        }
      },
      required: ['title']
    }
  },
  {
    name: 'complete_task',
    description: 'Oznacz zadanie jako ukończone',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_title: {
          type: 'string',
          description: 'Tytuł lub fragment tytułu zadania do ukończenia'
        }
      },
      required: ['task_title']
    }
  },
  {
    name: 'list_tasks',
    description: 'Wyświetl aktualne zadania użytkownika',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'Status: pending, done, all',
          default: 'pending'
        }
      }
    }
  }
]

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get or create a voice session
 */
export async function getOrCreateSession(
  callSid: string,
  tenantId: string
): Promise<VoiceSession> {
  const supabase = getSupabase()

  // Try to find existing session
  const { data: existing } = await supabase
    .from('exo_voice_sessions')
    .select('*')
    .eq('call_sid', callSid)
    .single()

  if (existing) {
    return {
      id: existing.id,
      callSid: existing.call_sid,
      tenantId: existing.tenant_id,
      status: existing.status,
      messages: existing.messages || [],
      startedAt: existing.started_at,
      endedAt: existing.ended_at,
      metadata: existing.metadata
    }
  }

  // Create new session
  const { data: newSession, error } = await supabase
    .from('exo_voice_sessions')
    .insert({
      call_sid: callSid,
      tenant_id: tenantId,
      status: 'active',
      messages: [],
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('[ConversationHandler] Failed to create session:', error)
    throw new Error(`Failed to create session: ${error.message}`)
  }

  console.log('[ConversationHandler] Created session:', newSession.id)

  return {
    id: newSession.id,
    callSid: newSession.call_sid,
    tenantId: newSession.tenant_id,
    status: newSession.status,
    messages: [],
    startedAt: newSession.started_at
  }
}

/**
 * Update session with new messages
 */
export async function updateSession(
  sessionId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const supabase = getSupabase()

  // Get current messages
  const { data: session } = await supabase
    .from('exo_voice_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single()

  const messages = session?.messages || []
  messages.push({ role: 'user', content: userMessage })
  messages.push({ role: 'assistant', content: assistantMessage })

  // Update session
  const { error } = await supabase
    .from('exo_voice_sessions')
    .update({ messages })
    .eq('id', sessionId)

  if (error) {
    console.error('[ConversationHandler] Failed to update session:', error)
  }
}

/**
 * End a voice session
 */
export async function endSession(sessionId: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('exo_voice_sessions')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString()
    })
    .eq('id', sessionId)

  if (error) {
    console.error('[ConversationHandler] Failed to end session:', error)
  }

  console.log('[ConversationHandler] Ended session:', sessionId)
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  tenantId: string
): Promise<string> {
  const supabase = getSupabase()
  console.log('[ConversationHandler] Executing tool:', toolName, toolInput)

  try {
    if (toolName === 'add_task') {
      const { data, error } = await supabase
        .from('exo_tasks')
        .insert({
          tenant_id: tenantId,
          title: toolInput.title,
          priority: toolInput.priority || 2,
          status: 'pending'
        })
        .select()
        .single()

      if (error) {
        console.error('[ConversationHandler] add_task error:', error)
        return `Błąd: nie udało się dodać zadania`
      }

      return `Dodano zadanie: "${toolInput.title}"`
    }

    if (toolName === 'complete_task') {
      // Find task by title (fuzzy match)
      const { data: tasks } = await supabase
        .from('exo_tasks')
        .select('id, title')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .ilike('title', `%${toolInput.task_title}%`)
        .limit(1)

      if (!tasks || tasks.length === 0) {
        return `Nie znaleziono zadania zawierającego: "${toolInput.task_title}"`
      }

      const task = tasks[0]
      const { error } = await supabase
        .from('exo_tasks')
        .update({
          status: 'done',
          completed_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) {
        console.error('[ConversationHandler] complete_task error:', error)
        return `Błąd: nie udało się ukończyć zadania`
      }

      return `Ukończono zadanie: "${task.title}"`
    }

    if (toolName === 'list_tasks') {
      const status = toolInput.status || 'pending'
      let query = supabase
        .from('exo_tasks')
        .select('title, status, priority')
        .eq('tenant_id', tenantId)
        .limit(10)

      if (status !== 'all') {
        query = query.eq('status', status)
      }

      const { data: tasks, error } = await query

      if (error || !tasks || tasks.length === 0) {
        return status === 'pending'
          ? 'Brak aktywnych zadań'
          : 'Brak zadań'
      }

      // Return concise list (for voice)
      const taskList = tasks.map((t) => t.title).join(', ')
      return `Masz ${tasks.length} zadań: ${taskList}`
    }

    return 'Nieznane narzędzie'
  } catch (error) {
    console.error('[ConversationHandler] Tool execution error:', error)
    return `Błąd wykonania narzędzia: ${toolName}`
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

async function buildDynamicContext(tenantId: string): Promise<string> {
  const supabase = getSupabase()

  // Get user profile
  const { data: tenant } = await supabase
    .from('exo_tenants')
    .select('name, preferred_name, communication_style')
    .eq('id', tenantId)
    .single()

  // Get pending tasks count
  const { count: taskCount } = await supabase
    .from('exo_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')

  // Get current time in Polish format
  const now = new Date()
  const timeString = now.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit'
  })
  const dayOfWeek = now.toLocaleDateString('pl-PL', { weekday: 'long' })

  // Build context
  let context = `\n\n## AKTUALNY KONTEKST\n`
  context += `- Czas: ${dayOfWeek}, ${timeString}\n`

  if (tenant?.preferred_name || tenant?.name) {
    context += `- Użytkownik: ${tenant.preferred_name || tenant.name}\n`
  }

  if (tenant?.communication_style) {
    context += `- Styl komunikacji: ${tenant.communication_style}\n`
  }

  context += `- Aktywne zadania: ${taskCount || 0}\n`

  return context
}

// ============================================================================
// END CALL DETECTION
// ============================================================================

const END_PHRASES = [
  'do widzenia',
  'pa pa',
  'koniec',
  'dziękuję to wszystko',
  'to wszystko',
  'cześć',
  'nara',
  'trzymaj się',
  'do usłyszenia'
]

function shouldEndCall(userText: string): boolean {
  const normalized = userText.toLowerCase().trim()
  return END_PHRASES.some((phrase) => normalized.includes(phrase))
}

// ============================================================================
// MAIN CONVERSATION FUNCTION
// ============================================================================

/**
 * Process user message and generate Claude response
 */
export async function processUserMessage(
  session: VoiceSession,
  userMessage: string
): Promise<ConversationResult> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // Check for end call phrases
  if (shouldEndCall(userMessage)) {
    return {
      text: 'Do usłyszenia! Miłego dnia!',
      toolsUsed: [],
      shouldEndCall: true
    }
  }

  // Build dynamic context
  const dynamicContext = await buildDynamicContext(session.tenantId)
  const fullSystemPrompt = STATIC_SYSTEM_PROMPT + dynamicContext

  // Build messages array
  const messages: Anthropic.MessageParam[] = [
    ...session.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ]

  const toolsUsed: string[] = []

  try {
    // First API call
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: fullSystemPrompt,
      messages,
      tools: VOICE_TOOLS
    })

    // Check for tool use
    const toolUseBlocks = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
    )

    if (toolUseBlocks.length > 0) {
      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, any>,
          session.tenantId
        )

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        })

        toolsUsed.push(toolUse.name)
      }

      // Second API call with tool results
      const followUpResponse = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: STATIC_SYSTEM_PROMPT,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults }
        ]
      })

      const textContent = followUpResponse.content.find(
        (c): c is Anthropic.TextBlock => c.type === 'text'
      )

      return {
        text: textContent?.text || 'Zrobione!',
        toolsUsed,
        shouldEndCall: false
      }
    }

    // No tool use, return text directly
    const textContent = response.content.find(
      (c): c is Anthropic.TextBlock => c.type === 'text'
    )

    return {
      text: textContent?.text || 'Przepraszam, nie zrozumiałem.',
      toolsUsed: [],
      shouldEndCall: false
    }
  } catch (error) {
    console.error('[ConversationHandler] Claude API error:', error)
    return {
      text: 'Przepraszam, wystąpił problem. Spróbuj ponownie.',
      toolsUsed: [],
      shouldEndCall: false
    }
  }
}

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate personalized greeting for call start
 */
export async function generateGreeting(tenantId: string): Promise<string> {
  const supabase = getSupabase()

  // Get user profile
  const { data: tenant } = await supabase
    .from('exo_tenants')
    .select('name, preferred_name')
    .eq('id', tenantId)
    .single()

  const userName = tenant?.preferred_name || tenant?.name

  if (userName) {
    return `Cześć ${userName}! Tu Zygfryd. W czym mogę pomóc?`
  }

  return `Cześć! Tu Zygfryd, twój asystent ExoSkull. W czym mogę pomóc?`
}

/**
 * Find tenant by phone number
 */
export async function findTenantByPhone(
  phone: string
): Promise<{ id: string; name?: string } | null> {
  const supabase = getSupabase()

  // Normalize phone number (remove spaces, +, etc.)
  const normalizedPhone = phone.replace(/\s+/g, '').replace(/^\+/, '')

  // Try exact match first
  let { data: tenant } = await supabase
    .from('exo_tenants')
    .select('id, name')
    .eq('phone', phone)
    .single()

  if (tenant) return tenant

  // Try with normalized phone
  const { data: tenant2 } = await supabase
    .from('exo_tenants')
    .select('id, name')
    .eq('phone', normalizedPhone)
    .single()

  if (tenant2) return tenant2

  // Try with + prefix
  const { data: tenant3 } = await supabase
    .from('exo_tenants')
    .select('id, name')
    .eq('phone', `+${normalizedPhone}`)
    .single()

  return tenant3 || null
}
