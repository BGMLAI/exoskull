/**
 * Voice Conversation Handler
 *
 * Orchestrates Claude conversations with tools for the voice pipeline.
 * Manages session state and integrates with Supabase for persistence.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { STATIC_SYSTEM_PROMPT } from './system-prompt'
import { makeOutboundCall } from './twilio-client'
import { appendMessage, getThreadContext, getThreadSummary } from '../unified-thread'

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://exoskull.xyz'

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+48732144112'

const RESEND_API_KEY = process.env.RESEND_API_KEY

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

const IORS_TOOLS: Anthropic.Tool[] = [
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
  },
  {
    name: 'log_mod_data',
    description: 'Zapisz dane do zainstalowanego Moda (np. sen, nastrój, trening, wydatek). Użyj gdy user mówi o czymś co pasuje do jego Modów.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mod_slug: {
          type: 'string',
          description: 'Slug Moda: sleep-tracker, mood-tracker, exercise-logger, habit-tracker, food-logger, water-tracker, reading-log, finance-monitor, social-tracker, journal, goal-setter, weekly-review'
        },
        data: {
          type: 'object',
          description: 'Dane do zapisania (zależne od Moda). Np. sleep-tracker: {hours: 7, quality: 8}, mood-tracker: {mood: 7, energy: 6}'
        }
      },
      required: ['mod_slug', 'data']
    }
  },
  {
    name: 'get_mod_data',
    description: 'Pobierz ostatnie dane z Moda. Użyj gdy user pyta o swoje dane (np. "ile spałem", "jaki był mój nastrój").',
    input_schema: {
      type: 'object' as const,
      properties: {
        mod_slug: {
          type: 'string',
          description: 'Slug Moda z którego pobrać dane'
        },
        limit: {
          type: 'number',
          description: 'Ile ostatnich wpisów pobrać (domyślnie 5)',
          default: 5
        }
      },
      required: ['mod_slug']
    }
  },
  {
    name: 'install_mod',
    description: 'Zainstaluj nowy Mod. Użyj gdy user chce śledzić coś nowego (np. "chcę śledzić czytanie" → install reading-log).',
    input_schema: {
      type: 'object' as const,
      properties: {
        mod_slug: {
          type: 'string',
          description: 'Slug Moda do zainstalowania'
        }
      },
      required: ['mod_slug']
    }
  },
  {
    name: 'make_call',
    description: 'Zadzwoń do osoby trzeciej w imieniu użytkownika (pizzeria, lekarz, firma, znajomy). Zbierz WSZYSTKIE szczegóły PRZED wywołaniem: numer, cel rozmowy, co powiedzieć/zamówić.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone_number: {
          type: 'string',
          description: 'Numer telefonu do zadzwonienia (format: +48XXXXXXXXX lub XXXXXXXXX)'
        },
        purpose: {
          type: 'string',
          description: 'Cel rozmowy - krótko (np. "zamówienie pizzy", "umówienie wizyty u dentysty")'
        },
        instructions: {
          type: 'string',
          description: 'Dokładne instrukcje co powiedzieć/zamówić/ustalić (np. "Zamów pizzę margheritę, odbiór osobisty, na nazwisko Bogumił")'
        },
        user_name: {
          type: 'string',
          description: 'Imię użytkownika w imieniu którego dzwonisz'
        }
      },
      required: ['phone_number', 'purpose', 'instructions']
    }
  },
  {
    name: 'send_sms',
    description: 'Wyślij SMS do dowolnego numeru w imieniu użytkownika.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone_number: {
          type: 'string',
          description: 'Numer telefonu odbiorcy'
        },
        message: {
          type: 'string',
          description: 'Treść wiadomości SMS'
        }
      },
      required: ['phone_number', 'message']
    }
  },
  {
    name: 'send_email',
    description: 'Wyślij email w imieniu użytkownika.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Adres email odbiorcy'
        },
        subject: {
          type: 'string',
          description: 'Temat emaila'
        },
        body: {
          type: 'string',
          description: 'Treść emaila'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'send_whatsapp',
    description: 'Wyślij wiadomość WhatsApp do osoby z podanym numerem telefonu.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone_number: {
          type: 'string',
          description: 'Numer telefonu odbiorcy (z kodem kraju, np. +48...)'
        },
        message: {
          type: 'string',
          description: 'Treść wiadomości WhatsApp'
        }
      },
      required: ['phone_number', 'message']
    }
  },
  {
    name: 'send_messenger',
    description: 'Wyślij wiadomość Facebook Messenger do kontaktu (po imieniu).',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_name: {
          type: 'string',
          description: 'Imię i nazwisko kontaktu (szukamy w CRM)'
        },
        message: {
          type: 'string',
          description: 'Treść wiadomości Messenger'
        }
      },
      required: ['contact_name', 'message']
    }
  },
  {
    name: 'plan_action',
    description: 'Zaplanuj akcję do wykonania w przyszłości. Akcja zostanie wykonana automatycznie po upływie timeout (domyślnie 1h) jeżeli user nie wyrazi sprzeciwu. Użyj gdy chcesz coś zrobić ale chcesz dać userowi szansę na anulowanie.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: {
          type: 'string',
          enum: ['send_sms', 'send_email', 'send_whatsapp', 'make_call', 'create_task'],
          description: 'Typ akcji do wykonania'
        },
        title: {
          type: 'string',
          description: 'Krótki opis akcji (widoczny dla usera)'
        },
        action_payload: {
          type: 'object',
          description: 'Parametry akcji (phone, message, email, subject, body, title, etc.)'
        },
        timeout_hours: {
          type: 'number',
          description: 'Ile godzin czekać na sprzeciw (domyślnie 1)'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priorytet (domyślnie medium)'
        }
      },
      required: ['action_type', 'title', 'action_payload']
    }
  },
  {
    name: 'list_planned_actions',
    description: 'Pokaż zaplanowane akcje czekające na wykonanie.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'cancel_planned_action',
    description: 'Anuluj zaplanowaną akcję.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_title: {
          type: 'string',
          description: 'Tytuł akcji do anulowania (dopasowanie częściowe)'
        }
      },
      required: ['action_title']
    }
  },
  {
    name: 'delegate_complex_task',
    description: 'Deleguj złożony task do wykonania w tle. Użyj gdy zadanie wymaga wielu kroków lub długiego przetwarzania. Odpowiedz userowi krótko "Zajmę się tym" i deleguj.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_description: {
          type: 'string',
          description: 'Opis zadania do wykonania'
        },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Kroki do wykonania (opcjonalne)'
        }
      },
      required: ['task_description']
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
 * Update session with new messages.
 * Writes to both voice session (legacy) AND unified thread (new).
 */
