/**
 * GHL Tools API for AI Agents
 *
 * Provides tool functions for VAPI and other AI agents to control GHL.
 * POST /api/ghl/tools
 *
 * Available tools:
 * - ghl_send_message: Send SMS/Email/WhatsApp/etc
 * - ghl_create_contact: Create a new contact
 * - ghl_update_contact: Update contact info
 * - ghl_get_contact: Get contact details
 * - ghl_schedule_post: Schedule social media post
 * - ghl_create_appointment: Book an appointment
 * - ghl_trigger_workflow: Start a workflow
 * - ghl_get_conversations: Get recent conversations
 * - ghl_move_opportunity: Move contact in pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  GHLClient,
  sendSms,
  sendEmail,
  sendWhatsApp,
  sendFacebookMessage,
  sendInstagramDm,
  createContact,
  updateContact,
  getContact,
  searchContacts,
  createAppointment,
  bookNextAvailableSlot,
  createPost,
  schedulePostOptimal,
  triggerWorkflowByName,
  triggerWorkflowForEvent,
  moveToOnboardingStage,
  updateRetentionStatus,
  getConversations,
  type MessageType,
  type CreateContactParams,
  type CreatePostParams,
} from '@/lib/ghl'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface ToolRequest {
  tool: string
  tenant_id: string
  params: Record<string, unknown>
}

interface ToolResponse {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Get GHL client
 *
 * With Private Integration Token, we use env vars directly.
 */
function getGHLClient(): GHLClient | null {
  const client = new GHLClient()
  return client.isConfigured() ? client : null
}

/**
 * Get GHL contact ID for tenant
 */
async function getGHLContactId(tenantId: string): Promise<string | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data } = await supabase
    .from('exo_ghl_contacts')
    .select('ghl_contact_id')
    .eq('tenant_id', tenantId)
    .single()

  return data?.ghl_contact_id || null
}

export async function POST(request: NextRequest) {
  try {
    const body: ToolRequest = await request.json()
    const { tool, tenant_id, params } = body

    if (!tool || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Missing tool or tenant_id' },
        { status: 400 }
      )
    }

    // Get GHL client
    const client = getGHLClient()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'GHL not configured. Set GHL_PRIVATE_TOKEN and GHL_LOCATION_ID env vars.' },
        { status: 400 }
      )
    }

    // Route to appropriate tool
    let result: ToolResponse

    switch (tool) {
      case 'ghl_send_message':
        result = await handleSendMessage(client, tenant_id, params)
        break

      case 'ghl_create_contact':
        result = await handleCreateContact(client, params)
        break

      case 'ghl_update_contact':
        result = await handleUpdateContact(client, params)
        break

      case 'ghl_get_contact':
        result = await handleGetContact(client, params)
        break

      case 'ghl_schedule_post':
        result = await handleSchedulePost(client, params)
        break

      case 'ghl_create_appointment':
        result = await handleCreateAppointment(client, params)
        break

      case 'ghl_trigger_workflow':
        result = await handleTriggerWorkflow(client, params)
        break

      case 'ghl_get_conversations':
        result = await handleGetConversations(client, tenant_id, params)
        break

      case 'ghl_move_opportunity':
        result = await handleMoveOpportunity(client, params)
        break

      default:
        result = { success: false, error: `Unknown tool: ${tool}` }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('GHL tools error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Tool execution failed' },
      { status: 500 }
    )
  }
}

// ============================================
// Tool Handlers
// ============================================

/**
 * Send message via any channel
 */
