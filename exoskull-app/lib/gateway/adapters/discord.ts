/**
 * Discord Channel Adapter
 *
 * Uses Discord Interactions API (webhook-based, serverless-friendly).
 * Setup: Create Discord Application → Bot → Add to server with message intents.
 *
 * Note: Discord webhook interactions require Ed25519 signature verification
 * and a response within 3 seconds (use deferred for longer processing).
 */

import nodeCrypto from "node:crypto";
import type { ChannelAdapter, GatewayMessage } from "../types";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_API = "https://discord.com/api/v10";

// ============================================================================
// TYPES (Discord API subset)
// ============================================================================

interface DiscordInteraction {
  type: number; // 1=PING, 2=APPLICATION_COMMAND, etc.
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string }>;
  };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
  channel_id?: string;
  guild_id?: string;
  token?: string; // interaction token for follow-up
  id?: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string;
}

/** Message from Discord webhook (for message-based approach) */
interface DiscordWebhookMessage {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    global_name?: string;
    bot?: boolean;
  };
  content: string;
  attachments?: Array<{
    url: string;
    content_type?: string;
    filename: string;
  }>;
  referenced_message?: { id: string };
  guild_id?: string;
}

// ============================================================================
// ADAPTER
// ============================================================================

export const discordAdapter: ChannelAdapter = {
  channel: "discord",

  parseInbound(rawPayload: unknown): GatewayMessage | null {
    // Handle as regular message (from webhook event forwarding)
    const msg = rawPayload as DiscordWebhookMessage;

    if (!msg.content && !msg.attachments?.length) return null;

    // Skip bot messages
    if (msg.author.bot) return null;

    // Determine media
    let mediaUrl: string | undefined;
    let mediaType: GatewayMessage["mediaType"];

    if (msg.attachments && msg.attachments.length > 0) {
      const att = msg.attachments[0];
      mediaUrl = att.url;
      const ct = att.content_type || "";
      if (ct.startsWith("image/")) mediaType = "image";
      else if (ct.startsWith("audio/")) mediaType = "audio";
      else if (ct.startsWith("video/")) mediaType = "video";
      else mediaType = "document";
    }

    return {
      channel: "discord",
      tenantId: "unknown", // resolved by gateway
      from: msg.author.id,
      senderName: msg.author.global_name || msg.author.username,
      text: msg.content || `[${mediaType || "attachment"}]`,
      mediaUrl,
      mediaType,
      replyToId: msg.referenced_message?.id,
      metadata: {
        discord_message_id: msg.id,
        discord_channel_id: msg.channel_id,
        discord_user_id: msg.author.id,
        discord_guild_id: msg.guild_id,
      },
    };
  },

  async sendResponse(
    to: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!DISCORD_BOT_TOKEN) {
      console.error("[Discord] DISCORD_BOT_TOKEN not set");
      return;
    }

    const channelId = (metadata?.discord_channel_id as string) || to;

    // Split long messages (Discord limit: 2000 chars)
    const chunks = splitMessage(text, 2000);

    for (const chunk of chunks) {
      const response = await fetch(
        `${DISCORD_API}/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          },
          body: JSON.stringify({ content: chunk }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        console.error("[Discord] Failed to send message:", {
          channelId,
          status: response.status,
          error,
        });
      }
    }
  },
};

// ============================================================================
// INTERACTION VERIFICATION (Ed25519 via Node crypto)
// ============================================================================

/**
 * Verify Discord interaction signature using Ed25519.
 * Uses Node.js crypto module (same approach as Slack HMAC verification).
 * Required for Interactions Endpoint URL.
 */
export function verifyDiscordSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  if (!DISCORD_PUBLIC_KEY || !signature || !timestamp) return false;

  try {
    const publicKeyBuf = Buffer.from(DISCORD_PUBLIC_KEY, "hex");
    const signatureBuf = Buffer.from(signature, "hex");
    const message = Buffer.from(timestamp + rawBody);

    // Node.js crypto.verify supports Ed25519 natively since Node 15+
    return nodeCrypto.verify(
      null, // Ed25519 doesn't use a separate hash algorithm
      message,
      {
        key: publicKeyBuf,
        format: "der",
        type: "spki",
      },
      signatureBuf,
    );
  } catch {
    // If DER/SPKI format fails, try raw key approach via KeyObject
    try {
      const publicKeyBuf = Buffer.from(DISCORD_PUBLIC_KEY, "hex");
      const signatureBuf = Buffer.from(signature, "hex");
      const message = Buffer.from(timestamp + rawBody);

      // Build Ed25519 public key in DER format manually
      // Ed25519 SPKI prefix (30 2a 30 05 06 03 2b 65 70 03 21 00) + 32-byte raw key
      const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
      const derKey = Buffer.concat([derPrefix, publicKeyBuf]);

      const keyObject = nodeCrypto.createPublicKey({
        key: derKey,
        format: "der",
        type: "spki",
      });

      return nodeCrypto.verify(null, message, keyObject, signatureBuf);
    } catch (error) {
      console.error("[Discord] Signature verification failed:", error);
      return false;
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt < maxLength / 2) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
