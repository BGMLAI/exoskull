/**
 * Gateway Timestamps
 *
 * Based on OpenClaw 2026.2.x - inject timestamps into agent/chat messages
 */

export interface TimestampedMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string  // ISO 8601
  gateway_received_at?: string
  gateway_sent_at?: string
  processing_time_ms?: number
}

/**
 * Add gateway timestamps to a message
 */
export function addGatewayTimestamp<T extends { timestamp?: string }>(
  message: T,
  type: 'received' | 'sent'
): T & { gateway_received_at?: string; gateway_sent_at?: string } {
  const now = new Date().toISOString()

  if (type === 'received') {
    return {
      ...message,
      timestamp: message.timestamp || now,
      gateway_received_at: now
    }
  } else {
    return {
      ...message,
      gateway_sent_at: now
    }
  }
}

/**
 * Calculate processing time between received and sent
 */
export function calculateProcessingTime(
  receivedAt: string,
  sentAt: string
): number {
  const received = new Date(receivedAt).getTime()
  const sent = new Date(sentAt).getTime()
  return sent - received
}

/**
 * Create a timestamped message
 */
export function createTimestampedMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  existingTimestamp?: string
): TimestampedMessage {
  return {
    id: generateMessageId(),
    role,
    content,
    timestamp: existingTimestamp || new Date().toISOString(),
    gateway_received_at: new Date().toISOString()
  }
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string, locale: string = 'pl-PL'): string {
  const date = new Date(isoString)
  return date.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit'
  })
}

/**
 * Check if timestamp is stale (older than threshold)
 */
export function isStaleTimestamp(
  timestamp: string,
  thresholdMs: number = 300000 // 5 minutes
): boolean {
  const messageTime = new Date(timestamp).getTime()
  const now = Date.now()
  return (now - messageTime) > thresholdMs
}
