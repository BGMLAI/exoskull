/**
 * GHL Messaging Library
 *
 * Unified messaging API for all GHL-supported channels:
 * - SMS
 * - Email
 * - WhatsApp
 * - Facebook Messenger
 * - Instagram DMs
 */

import { GHLClient, ghlRateLimiter } from './client'

export type MessageType = 'SMS' | 'Email' | 'WhatsApp' | 'Facebook' | 'Instagram' | 'GMB' | 'Live_Chat'

export interface SendMessageParams {
  type: MessageType
  contactId: string
  message?: string  // Text content
  html?: string     // HTML content (email only)
  subject?: string  // Email subject
  attachments?: string[]  // URLs to attachments
  templateId?: string  // Use template instead of message
  scheduledTimestamp?: number  // Schedule for later (Unix ms)
}

export interface SendMessageResponse {
  conversationId: string
  messageId: string
  status?: string
  dateAdded?: string
}

export interface Conversation {
  id: string
  contactId: string
  locationId: string
  lastMessageBody?: string
  lastMessageDate?: string
  lastMessageType?: string
  lastMessageDirection?: 'inbound' | 'outbound'
  unreadCount?: number
  type?: string
}

export interface Message {
  id: string
  body: string
  conversationId: string
  contentType: string
  dateAdded: string
  direction: 'inbound' | 'outbound'
  status?: string
  messageType: MessageType
  attachments?: string[]
  meta?: Record<string, unknown>
}

/**
 * Send a message via GHL
 */
export async function sendMessage(
  client: GHLClient,
  params: SendMessageParams
): Promise<SendMessageResponse> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()

  const body: Record<string, unknown> = {
    type: params.type,
    contactId: params.contactId,
    locationId,
  }

  // Add message content based on type
  if (params.type === 'Email') {
    if (params.html) {
      body.html = params.html
    }
    if (params.message) {
      body.message = params.message
    }
    if (params.subject) {
      body.subject = params.subject
    }
  } else {
    // SMS, WhatsApp, Facebook, Instagram
    body.message = params.message
  }

  // Add optional fields
  if (params.attachments?.length) {
    body.attachments = params.attachments
  }
  if (params.templateId) {
    body.templateId = params.templateId
  }
  if (params.scheduledTimestamp) {
    body.scheduledTimestamp = params.scheduledTimestamp
  }

  return client.post<SendMessageResponse>('/conversations/messages', body)
}

/**
 * Send SMS
 */
export async function sendSms(
  client: GHLClient,
  contactId: string,
  message: string,
  attachments?: string[]
): Promise<SendMessageResponse> {
  return sendMessage(client, {
    type: 'SMS',
    contactId,
    message,
    attachments,
  })
}

/**
 * Send Email
 */
export async function sendEmail(
  client: GHLClient,
  contactId: string,
  subject: string,
  body: string,
  html?: string,
  attachments?: string[]
): Promise<SendMessageResponse> {
  return sendMessage(client, {
    type: 'Email',
    contactId,
    subject,
    message: body,
    html,
    attachments,
  })
}

/**
 * Send WhatsApp message
 */
export async function sendWhatsApp(
  client: GHLClient,
  contactId: string,
  message: string,
  attachments?: string[]
): Promise<SendMessageResponse> {
  return sendMessage(client, {
    type: 'WhatsApp',
    contactId,
    message,
    attachments,
  })
}

/**
 * Send Facebook Messenger message
 */
export async function sendFacebookMessage(
  client: GHLClient,
  contactId: string,
  message: string,
  attachments?: string[]
): Promise<SendMessageResponse> {
  return sendMessage(client, {
    type: 'Facebook',
    contactId,
    message,
    attachments,
  })
}

/**
 * Send Instagram DM
 */
export async function sendInstagramDm(
  client: GHLClient,
  contactId: string,
  message: string,
  attachments?: string[]
): Promise<SendMessageResponse> {
  return sendMessage(client, {
    type: 'Instagram',
    contactId,
    message,
    attachments,
  })
}

/**
 * Get conversations list
 */
export async function getConversations(
  client: GHLClient,
  params?: {
    contactId?: string
    limit?: number
    startAfterDate?: string
  }
): Promise<{ conversations: Conversation[] }> {
  await ghlRateLimiter.throttle()

  const locationId = client.getLocationId()
  const queryParams: Record<string, string> = {
    locationId,
  }

  if (params?.contactId) queryParams.contactId = params.contactId
  if (params?.limit) queryParams.limit = params.limit.toString()
  if (params?.startAfterDate) queryParams.startAfterDate = params.startAfterDate

  return client.get<{ conversations: Conversation[] }>('/conversations/', queryParams)
}

/**
 * Get conversation by ID
 */
export async function getConversation(
  client: GHLClient,
  conversationId: string
): Promise<{ conversation: Conversation }> {
  await ghlRateLimiter.throttle()
  return client.get<{ conversation: Conversation }>(`/conversations/${conversationId}`)
}

/**
 * Get messages in a conversation
 */
export async function getMessages(
  client: GHLClient,
  conversationId: string,
  params?: {
    limit?: number
    lastMessageId?: string
    type?: MessageType
  }
): Promise<{ messages: Message[]; nextPage?: boolean; lastMessageId?: string }> {
  await ghlRateLimiter.throttle()

  const queryParams: Record<string, string> = {}
  if (params?.limit) queryParams.limit = params.limit.toString()
  if (params?.lastMessageId) queryParams.lastMessageId = params.lastMessageId
  if (params?.type) queryParams.type = params.type

  return client.get<{ messages: Message[]; nextPage?: boolean; lastMessageId?: string }>(
    `/conversations/${conversationId}/messages`,
    queryParams
  )
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  client: GHLClient,
  conversationId: string
): Promise<void> {
  await ghlRateLimiter.throttle()
  await client.put(`/conversations/${conversationId}/messages/status`, {
    unreadCount: 0,
  })
}

/**
 * Get unread count
 */
export async function getUnreadCount(
  client: GHLClient
): Promise<{ unreadCount: number }> {
  await ghlRateLimiter.throttle()
  const locationId = client.getLocationId()
  return client.get<{ unreadCount: number }>('/conversations/unreadCount', { locationId })
}

/**
 * Upload media for attachments
 */
export async function uploadMedia(
  client: GHLClient,
  file: Blob,
  fileName: string
): Promise<{ fileUrl: string }> {
  await ghlRateLimiter.throttle()

  const formData = new FormData()
  formData.append('file', file, fileName)
  formData.append('locationId', client.getLocationId())

  // Custom request for multipart form data
  const response = await fetch('https://services.leadconnectorhq.com/medias/upload', {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type, let browser set it with boundary
  })

  if (!response.ok) {
    throw new Error(`Media upload failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Get channel priority for a contact
 */
export function getPreferredChannel(
  contact: { phone?: string; email?: string; whatsappNumber?: string }
): MessageType {
  // Priority: WhatsApp > SMS > Email
  if (contact.whatsappNumber) return 'WhatsApp'
  if (contact.phone) return 'SMS'
  if (contact.email) return 'Email'
  return 'Email' // Default fallback
}