async function handleSendMessage(
  client: GHLClient,
  tenantId: string,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const messageType = (params.type as MessageType) || 'SMS'
  const contactId = params.contact_id as string || await getGHLContactId(tenantId)
  const message = params.message as string
  const subject = params.subject as string

  if (!contactId) {
    return { success: false, error: 'No contact ID available' }
  }
  if (!message) {
    return { success: false, error: 'Message content required' }
  }

  try {
    let result
    switch (messageType) {
      case 'SMS':
        result = await sendSms(client, contactId, message)
        break
      case 'Email':
        result = await sendEmail(client, contactId, subject || 'Message from ExoSkull', message)
        break
      case 'WhatsApp':
        result = await sendWhatsApp(client, contactId, message)
        break
      case 'Facebook':
        result = await sendFacebookMessage(client, contactId, message)
        break
      case 'Instagram':
        result = await sendInstagramDm(client, contactId, message)
        break
      default:
        return { success: false, error: `Unsupported message type: ${messageType}` }
    }

    return {
      success: true,
      result: {
        messageId: result.messageId,
        conversationId: result.conversationId,
        type: messageType,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send message' }
  }
}

/**
 * Create a new contact
 */
async function handleCreateContact(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const contactParams: CreateContactParams = {
    firstName: params.first_name as string,
    lastName: params.last_name as string,
    email: params.email as string,
    phone: params.phone as string,
    companyName: params.company as string,
    tags: params.tags as string[],
  }

  try {
    const { contact } = await createContact(client, contactParams)
    return {
      success: true,
      result: {
        contactId: contact.id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        email: contact.email,
        phone: contact.phone,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create contact' }
  }
}

/**
 * Update existing contact
 */
async function handleUpdateContact(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const contactId = params.contact_id as string
  if (!contactId) {
    return { success: false, error: 'contact_id required' }
  }

  const updateParams: Partial<CreateContactParams> = {}
  if (params.first_name) updateParams.firstName = params.first_name as string
  if (params.last_name) updateParams.lastName = params.last_name as string
  if (params.email) updateParams.email = params.email as string
  if (params.phone) updateParams.phone = params.phone as string
  if (params.tags) updateParams.tags = params.tags as string[]

  try {
    const { contact } = await updateContact(client, contactId, updateParams)
    return {
      success: true,
      result: {
        contactId: contact.id,
        updated: true,
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update contact' }
  }
}

/**
 * Get contact details
 */
async function handleGetContact(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  try {
    if (params.contact_id) {
      const { contact } = await getContact(client, params.contact_id as string)
      return { success: true, result: contact }
    }

    if (params.email || params.phone) {
      const { contacts } = await searchContacts(client, {
        email: params.email as string,
        phone: params.phone as string,
        limit: 1,
      })
      if (contacts.length > 0) {
        return { success: true, result: contacts[0] }
      }
      return { success: false, error: 'Contact not found' }
    }

    return { success: false, error: 'Provide contact_id, email, or phone' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get contact' }
  }
}

/**
 * Schedule social media post
 */
async function handleSchedulePost(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const content = params.content as string
  if (!content) {
    return { success: false, error: 'content required' }
  }

  try {
    if (params.scheduled_at) {
      // Specific time scheduling
      const postParams: CreatePostParams = {
        accountIds: params.account_ids as string[] || [],
        content,
        mediaUrls: params.media_urls as string[],
        scheduledAt: params.scheduled_at as string,
      }
      const { post } = await createPost(client, postParams)
      return {
        success: true,
        result: {
          postId: post.id,
          status: post.status,
          scheduledAt: post.scheduledAt,
        },
      }
    } else {
      // Optimal time scheduling
      const { post, scheduledAt } = await schedulePostOptimal(client, {
        accountIds: params.account_ids as string[] || [],
        content,
        mediaUrls: params.media_urls as string[],
        preferredDay: params.preferred_day as 'today' | 'tomorrow' | 'next_week',
        preferredTime: params.preferred_time as 'morning' | 'afternoon' | 'evening',
      })
      return {
        success: true,
        result: {
          postId: post.id,
          status: post.status,
          scheduledAt,
        },
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to schedule post' }
  }
}

/**
 * Create appointment
 */
async function handleCreateAppointment(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const calendarId = params.calendar_id as string
  const contactId = params.contact_id as string

  if (!calendarId || !contactId) {
    return { success: false, error: 'calendar_id and contact_id required' }
  }

  try {
    if (params.start_time && params.end_time) {
      // Specific time
      const { appointment } = await createAppointment(client, {
        calendarId,
        contactId,
        startTime: params.start_time as string,
        endTime: params.end_time as string,
        title: params.title as string,
        notes: params.notes as string,
      })
      return {
        success: true,
        result: {
          appointmentId: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
        },
      }
    } else {
      // Auto-find next available
      const result = await bookNextAvailableSlot(client, calendarId, contactId, {
        preferredDate: params.preferred_date as string,
        title: params.title as string,
        notes: params.notes as string,
        timezone: params.timezone as string,
      })
      if (!result) {
        return { success: false, error: 'No available slots found' }
      }
      return {
        success: true,
        result: {
          appointmentId: result.appointment.id,
          startTime: result.slotUsed.startTime,
          endTime: result.slotUsed.endTime,
        },
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create appointment' }
  }
}

/**
 * Trigger workflow
 */
async function handleTriggerWorkflow(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const contactId = params.contact_id as string
  if (!contactId) {
    return { success: false, error: 'contact_id required' }
  }

  try {
    if (params.workflow_name) {
      const result = await triggerWorkflowByName(client, params.workflow_name as string, contactId)
      return {
        success: result.success,
        result: result.success ? { workflowId: result.workflowId } : undefined,
        error: result.error,
      }
    }

    if (params.event) {
      const result = await triggerWorkflowForEvent(client, params.event as string, contactId)
      return {
        success: result.success,
        result: result.success ? { workflowId: result.workflowId, triggered: result.triggered } : undefined,
      }
    }

    return { success: false, error: 'Provide workflow_name or event' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to trigger workflow' }
  }
}

/**
 * Get conversations
 */
async function handleGetConversations(
  client: GHLClient,
  tenantId: string,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  try {
    const contactId = params.contact_id as string || await getGHLContactId(tenantId)
    const { conversations } = await getConversations(client, {
      contactId: contactId || undefined,
      limit: params.limit as number || 10,
    })
    return {
      success: true,
      result: {
        count: conversations.length,
        conversations: conversations.map(c => ({
          id: c.id,
          lastMessage: c.lastMessageBody,
          lastMessageDate: c.lastMessageDate,
          unreadCount: c.unreadCount,
        })),
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get conversations' }
  }
}

/**
 * Move opportunity/contact in pipeline
 */
async function handleMoveOpportunity(
  client: GHLClient,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const contactId = params.contact_id as string
  if (!contactId) {
    return { success: false, error: 'contact_id required' }
  }

  try {
    if (params.onboarding_stage) {
      const result = await moveToOnboardingStage(
        client,
        contactId,
        params.onboarding_stage as 'DISCOVERY' | 'ACTIVE' | 'POWER_USER'
      )
      return {
        success: result.success,
        result: result.opportunity ? { opportunityId: result.opportunity.id } : undefined,
        error: result.error,
      }
    }

    if (params.retention_status) {
      const result = await updateRetentionStatus(
        client,
        contactId,
        params.retention_status as 'ACTIVE' | 'AT_RISK' | 'CHURNED' | 'RECOVERED'
      )
      return {
        success: result.success,
        result: result.opportunity ? { opportunityId: result.opportunity.id } : undefined,
        error: result.error,
      }
    }

    return { success: false, error: 'Provide onboarding_stage or retention_status' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to move opportunity' }
  }
}

// ============================================
// GET - List available tools
// ============================================

export async function GET() {
  return NextResponse.json({
    tools: [
      {
        name: 'ghl_send_message',
        description: 'Send a message via SMS, Email, WhatsApp, Facebook, or Instagram',
        params: {
          type: 'SMS | Email | WhatsApp | Facebook | Instagram',
          contact_id: 'optional - uses tenant default',
          message: 'required - message content',
          subject: 'optional - for email only',
        },
      },
      {
        name: 'ghl_create_contact',
        description: 'Create a new contact in GHL CRM',
        params: {
          first_name: 'optional',
          last_name: 'optional',
          email: 'optional',
          phone: 'optional',
          company: 'optional',
          tags: 'optional - array of tag names',
        },
      },
      {
        name: 'ghl_update_contact',
        description: 'Update an existing contact',
        params: {
          contact_id: 'required',
          first_name: 'optional',
          last_name: 'optional',
          email: 'optional',
          phone: 'optional',
          tags: 'optional - array of tag names',
        },
      },
      {
        name: 'ghl_get_contact',
        description: 'Get contact details by ID, email, or phone',
        params: {
          contact_id: 'optional',
          email: 'optional',
          phone: 'optional',
        },
      },
      {
        name: 'ghl_schedule_post',
        description: 'Schedule a social media post',
        params: {
          content: 'required - post content',
          account_ids: 'optional - social account IDs',
          media_urls: 'optional - array of media URLs',
          scheduled_at: 'optional - ISO timestamp',
          preferred_day: 'optional - today, tomorrow, next_week',
          preferred_time: 'optional - morning, afternoon, evening',
        },
      },
      {
        name: 'ghl_create_appointment',
        description: 'Book an appointment',
        params: {
          calendar_id: 'required',
          contact_id: 'required',
          start_time: 'optional - ISO timestamp',
          end_time: 'optional - ISO timestamp',
          title: 'optional',
          notes: 'optional',
          preferred_date: 'optional - for auto-scheduling',
          timezone: 'optional',
        },
      },
      {
        name: 'ghl_trigger_workflow',
        description: 'Start a GHL workflow for a contact',
        params: {
          contact_id: 'required',
          workflow_name: 'optional - workflow name',
          event: 'optional - ExoSkull event name',
        },
      },
      {
        name: 'ghl_get_conversations',
        description: 'Get recent conversations',
        params: {
          contact_id: 'optional - uses tenant default',
          limit: 'optional - default 10',
        },
      },
      {
        name: 'ghl_move_opportunity',
        description: 'Move contact in CRM pipeline',
        params: {
          contact_id: 'required',
          onboarding_stage: 'optional - DISCOVERY, ACTIVE, POWER_USER',
          retention_status: 'optional - ACTIVE, AT_RISK, CHURNED, RECOVERED',
        },
      },
    ],
  })
}