export async function updateSession(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  options?: { tenantId?: string; channel?: 'voice' | 'web_chat' }
): Promise<void> {
  const supabase = getSupabase()
  const channel = options?.channel || 'voice'
  const sourceType = channel === 'web_chat' ? 'web_chat' as const : 'voice_session' as const

  // Get current messages
  const { data: session } = await supabase
    .from('exo_voice_sessions')
    .select('messages, tenant_id')
    .eq('id', sessionId)
    .single()

  const messages = session?.messages || []
  messages.push({ role: 'user', content: userMessage })
  messages.push({ role: 'assistant', content: assistantMessage })

  // Update voice session (legacy storage)
  const { error } = await supabase
    .from('exo_voice_sessions')
    .update({ messages })
    .eq('id', sessionId)

  if (error) {
    console.error('[ConversationHandler] Failed to update session:', error)
  }

  // Append to unified thread (new cross-channel storage)
  const resolvedTenantId = options?.tenantId || session?.tenant_id
  if (resolvedTenantId) {
    try {
      await appendMessage(resolvedTenantId, {
        role: 'user',
        content: userMessage,
        channel,
        source_type: sourceType,
        source_id: sessionId,
      })
      await appendMessage(resolvedTenantId, {
        role: 'assistant',
        content: assistantMessage,
        channel,
        source_type: sourceType,
        source_id: sessionId,
      })
    } catch (threadError) {
      console.error('[ConversationHandler] Failed to append to unified thread:', threadError)
    }
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

    if (toolName === 'log_mod_data') {
      const { error } = await supabase
        .from('exo_mod_data')
        .insert({
          tenant_id: tenantId,
          mod_slug: toolInput.mod_slug,
          data: toolInput.data
        })

      if (error) {
        console.error('[ConversationHandler] log_mod_data error:', error)
        return `Błąd: nie udało się zapisać danych`
      }

      return `Zapisano dane do ${toolInput.mod_slug}`
    }

    if (toolName === 'get_mod_data') {
      const limit = toolInput.limit || 5
      const { data: entries, error } = await supabase
        .from('exo_mod_data')
        .select('data, created_at')
        .eq('tenant_id', tenantId)
        .eq('mod_slug', toolInput.mod_slug)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error || !entries || entries.length === 0) {
        return `Brak danych w ${toolInput.mod_slug}`
      }

      const summary = entries.map((e) => {
        const values = Object.entries(e.data)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
        return values
      }).join(' | ')

      return `Ostatnie ${entries.length} wpisów (${toolInput.mod_slug}): ${summary}`
    }

    if (toolName === 'install_mod') {
      // Check if already installed
      const { data: existing } = await supabase
        .from('exo_mod_registry')
        .select('id')
        .eq('slug', toolInput.mod_slug)
        .single()

      if (!existing) {
        return `Mod "${toolInput.mod_slug}" nie istnieje`
      }

      const { error } = await supabase
        .from('exo_tenant_mods')
        .upsert({
          tenant_id: tenantId,
          mod_id: existing.id,
          active: true
        }, {
          onConflict: 'tenant_id,mod_id'
        })

      if (error) {
        console.error('[ConversationHandler] install_mod error:', error)
        return `Błąd: nie udało się zainstalować Moda`
      }

      return `Zainstalowano Mod: ${toolInput.mod_slug}`
    }

    if (toolName === 'make_call') {
      const phoneNumber = normalizePhone(toolInput.phone_number)
      const purpose = toolInput.purpose
      const instructions = toolInput.instructions
      const userName = toolInput.user_name || 'użytkownik'

      console.log('[ConversationHandler] make_call:', { phoneNumber, purpose })

      try {
        // Create a delegate session in DB
        const { data: delegateSession, error: sessionError } = await supabase
          .from('exo_voice_sessions')
          .insert({
            call_sid: `delegate_${Date.now()}`,
            tenant_id: tenantId,
            status: 'active',
            messages: [],
            started_at: new Date().toISOString(),
            metadata: {
              mode: 'delegate',
              purpose,
              instructions,
              user_name: userName,
              target_phone: phoneNumber
            }
          })
          .select('id')
          .single()

        if (sessionError) {
          console.error('[ConversationHandler] Delegate session error:', sessionError)
          return 'Błąd: nie udało się przygotować rozmowy'
        }

        // Make outbound call with delegate webhook
        const result = await makeOutboundCall({
          to: phoneNumber,
          webhookUrl: `${APP_URL}/api/twilio/voice/delegate?session_id=${delegateSession.id}`,
          statusCallbackUrl: `${APP_URL}/api/twilio/status`,
          timeout: 45
        })

        // Update session with real call_sid
        await supabase
          .from('exo_voice_sessions')
          .update({ call_sid: result.callSid })
          .eq('id', delegateSession.id)

        return `Dzwonię pod ${toolInput.phone_number}. Powiadomię Cię jak skończę.`
      } catch (callError) {
        console.error('[ConversationHandler] make_call error:', callError)
        return `Nie udało się zadzwonić pod ${toolInput.phone_number}. Spróbuj później.`
      }
    }

    if (toolName === 'send_sms') {
      const phoneNumber = normalizePhone(toolInput.phone_number)
      const message = toolInput.message

      console.log('[ConversationHandler] send_sms:', { phoneNumber, messageLength: message.length })

      try {
        const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        await twilioClient.messages.create({
          to: phoneNumber,
          from: TWILIO_PHONE_NUMBER,
          body: message
        })
        await appendMessage(tenantId, {
          role: 'assistant',
          content: `[SMS do ${toolInput.phone_number}]: ${message}`,
          channel: 'sms',
          direction: 'outbound',
          source_type: 'voice_session',
        }).catch(() => {})
        return `SMS wysłany do ${toolInput.phone_number}`
      } catch (smsError) {
        console.error('[ConversationHandler] send_sms error:', smsError)
        return `Nie udało się wysłać SMS do ${toolInput.phone_number}`
      }
    }

    if (toolName === 'send_email') {
      const toEmail = toolInput.to
      const subject = toolInput.subject
      const body = toolInput.body

      if (!RESEND_API_KEY) {
        return 'Email nie jest jeszcze skonfigurowany.'
      }

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'IORS <iors@exoskull.xyz>',
            to: [toEmail],
            subject,
            text: body
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[ConversationHandler] send_email Resend error:', errorText)
          return `Nie udało się wysłać emaila: ${response.status}`
        }

        await appendMessage(tenantId, {
          role: 'assistant',
          content: `[Email do ${toEmail}] Temat: ${subject}`,
          channel: 'email',
          direction: 'outbound',
          source_type: 'voice_session',
        }).catch(() => {})
        return `Email wysłany do ${toEmail}`
      } catch (emailError) {
        console.error('[ConversationHandler] send_email error:', emailError)
        return `Nie udało się wysłać emaila do ${toEmail}`
      }
    }

    if (toolName === 'send_whatsapp') {
      return 'WhatsApp nie jest jeszcze skonfigurowany. Spróbuj SMS.'
    }

    if (toolName === 'send_messenger') {
      return 'Messenger nie jest jeszcze skonfigurowany.'
    }

    // ================================================================
    // AUTONOMY TOOLS
    // ================================================================

    if (toolName === 'plan_action') {
      const actionType = toolInput.action_type as string
      const title = toolInput.title as string
      const actionPayload = toolInput.action_payload as Record<string, unknown>
      const timeoutHours = (toolInput.timeout_hours as number) || 1
      const priority = (toolInput.priority as string) || 'medium'

      const scheduledFor = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString()

      const { data, error: planError } = await supabase.rpc('propose_intervention', {
        p_tenant_id: tenantId,
        p_type: actionType === 'create_task' ? 'task_creation' : 'automation_trigger',
        p_title: title,
        p_description: `Zaplanowana akcja: ${actionType}`,
        p_action_payload: { action: actionType, ...actionPayload },
        p_priority: priority,
        p_source_agent: 'IORS',
        p_requires_approval: true,
        p_scheduled_for: scheduledFor,
      })

      if (planError) {
        console.error('[ConversationHandler] plan_action error:', planError)
        return `Nie udało się zaplanować akcji: ${planError.message}`
      }

      return `Zaplanowano: "${title}". Wykonam za ${timeoutHours}h jeśli nie anulujesz.`
    }

    if (toolName === 'list_planned_actions') {
      const { data: pending } = await supabase.rpc('get_pending_interventions', {
        p_tenant_id: tenantId,
        p_limit: 10,
      })

      if (!pending?.length) {
        return 'Brak zaplanowanych akcji.'
      }

      return pending.map((p: { title: string; priority: string; scheduled_for: string }) => {
        const when = p.scheduled_for
          ? new Date(p.scheduled_for).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
          : 'wkrótce'
        return `• ${p.title} [${p.priority}] - ${when}`
      }).join('\n')
    }

    if (toolName === 'cancel_planned_action') {
      const searchTitle = toolInput.action_title as string

      const { data: pending } = await supabase
        .from('exo_interventions')
        .select('id, title')
        .eq('tenant_id', tenantId)
        .eq('status', 'proposed')
        .ilike('title', `%${searchTitle}%`)
        .limit(1)

      if (!pending?.length) {
        return `Nie znaleziono zaplanowanej akcji "${searchTitle}"`
      }

      await supabase
        .from('exo_interventions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', pending[0].id)

      return `Anulowano: "${pending[0].title}"`
    }

    // ================================================================
    // DELEGATION TOOL
    // ================================================================

    if (toolName === 'delegate_complex_task') {
      const taskDescription = toolInput.task_description as string
      const steps = (toolInput.steps as string[]) || []

      // Create as intervention with auto-approval (no timeout)
      const { error: delegateError } = await supabase.rpc('propose_intervention', {
        p_tenant_id: tenantId,
        p_type: 'automation_trigger',
        p_title: `[Delegowany] ${taskDescription}`,
        p_description: steps.length > 0 ? `Kroki: ${steps.join(', ')}` : taskDescription,
        p_action_payload: {
          action: 'delegated_task',
          task_description: taskDescription,
          steps,
        },
        p_priority: 'medium',
        p_source_agent: 'IORS',
        p_requires_approval: false,
        p_scheduled_for: null,
      })

      if (delegateError) {
        console.error('[ConversationHandler] delegate error:', delegateError)
        return `Nie udało się delegować zadania`
      }

      return `Zajmę się tym w tle. Dam znać jak skończę.`
    }

    return 'Nieznane narzędzie'
  } catch (error) {
    console.error('[ConversationHandler] Tool execution error:', error)
    return `Błąd wykonania narzędzia: ${toolName}`
  }
}

