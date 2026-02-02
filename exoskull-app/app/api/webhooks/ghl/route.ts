/**
 * GHL Webhook Handler
 *
 * Receives webhooks from GoHighLevel for:
 * - Inbound messages (SMS, Email, WhatsApp, FB, IG)
 * - Contact events
 * - Appointment events
 * - Opportunity updates
 * - Form submissions
 *
 * POST /api/webhooks/ghl
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = SupabaseClient<any, 'public', any>

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GHL_WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

// GHL Webhook Event Types
type GHLEventType =
  | 'InboundMessage'
  | 'OutboundMessage'
  | 'ContactCreate'
  | 'ContactUpdate'
  | 'ContactDelete'
  | 'ContactTagUpdate'
  | 'ContactDndUpdate'
  | 'AppointmentCreate'
  | 'AppointmentUpdate'
  | 'AppointmentDelete'
  | 'OpportunityCreate'
  | 'OpportunityUpdate'
  | 'OpportunityDelete'
  | 'OpportunityStageUpdate'
  | 'FormSubmission'
  | 'InvoiceCreate'
  | 'InvoicePaid'
  | 'CallCompleted'
  | 'NoteCreate'
  | 'TaskCreate'

interface GHLWebhookPayload {
  type: GHLEventType
  timestamp: string
  webhookId: string
  locationId: string
  data: Record<string, unknown>
}

/**
 * Verify webhook signature (if configured)
 */
