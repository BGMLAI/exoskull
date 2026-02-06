/**
 * Unified Message Gateway — Types
 *
 * Defines the common interface for ALL messaging channels.
 * Every channel adapter normalizes to GatewayMessage, and the gateway
 * routes through the full AI pipeline (processUserMessage + 28 tools).
 */

// All supported channels (superset of UnifiedChannel from unified-thread.ts)
export type GatewayChannel =
  | "whatsapp"
  | "telegram"
  | "slack"
  | "discord"
  | "sms"
  | "voice"
  | "email"
  | "messenger"
  | "instagram"
  | "web_chat";

/**
 * Normalized inbound message from any channel.
 * Every adapter converts channel-specific payload → GatewayMessage.
 */
export interface GatewayMessage {
  channel: GatewayChannel;
  tenantId: string;
  from: string; // channel-specific sender ID (phone, chat_id, user_id, etc.)
  senderName?: string;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  replyToId?: string; // for threaded conversations
  metadata: Record<string, unknown>; // channel-specific extras
}

/**
 * Response from the AI pipeline, ready to be sent back via the channel.
 */
export interface GatewayResponse {
  text: string;
  toolsUsed: string[];
  channel: GatewayChannel;
}

/**
 * Channel adapter interface.
 * Each channel (Telegram, Slack, Discord, etc.) implements this.
 */
export interface ChannelAdapter {
  channel: GatewayChannel;

  /** Parse raw webhook payload into normalized GatewayMessage */
  parseInbound(rawPayload: unknown): GatewayMessage | null;

  /** Send a text response back to the user on this channel */
  sendResponse(
    to: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  /** Verify webhook signature (channel-specific) */
  verifyWebhook?(req: Request): boolean | Promise<boolean>;
}

/**
 * Tenant channel identifiers — stored in exo_tenants.
 * Used to resolve tenant from channel-specific sender ID.
 */
export interface TenantChannelIds {
  phone?: string;
  telegram_chat_id?: string;
  slack_user_id?: string;
  discord_user_id?: string;
  email?: string;
  preferred_channel?: GatewayChannel;
}