// Helper: normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '')
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('48')) {
      cleaned = '+' + cleaned
    } else {
      cleaned = '+48' + cleaned
    }
  }
  return cleaned
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

  // Get installed mods
  const { data: mods } = await supabase
    .from('exo_tenant_mods')
    .select('mod_id, exo_mod_registry(slug, name)')
    .eq('tenant_id', tenantId)
    .eq('active', true)

  // Build context
  let context = `\n\n## AKTUALNY KONTEKST\n`
  context += `- Czas: ${dayOfWeek}, ${timeString}\n`

  if (tenant?.preferred_name || tenant?.name) {
    const userName = tenant.preferred_name || tenant.name
    context += `- Uzytkownik: ${userName} (UZYWAJ IMIENIA w rozmowie)\n`
  }

  if (tenant?.communication_style) {
    context += `- Styl komunikacji: ${tenant.communication_style}\n`
  }

  context += `- Aktywne zadania: ${taskCount || 0}\n`

  if (mods && mods.length > 0) {
    const modList = mods.map((m: any) => m.exo_mod_registry?.slug || 'unknown').join(', ')
    context += `- Zainstalowane Mody: ${modList}\n`
  }

  // Cross-channel conversation summary
  try {
    const threadSummary = await getThreadSummary(tenantId)
    if (threadSummary && threadSummary !== 'Brak historii rozmow.') {
      context += `- Historia rozmow: ${threadSummary}\n`
    }
  } catch {
    // Non-blocking: context works without thread summary
  }

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

  // Build messages array - prefer unified thread for cross-channel context
  let messages: Anthropic.MessageParam[]
  try {
    const threadMessages = await getThreadContext(session.tenantId, 20)
    if (threadMessages.length > 0) {
      // Use unified thread (includes voice + SMS + WhatsApp + etc.)
      messages = [
        ...threadMessages,
        { role: 'user', content: userMessage }
      ]
    } else {
      // Fallback to voice session only (first message or thread empty)
      messages = [
        ...session.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
        { role: 'user', content: userMessage }
      ]
    }
  } catch {
    // Fallback to voice session if unified thread fails
    messages = [
      ...session.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      { role: 'user', content: userMessage }
    ]
  }

  const toolsUsed: string[] = []

  try {
    // First API call (max_tokens low for voice = short, fast responses)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: fullSystemPrompt,
      messages,
      tools: IORS_TOOLS
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
        max_tokens: 150,
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
    .select('name, preferred_name, assistant_name')
    .eq('id', tenantId)
    .single()

  const userName = tenant?.preferred_name || tenant?.name
  const assistantName = tenant?.assistant_name || 'IORS'

  if (userName) {
    return `Cześć ${userName}! Tu ${assistantName}. W czym mogę pomóc?`
  }

  return `Cześć! Tu ${assistantName}, twój osobisty asystent. W czym mogę pomóc?`
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