function verifySignature(payload: string, signature: string | null): boolean {
  if (!GHL_WEBHOOK_SECRET || !signature) {
    // Skip verification if not configured
    return true
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', GHL_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-ghl-signature')

    // Verify signature
    if (!verifySignature(rawBody, signature)) {
      console.error('GHL webhook signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse payload
    const payload: GHLWebhookPayload = JSON.parse(rawBody)
    const { type, webhookId, locationId, data } = payload

    console.log(`📥 GHL Webhook: ${type} for location ${locationId}`)

    // Check for duplicate webhook (idempotency)
    const { data: existingWebhook } = await supabase
      .from('exo_ghl_webhook_log')
      .select('id')
      .eq('webhook_id', webhookId)
      .single()

    if (existingWebhook) {
      console.log(`⏭️ Duplicate webhook ${webhookId}, skipping`)
      return NextResponse.json({ status: 'duplicate' })
    }

    // Find tenant by GHL location
    const { data: connection } = await supabase
      .from('exo_ghl_connections')
      .select('tenant_id')
      .eq('location_id', locationId)
      .single()

    const tenantId = connection?.tenant_id

    // Log webhook receipt
    await supabase.from('exo_ghl_webhook_log').insert({
      webhook_id: webhookId,
      event_type: type,
      location_id: locationId,
      tenant_id: tenantId,
      payload: data,
      processed: false,
    })

    // Process based on event type
    let processingResult: Record<string, unknown> = {}

    switch (type) {
      case 'InboundMessage':
        processingResult = await handleInboundMessage(supabase, tenantId, data)
        break

      case 'OutboundMessage':
        processingResult = await handleOutboundMessage(supabase, tenantId, data)
        break

      case 'ContactCreate':
      case 'ContactUpdate':
        processingResult = await handleContactEvent(supabase, tenantId, type, data)
        break

      case 'AppointmentCreate':
      case 'AppointmentUpdate':
        processingResult = await handleAppointmentEvent(supabase, tenantId, type, data)
        break

      case 'OpportunityStageUpdate':
        processingResult = await handleOpportunityStageUpdate(supabase, tenantId, data)
        break

      case 'FormSubmission':
        processingResult = await handleFormSubmission(supabase, tenantId, data)
        break

      default:
        console.log(`Unhandled GHL event type: ${type}`)
    }

    // Mark as processed
    await supabase
      .from('exo_ghl_webhook_log')
      .update({
        processed: true,
        processing_result: processingResult,
        processed_at: new Date().toISOString(),
      })
      .eq('webhook_id', webhookId)

    return NextResponse.json({ status: 'ok', processed: type })
  } catch (error) {
    console.error('GHL webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle inbound message (user sent message via any channel)
 */
async function handleInboundMessage(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const messageData = {
    ghl_message_id: data.messageId as string,
    ghl_conversation_id: data.conversationId as string,
    ghl_contact_id: data.contactId as string,
    direction: 'inbound',
    channel: (data.type as string)?.toLowerCase() || 'sms',
    content: data.body as string,
    tenant_id: tenantId,
    ai_generated: false,
  }

  // Store in GHL messages log
  const { error } = await supabase.from('exo_ghl_messages').insert(messageData)

  if (error) {
    console.error('Failed to store inbound message:', error)
    return { error: error.message }
  }

  // If tenant is connected, we could trigger AI processing here
  if (tenantId) {
    // TODO: Route to AI for response generation
    // This would call the AI processing endpoint
    console.log(`Message from contact ${data.contactId} for tenant ${tenantId}: ${data.body}`)
  }

  return { stored: true, messageId: data.messageId }
}

/**
 * Handle outbound message (system/user sent message)
 */
async function handleOutboundMessage(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const messageData = {
    ghl_message_id: data.messageId as string,
    ghl_conversation_id: data.conversationId as string,
    ghl_contact_id: data.contactId as string,
    direction: 'outbound',
    channel: (data.type as string)?.toLowerCase() || 'sms',
    content: data.body as string,
    tenant_id: tenantId,
    ai_generated: (data.meta as Record<string, unknown>)?.ai_generated === true,
  }

  const { error } = await supabase.from('exo_ghl_messages').insert(messageData)

  if (error) {
    console.error('Failed to store outbound message:', error)
    return { error: error.message }
  }

  return { stored: true, messageId: data.messageId }
}

/**
 * Handle contact create/update
 */
async function handleContactEvent(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  eventType: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!tenantId) {
    return { skipped: true, reason: 'No tenant connected' }
  }

  const contactId = data.id as string
  const locationId = data.locationId as string

  // Upsert contact mapping
  const { error } = await supabase.from('exo_ghl_contacts').upsert(
    {
      tenant_id: tenantId,
      ghl_contact_id: contactId,
      ghl_location_id: locationId,
      synced_at: new Date().toISOString(),
    },
    {
      onConflict: 'tenant_id,ghl_contact_id',
    }
  )

  if (error) {
    console.error('Failed to sync contact:', error)
    return { error: error.message }
  }

  return { synced: true, contactId, eventType }
}

/**
 * Handle appointment create/update
 */
async function handleAppointmentEvent(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  eventType: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!tenantId) {
    return { skipped: true, reason: 'No tenant connected' }
  }

  // Log appointment event
  console.log(`Appointment ${eventType} for tenant ${tenantId}:`, data)

  // TODO: Sync with ExoSkull calendar if needed

  return { processed: true, eventType, appointmentId: data.id }
}

/**
 * Handle opportunity stage update
 */
async function handleOpportunityStageUpdate(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!tenantId) {
    return { skipped: true, reason: 'No tenant connected' }
  }

  const opportunityId = data.id as string
  const newStage = data.pipelineStageId as string
  const contactId = data.contactId as string

  console.log(`Opportunity ${opportunityId} moved to stage ${newStage} for contact ${contactId}`)

  // TODO: Trigger actions based on stage change
  // e.g., if moved to "Churned", trigger re-engagement workflow

  return { processed: true, opportunityId, newStage }
}

/**
 * Handle form submission
 */
async function handleFormSubmission(
  supabase: SupabaseClientType,
  tenantId: string | undefined,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!tenantId) {
    return { skipped: true, reason: 'No tenant connected' }
  }

  const formId = data.formId as string
  const contactId = data.contactId as string
  const formData = data.formData as Record<string, unknown>

  console.log(`Form ${formId} submitted by contact ${contactId}:`, formData)

  // TODO: Process form data based on form type
  // e.g., onboarding form, feedback form, etc.

  return { processed: true, formId, contactId }
}

// ============================================
// Webhook verification endpoint (GET)
// ============================================

export async function GET(request: NextRequest) {
  // GHL may ping this endpoint to verify it's active
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get('challenge')

  if (challenge) {
    return NextResponse.json({ challenge })
  }

  return NextResponse.json({ status: 'GHL webhook endpoint active' })
}
